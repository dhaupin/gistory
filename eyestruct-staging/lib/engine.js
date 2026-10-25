// The capture ENGINE SEAM - wired. Puppeteer-core drives the PINNED chrome
// exec (never a guessed download). One capture pass = one navigation, one
// render: the element map and the id overlay are collected/injected in the
// SAME page instance before the ONE screenshot, so the map can never drift
// from the pixels it annotates (PRD ruling "one capture, many artifacts").
//
// Exec resolution order (first hit wins, else MISSING_PINNED_BROWSER):
//   1. --browser-exec <path-or-home-rel>  (flag value)
//   2. EYESTRUCT_BROWSER                  (env override)
//   3. pin.browser-exec                   (manifest pin; ~ expands)
//   4. the puppeteer cache this machine already fetched (~/.cache/puppeteer)
//
// Failures are named reason-codes, never stack traces.

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { fail } = require('./reasons')

function findExec({ argv, pin }) {
  const flagIdx = argv.indexOf('--browser-exec')
  const explicit =
    (flagIdx !== -1 && argv[flagIdx + 1]) ||
    readEnvBrowser() ||
    (pin && pin['browser-exec'])
  if (explicit) {
    const resolved = explicit.startsWith('~')
      ? path.join(os.homedir(), explicit.slice(1))
      : explicit
    if (!fs.existsSync(resolved)) fail('MISSING_PINNED_BROWSER', `browser exec not found: ${resolved}`)
    return resolved
  }
  // Cache discovery: the ui:browsers pattern (~/.cache/puppeteer/chrome/...)
  const cacheRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome')
  let dirs = []
  try {
    dirs = fs.readdirSync(cacheRoot).sort()
  } catch {
    fail('MISSING_PINNED_BROWSER', `no --browser-exec, EYESTRUCT_BROWSER, pin.browser-exec, and no puppeteer cache at ${cacheRoot}`)
  }
  for (const dir of dirs.reverse()) { // newest version first
    for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const p = path.join(cacheRoot, dir, rel)
      if (fs.existsSync(p)) return p
    }
  }
  fail('MISSING_PINNED_BROWSER', 'puppeteer cache has no usable chrome exec')
}

function readEnvBrowser() {
  // Read dynamically (no static destructuring) so presence, not a baked-in
  // import, decides behavior.
  return (typeof process !== 'undefined' && process.env && process.env.EYESTRUCT_BROWSER) || null
}

function parseViewport(viewport) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(viewport || '')
  if (!m) fail('BAD_VIEWPORT', `viewport must be WxH, got "${String(viewport)}"`)
  const w = Number(m[1])
  const h = Number(m[2])
  if (w < 240 || h < 200 || w > 4096 || h > 4096) {
    fail('BAD_VIEWPORT', `viewport out of sane range 240..4096: ${w}x${h}`)
  }
  return { width: w, height: h }
}

/**
 * capture({ url, argv, pin, viewport, theme, region }) ->
 *   { png: Buffer, map: [{id, tag, role, rect}], overlay: true, version }
 * map + overlay derive from ONE evaluate on the overlaid DOM (overlay layer
 * is position:fixed, pointer-events:none - layout is untouched, so the pixel
 * evidence and the map come from the same render).
 */
async function capture(opts) {
  const execPath = findExec({ argv: opts.argv || [], pin: opts.pin })
  const view = parseViewport(opts.viewport)
  const theme = opts.theme === 'dark' ? 'dark' : opts.theme === 'light' ? 'light' : null
  if (opts.theme && !theme) fail('BAD_THEME', `theme must be dark|light, got "${opts.theme}"`)
  if (opts.region && opts.region.trim().length > 500) {
    fail('CROP_TOO_BIG', 'region selector over limit; the cheap layer is one element, not a novel')
  }

  let puppeteer
  try {
    puppeteer = require('puppeteer-core')
  } catch (err) {
    fail('MISSING_PINNED_BROWSER', `puppeteer-core not loadable (${err.message})`)
  }

  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: execPath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
      ],
    })
    const page = await browser.newPage()
    await page.setViewport(view)
    if (theme) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }])
    }
    await page.goto(opts.url, { waitUntil: ['load', 'networkidle2'], timeout: 30000 })
    // SPA settle: 'load' fires before React mounts, so a page that renders
    // client-side would be captured as an empty shell. A short fixed settle
    // keeps process-per-look honest (one short invocation, ~1s extra).
    await new Promise((resolve) => setTimeout(resolve, 900))

    // ONE evaluate: measure every [id] element, draw the overlay layer, and
    // return the map the overlay was drawn from. No second render, ever.
    // With a region, the map/overlay cover ONLY elements intersecting the
    // region rect (the cheap layer: one region, one question).
    const { map, count, regionRect } = await page.evaluate((labelLimit, regionSel) => {
      const doc = document.documentElement
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      overlay.id = 'eyestruct-overlay'
      overlay.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647')
      let all = []
      for (const el of document.querySelectorAll('[id]:not(#eyestruct-overlay)')) {
        const r = el.getBoundingClientRect()
        if (!r.width && !r.height) continue
        all.push({
          id: el.id,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || null,
          rect: {
            x: Math.round(r.left + (doc.scrollLeft || 0)),
            y: Math.round(r.top + (doc.scrollTop || 0)),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
          inViewX: r.left + r.width > 0 && r.left < window.innerWidth,
          inViewY: r.top + r.height > 0 && r.top < window.innerHeight,
        })
      }
      let region = null
      if (regionSel) {
        const target = document.querySelector(regionSel)
        if (!target) return { map: [], count: 0, region: null, regionMatched: false }
        const tr = target.getBoundingClientRect()
        region = {
          x: Math.max(0, Math.round(tr.left)),
          y: Math.max(0, Math.round(tr.top)),
          width: Math.round(tr.width),
          height: Math.round(tr.height),
        }
        all = all.filter((e) => {
          const r = e.rect
          const overlapX = Math.min(r.x + r.w, region.x + region.width) > Math.max(r.x, region.x)
          const overlapY = Math.min(r.y + r.h, region.y + region.height) > Math.max(r.y, region.y)
          return overlapX && overlapY
        })
      }
      const out = all
        .filter((e) => { e.inView = e.inViewX && e.inViewY; return e.inView })
        .map(({ inViewX, inViewY, ...rest }) => rest)
      for (const e of out) {
        const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        box.setAttribute('x', e.rect.x)
        box.setAttribute('y', e.rect.y)
        box.setAttribute('width', e.rect.w)
        box.setAttribute('height', e.rect.h)
        box.setAttribute('fill', 'none')
        box.setAttribute('stroke', '#ff2f6d')
        box.setAttribute('stroke-width', '2')
        overlay.appendChild(box)
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        label.setAttribute('x', e.rect.x + 3)
        label.setAttribute('y', e.rect.y + 13)
        label.setAttribute('fill', '#ff2f6d')
        label.setAttribute('font-size', String(labelLimit))
        label.setAttribute('font-weight', 'bold')
        label.setAttribute('font-family', 'monospace')
        label.textContent = '#' + String(e.id).slice(0, 24)
        overlay.appendChild(label)
        if (overlay.children.length > 400) break // context flood guard
      }
      document.body.appendChild(overlay)
      return { map: out, count: out.length, regionRect: region }
    }, 11, opts.region || null)

    const shotOpts = { type: 'png' }
    if (opts.region) {
      if (!regionRect) fail('CROP_TARGET_MISSING', `--region selector matched nothing: ${opts.region}`)
      shotOpts.clip = regionRect
    }
    const png = await page.screenshot(shotOpts)
    let version = null
    try {
      version = await browser.version()
    } catch {}
    await browser.close()
    return { png, map, overlayCount: count, version, exec: execPath }
  } catch (err) {
    if (browser) {
      try { await browser.close() } catch {}
    }
    fail('CAPTURE_BLOCKED', String((err && err.message) || err))
  }
}

module.exports = { capture, findExec, parseViewport }

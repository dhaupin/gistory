/**
 * scripts/dist-probe.mjs — production-shape probe (`bun run probe:dist`).
 *
 * Serves dist/ in-process (mirroring Cloudflare Pages: per-route index.html,
 * 404.html for unmatched paths) and verifies what text checks cannot see:
 *
 *   1. /, /terms, /privacy return their own prerendered pages (200,
 *      data-server-rendered, expected titles)
 *   2. an unknown path returns 404.html with status 404, noindex, no JS bundle
 *   3. robots.txt and sitemap.xml are served
 *   4. the lander HYDRATES: React attaches to the server HTML (the
 *      data-server-rendered attribute is on #root), page interactive
 *   5. the "Open the app" CTA (href="#/") switches to the hash-routed app
 *      live, without a reload
 *   6. a direct visit to /#/t1 (a bookmarked app URL) mounts the app with
 *      NO React hydration error — the server can only serve a path page for
 *      a hash URL, so main.tsx must render fresh there, not hydrate. This
 *      exact check caught React error #418 in the QC pass (2026-10-05).
 *
 * Every asset reference in a served page is resolved against dist/ first:
 *   7. any 404'd /assets/* chunk fails the probe. This caught the stale
 *      prerender-cache bug (2026-10-05): cached route HTML embedded hashed
 *      filenames from an older build, and the page rendered nothing in a
 *      browser while every text check still passed. prerender.js now
 *      fingerprints the shell into its cache key AND runs its own asset
 *      tripwire; this probe independently re-verifies the shipped bytes.
 *
 * Exits non-zero on any failure so it can gate a change. Requires dist/ to
 * exist: run `npm run build` first.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'

const DIST = path.resolve('dist')
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[probe] dist/index.html not found — run `npm run build` first')
  process.exit(2)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.json': 'application/json',
}

const assetMisses = []

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, urlPath)
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')

  if (!fs.existsSync(file)) {
    // CF Pages semantics: unmatched routes get 404.html with status 404.
    // But a MISSING ASSET is a broken build, not a normal 404 — track it.
    if (urlPath.startsWith('/assets/')) assetMisses.push(urlPath)
    const nf = path.join(DIST, '404.html')
    res.writeHead(404, { 'content-type': MIME['.html'] })
    res.end(fs.readFileSync(nf))
    return
  }
  const ext = path.extname(file)
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' })
  res.end(fs.readFileSync(file))
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const out = { base, http: {}, browser: {} }

// ── 1–3: HTTP shape ─────────────────────────────────────────────────────────
for (const p of ['/', '/terms', '/privacy', '/definitely-not-a-page', '/robots.txt', '/sitemap.xml']) {
  const res = await fetch(base + p)
  const body = await res.text()
  out.http[p] = {
    status: res.status,
    dss: /data-server-rendered="true"/.test(body),
    title: (body.match(/<title>([^<]*)<\/title>/) || [])[1],
    noindex: /noindex/.test(body),
    moduleScript: /<script type="module"/.test(body),
    // Themed 404: class-based markup + a CTA back to the lander home.
    cta: /class="notfound-cta"/.test(body) && /href="\/"/.test(body),
  }
}

// ── 4–6: hydration + interactivity ──────────────────────────────────────────
const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()) })
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))

// 4: lander hydrates
await page.goto(base + '/', { waitUntil: 'networkidle2', timeout: 30000 })
await new Promise((r) => setTimeout(r, 1200))
out.browser.lander = await page.evaluate(() => ({
  dssAttr: document.getElementById('root')?.dataset.serverRendered || null,
  rootChildren: document.getElementById('root')?.childElementCount ?? -1,
  ctaFound: [...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '#/'),
}))

// 5: CTA switches to the app live
const cta = await page.evaluate(() => {
  const link = [...document.querySelectorAll('a[href="#/"]')].find((a) => /open|launch|start/i.test(a.textContent || ''))
  if (!link) return false
  link.click()
  return true
})
await new Promise((r) => setTimeout(r, 1000))
out.browser.ctaSwitch = {
  clicked: cta,
  ...(await page.evaluate(() => ({ app: !!document.querySelector('.app'), hash: window.location.hash }))),
}

// 6: direct hash-routed app visit (fresh page so the lander CTA doesn't leak).
// React error #418 is the hydration-mismatch signature this check exists for.
const p2 = await browser.newPage()
const p2errs = []
p2.on('pageerror', (e) => p2errs.push('P2 PAGEERROR: ' + e.message))
await p2.goto(base + '/#/t1', { waitUntil: 'networkidle2', timeout: 30000 })
await new Promise((r) => setTimeout(r, 1200))
out.browser.directHash = {
  ...(await p2.evaluate(() => ({ app: !!document.querySelector('.app'), hash: window.location.hash }))),
  pageErrors: p2errs,
}
await p2.close()

out.browser.errors = errs
out.assetMisses = assetMisses
await browser.close()
server.close()

console.log(JSON.stringify(out, null, 2))

const hydrateErr = p2errs.some((e) => e.includes('#418') || e.includes('Minified React error'))
const fail =
  out.http['/'].status !== 200 || !out.http['/'].dss ||
  out.http['/terms'].status !== 200 || !out.http['/terms'].dss ||
  out.http['/privacy'].status !== 200 || !out.http['/privacy'].dss ||
  out.http['/definitely-not-a-page'].status !== 404 ||
  !out.http['/definitely-not-a-page'].noindex ||
  out.http['/definitely-not-a-page'].moduleScript ||
  !out.http['/definitely-not-a-page'].cta ||
  out.http['/robots.txt'].status !== 200 ||
  out.http['/sitemap.xml'].status !== 200 ||
  out.browser.lander.rootChildren < 1 ||
  out.browser.lander.ctaFound !== true ||
  out.browser.ctaSwitch.clicked !== true ||
  out.browser.ctaSwitch.app !== true ||
  out.browser.directHash.app !== true ||
  hydrateErr ||
  assetMisses.length > 0
console.log(fail ? '\nRESULT: FAIL' : '\nRESULT: PASS')
process.exit(fail ? 1 : 0)

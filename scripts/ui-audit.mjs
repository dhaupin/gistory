#!/usr/bin/env node
// Headless UI audit for Gistory.
//
//   bun run ui:audit                     # against the running preview
//   bun run ui:audit http://localhost:5173
//   bun run ui:audit --filter=settings --soft
//
// Walks every route in both themes and on desktop + mobile, collects:
//   console/page errors, horizontal overflow, off-viewport elements,
//   WCAG-AA contrast, text under 12px, touch targets under 32px,
//   controls without an accessible name, unlabeled inputs,
//   clipped text, duplicate ids, and blank/crashed pages.
//
// Screenshots land in .ui-audit/ (gitignored). Exits non-zero if anything is
// found so it can gate a change; pass --soft to always exit 0.

import fs from 'node:fs'
import path from 'node:path'
import { collectFindings } from './lib/audit-page.mjs'
import {
  SEED,
  clickButtonByText,
  clickSelector,
  launchBrowser,
  resolveBaseUrl,
  settle,
} from './lib/browser.mjs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

const BASE_URL = await resolveBaseUrl(argv)
const SOFT = flag('soft')
const SHOTS = !flag('no-shots')
const FILTER = value('filter')
const OUT = path.resolve(value('out') || '.ui-audit')

const EMPTY_SEED = {
  gistory_sort: 'createdAt_desc',
  gistory_threads: [],
  gistory_messages: {},
  gistory_projects: [],
  gistory_deleted: { threads: {}, messages: {}, projects: {} },
  // The first-run tour is its own state below; without this flag it would sit
  // over every empty state and the boards behind it would go unmeasured.
  gistory_onboarded: '1',
}

// The tour itself: an empty library on its genuine first run.
const ONBOARD_SEED = { ...EMPTY_SEED }
delete ONBOARD_SEED.gistory_onboarded

// The recently-deleted log reads the synced tombstone registry directly, so it
// needs its own fixture: one fresh entry (inside the 90-day window) and one
// ancient one, so the filter and the section counts both render.
const TRASH_SEED = {
  ...SEED,
  gistory_deleted: {
    threads: { 'tGONE-abc': Date.now() - 2 * 24 * 60 * 60 * 1000 },
    messages: { 'mGONE-def': Date.now() - 200 * 24 * 60 * 60 * 1000 },
    projects: {},
  },
}

// A second fixture that reaches the arrangement surfaces the default seed never
// shows: pinned items, a manual order that differs from the natural sort, and
// collapsed groups/messages. Without it the audit only ever measured the
// default (unpinned, expanded) rendering.
const ARRANGED_SEED = (() => {
  const seed = structuredClone(SEED)
  seed.gistory_threads = seed.gistory_threads.map((t) =>
    t.id === 't1' || t.id === 't3' ? { ...t, pinned: true, pinnedAt: t.updatedAt ?? t.createdAt } : t)
  seed.gistory_projects = seed.gistory_projects.map((p) =>
    p.id === 'p2' ? { ...p, pinned: true, pinnedAt: p.createdAt } : p)
  seed.gistory_view = {
    // Ranks deliberately disagree with createdAt order, and some threads are
    // left unranked, so mixed ranked/unranked rendering gets measured too.
    t1: { rank: 1, updatedAt: 1 },
    t3: { rank: 2, updatedAt: 1 },
    t2: { rank: 3, updatedAt: 1 },
    // Collapse keys are namespaced by the surface that owns them (see
    // ThreadView/BurgerMenu): a bare `m2` here would be dead weight and the
    // audit would quietly measure an *expanded* message while claiming to
    // measure a collapsed one.
    m1: { rank: 1, updatedAt: 1 },
    'message:m2': { collapsed: true, updatedAt: 1 },
    'project:p1': { collapsed: true, updatedAt: 1 },
    'section:home-projects': { collapsed: true, updatedAt: 1 },
  }
  return seed
})()

// Each entry is one rendered state. `click` matches a <button> by exact text;
// `clickSelector` matches by CSS. `seed` overrides the default fixture.
const ROUTES = [
  { name: 'home', hash: '#/' },
  { name: 'home-empty', hash: '#/', seed: EMPTY_SEED },
  { name: 'thread', hash: '#/t1' },
  { name: 'thread-empty', hash: '#/t2' },
  { name: 'thread-longname', hash: '#/t4' },
  { name: 'thread-missing', hash: '#/nope' },
  { name: 'projects', hash: '#/projects' },
  { name: 'projects-empty', hash: '#/projects', seed: EMPTY_SEED },
  { name: 'project-detail', hash: '#/project/p1' },
  { name: 'project-detail-empty', hash: '#/project/p3' },
  { name: 'project-detail-missing', hash: '#/project/nope' },
  { name: 'settings-sync', hash: '#/settings' },
  { name: 'settings-sync-empty', hash: '#/settings', seed: EMPTY_SEED },
  { name: 'settings-general', hash: '#/settings', click: 'General' },
  { name: 'settings-devices', hash: '#/settings', click: 'Devices' },
  { name: 'settings-snapshot', hash: '#/settings', click: 'Snapshot' },
  { name: 'settings-bogus-tab', hash: '#/settings/bogus' },
  { name: 'burger-menu', hash: '#/', clickSelector: '.btn-burger' },
  {
    name: 'burger-actions',
    hash: '#/',
    steps: [{ clickSelector: '.btn-burger' }, { clickSelector: '.sidebar .action-menu-trigger' }],
  },
  {
    name: 'confirm-delete',
    hash: '#/',
    steps: [
      { clickSelector: '.btn-burger' },
      { clickSelector: '.sidebar .action-menu-trigger' },
      { click: 'Delete' },
    ],
  },
  { name: 'search-filtered', hash: '#/', type: { selector: '.search-input', text: 'planning' } },
  // First-run tour, recently-deleted log, and the Cmd+K palette.
  { name: 'onboarding', hash: '#/', seed: ONBOARD_SEED },
  { name: 'trash', hash: '#/trash', seed: TRASH_SEED },
  { name: 'palette', hash: '#/', steps: [{ press: 'k', modifier: 'Control' }] },
  {
    name: 'palette-search',
    hash: '#/',
    steps: [
      { press: 'k', modifier: 'Control' },
      { type: { selector: '.palette-input', text: 'sync' } },
    ],
  },
  // Arrangement states: pinned items, custom order, collapsed groups/messages.
  { name: 'home-arranged', hash: '#/', seed: ARRANGED_SEED },
  {
    name: 'home-arranged-filtered',
    hash: '#/',
    seed: ARRANGED_SEED,
    type: { selector: '.search-input', text: 'thread' },
  },
  { name: 'thread-arranged', hash: '#/t1', seed: ARRANGED_SEED },
  { name: 'projects-arranged', hash: '#/projects', seed: ARRANGED_SEED },
  { name: 'project-detail-arranged', hash: '#/project/p1', seed: ARRANGED_SEED },
  { name: 'burger-arranged', hash: '#/', seed: ARRANGED_SEED, clickSelector: '.btn-burger' },
  {
    name: 'burger-arranged-actions',
    hash: '#/',
    seed: ARRANGED_SEED,
    steps: [{ clickSelector: '.btn-burger' }, { clickSelector: '.sidebar .action-menu-trigger' }],
  },
]

const THEMES = [
  { name: 'light', dark: false },
  { name: 'dark', dark: true },
]
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

/** Normalize a route's interaction shorthand into an ordered step list. */
const routeSteps = (route) => {
  const steps = []
  if (route.click) steps.push({ click: route.click })
  if (route.clickSelector) steps.push({ clickSelector: route.clickSelector })
  if (route.type) steps.push({ type: route.type })
  for (const step of route.steps || []) steps.push(step)
  return steps
}

const BUCKETS = [
  'overflowEls',
  'contrast',
  'tinyText',
  'smallTargets',
  'noName',
  'unlabeled',
  'clipped',
  'dupIds',
]

const dedup = (list) => {
  const seen = new Map()
  for (const item of list) {
    const key = item.el + '|' + JSON.stringify({ ...item, el: undefined, combo: undefined })
    if (!seen.has(key)) seen.set(key, { ...item, n: 0 })
    seen.get(key).n++
  }
  return [...seen.values()]
}

const routes = FILTER ? ROUTES.filter((r) => r.name.includes(FILTER)) : ROUTES
if (routes.length === 0) {
  console.error(`No routes match --filter=${FILTER}`)
  process.exit(2)
}

const browser = await launchBrowser()
const bucket = Object.fromEntries(BUCKETS.map((k) => [k, []]))
const crashes = []
const blank = []
const consoleErrors = []
const overflowCombos = []
let gradientSkips = 0
let ellipsisSkips = 0

const planned = THEMES.length * VIEWPORTS.length * routes.length
console.log(`Auditing ${routes.length} states x ${THEMES.length} themes x ${VIEWPORTS.length} viewports = ${planned} passes`)
console.log(`Target: ${BASE_URL}`)
if (SHOTS) console.log(`Screenshots: ${OUT}`)
console.log('')

let done = 0
for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    for (const route of routes) {
      const combo = `${theme.name}/${vp.name}/${route.name}`
      // A fresh context per state: pages in one context share localStorage, so
      // a state that toggles something would otherwise leak into the next one.
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      const errs = []
      page.on('console', (m) => {
        if (m.type() === 'error') errs.push(m.text())
      })
      page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
      page.on('requestfailed', (r) => {
        // The preview is static-only, so /sync is expected to fail there.
        if (!/\/sync(\/|$)/.test(r.url())) errs.push('REQFAIL: ' + r.url())
      })

      try {
        const target = BASE_URL + route.hash
        await page.setViewport({ width: vp.width, height: vp.height })
        await page.evaluateOnNewDocument(
          (data, darkMode) => {
            const all = { ...data, gistory_dark: darkMode ? 'true' : 'false' }
            for (const key of Object.keys(all)) {
              const v = all[key]
              localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v))
            }
          },
          route.seed || SEED,
          theme.dark,
        )
        await page.goto(target, { waitUntil: 'networkidle2', timeout: 60000 })
        for (const step of routeSteps(route)) {
          if (step.click) await clickButtonByText(page, step.click)
          if (step.clickSelector) await clickSelector(page, step.clickSelector)
          if (step.press) {
            await page.keyboard.down(step.modifier || 'Control')
            await page.keyboard.press(step.press)
            await page.keyboard.up(step.modifier || 'Control')
            await settle(page)
          }
          if (step.type) {
            await page.click(step.type.selector)
            await page.type(step.type.selector, step.type.text)
            await settle(page)
          }
        }

        // Did the app actually render?
        const shape = await page.evaluate(() => ({
          app: !!document.querySelector('.app'),
          text: (document.body.innerText || '').trim().length,
          root: (document.getElementById('root')?.childElementCount ?? 0),
        }))
        if (!shape.app || shape.root === 0) crashes.push({ combo, ...shape })
        else if (shape.text < 20) blank.push({ combo, text: shape.text })

        const findings = await page.evaluate(collectFindings)
        if (errs.length) consoleErrors.push({ combo, errs })
        if (findings.overflowX) overflowCombos.push({ combo, docW: findings.docW, vw: findings.vw })
        gradientSkips += findings.gradientSkips
        ellipsisSkips += findings.ellipsisSkips || 0
        for (const key of BUCKETS) {
          for (const item of findings[key]) bucket[key].push({ ...item, combo })
        }

        if (SHOTS) {
          fs.mkdirSync(OUT, { recursive: true })
          await page.screenshot({
            path: path.join(OUT, `${theme.name}-${vp.name}-${route.name}.png`),
            fullPage: true,
          })
        }
      } catch (err) {
        crashes.push({ combo, error: String(err?.message || err) })
      } finally {
        await page.close()
        await context.close().catch(() => {})
      }

      done++
      if (done % 10 === 0) process.stdout.write(`  ...${done}/${planned}\n`)
    }
  }
}
await browser.close()

const show = (title, list, fmt, limit = 14) => {
  console.log(`\n### ${title}  (${list.length} raw)`)
  if (!list.length) {
    console.log('  none')
    return
  }
  for (const item of dedup(list).slice(0, limit)) console.log('  ' + fmt(item))
}

console.log(`\nStates that failed to render: ${crashes.length}`)
for (const c of crashes.slice(0, 10)) console.log('  ' + JSON.stringify(c))
show('Blank / near-empty pages', blank, (i) => `${i.combo} (text ${i.text})`)
console.log(
  '\nCONSOLE/PAGE ERRORS: ' +
    (consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 8), null, 1) : 'none'),
)
console.log(
  'HORIZONTAL OVERFLOW combos: ' + (overflowCombos.length ? JSON.stringify(overflowCombos) : 'none'),
)
show('Elements outside the viewport', bucket.overflowEls, (i) => `${i.el}  [left ${i.left} right ${i.right} vw ${i.vw}]  (${i.combo})`)
show('Contrast below WCAG AA', bucket.contrast, (i) => `${i.ratio} (need ${i.need}) ${i.color} on ${i.bg} @${i.px}px  "${i.sample}"  ${i.el}  (${i.combo})`)
show('Text smaller than 12px', bucket.tinyText, (i) => `${i.px}px "${i.sample}"  ${i.el}  (${i.combo})`)
show('Touch targets under 32px', bucket.smallTargets, (i) => `${i.w}x${i.h}  ${i.el}  (${i.combo})`)
show('Controls with no accessible name', bucket.noName, (i) => `${i.el}  (${i.combo})`)
show('Inputs with no label/placeholder', bucket.unlabeled, (i) => `${i.el}  (${i.combo})`)
show('Clipped / truncated text', bucket.clipped, (i) => `${i.el}  scrollW ${i.scrollW} > clientW ${i.clientW}  "${i.sample}"  (${i.combo})`, 8)
show('Duplicate element ids', bucket.dupIds, (i) => `#${i.id} x${i.count}  (${i.combo})`)

if (gradientSkips) {
  console.log(`\nNote: ${gradientSkips} text nodes skipped for contrast (unknown background over a gradient).`)
}
if (ellipsisSkips) {
  console.log(`Note: ${ellipsisSkips} overflowing text nodes skipped (deliberate text-overflow: ellipsis).`)
}
if (SHOTS) console.log('\nScreenshots: ' + OUT)

const total = crashes.length + blank.length + consoleErrors.length + overflowCombos.length +
  BUCKETS.reduce((sum, k) => sum + bucket[k].length, 0)
console.log(`\nTOTAL FINDINGS: ${total}`)
if (total > 0 && !SOFT) process.exit(1)

#!/usr/bin/env node
// check-docs.mjs — docs consistency gate for docs/ (pre-freestruct).
//
// Three checks, all fail-fast with file+line style errors:
//   1. FRONTMATTER — every page carries the 5 required fields
//      (version, permalink, layout, title, nav_order), non-empty,
//      and permalinks are unique and absolute-pathed.
//   2. NAV        — _data/nav.yml lists each page's deployment URL exactly
//      once, every listed URL resolves to a page permalink, and every page
//      is listed (a page the nav forgets is a page nobody reaches).
//   3. LINKS      — every internal href "/gistory/..." inside a page matches
//      a real page permalink (freestruct --strict also checks broken links
//      post-build; this is the cheap pre-flight that runs everywhere).
//
//   node scripts/check-docs.mjs   (wired as `npm run lint:docs`)

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const docsDir = join(here, '..', 'docs')
const NAV_URL_PREFIX = '/gistory'
const REQUIRED = ['version', 'permalink', 'layout', 'title', 'nav_order']

const errors = []
const err = (file, line, msg) => errors.push(`${relative(process.cwd(), file)}:${line}: ${msg}`)

// ---- collect pages (Markdown files anywhere under docs/, excluding hidden) --
const pages = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.md')) pages.push(full)
  }
}
walk(docsDir)
if (pages.length === 0) {
  console.error('CHECK-DOCS: FAIL — no pages found under docs/')
  process.exit(1)
}

// ---- 1. frontmatter --------------------------------------------------------
const frontmatterOf = {}
for (const file of pages) {
  const src = readFileSync(file, 'utf8')
  if (!src.startsWith('---')) { err(file, 1, 'missing frontmatter block'); continue }
  const end = src.indexOf('---', 3)
  if (end === -1) { err(file, 1, 'unterminated frontmatter block'); continue }
  const head = src.slice(3, end)
  const lines = head.split('\n')
  const map = {}
  lines.forEach((line, i) => {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i)
    if (m) map[m[1]] = { value: m[2].trim(), line: i + 2 }
  })
  for (const field of REQUIRED) {
    if (!map[field] || map[field].value === '') err(file, 1, `frontmatter field "${field}" missing`)
  }
  const permalink = map.permalink?.value
  if (permalink && !/^(\/|https?:)/.test(permalink)) {
    err(file, map.permalink?.line ?? 0, `permalink "${permalink}" must be an absolute path like /getting-started`)
  }
  frontmatterOf[file] = { ...map, _lineOf: (f) => map[f]?.line ?? 1, permalink, title: map.title?.value, _end: end + 4 }
}
const permalinks = new Map()
for (const [file, fm] of Object.entries(frontmatterOf)) {
  if (fm.permalink) {
    if (permalinks.has(fm.permalink)) err(file, fm._lineOf('permalink'), `duplicate permalink ${fm.permalink} (also in ${permalinks.get(fm.permalink)})`)
    permalinks.set(fm.permalink, file)
  }
}

// ---- 2. nav ↔ permalinks ---------------------------------------------------
const navFile = join(docsDir, '_data', 'nav.yml')
if (!existsSync(navFile)) {
  err(navFile, 1, 'missing — the layout reads it, so the docs have no nav')
} else {
  const navUrls = [...readFileSync(navFile, 'utf8').matchAll(/url:\s*(\S+)/g)].map(m => m[1])
  for (const url of navUrls) {
    if (permalinks.has(url)) continue
    if (!url.startsWith(NAV_URL_PREFIX)) {
      err(navFile, 1, `nav URL "${url}" does not start with ${NAV_URL_PREFIX}`)
      continue
    }
    // permalinks stored without the baseurl; nav carries deployment paths.
    const bare = url.replace(NAV_URL_PREFIX, '') || '/'
    const home = bare === '/' ? '/' : bare.replace(/\/$/, '')
    if (!permalinks.has(bare) && !permalinks.has(home)) {
      err(navFile, 1, `nav URL "${url}" has no page (permalink "${bare}" or "${home}" missing)`)
    }
  }
  const listed = new Set(navUrls.map(u => (u === NAV_URL_PREFIX + '/' ? '/' : u.replace(NAV_URL_PREFIX, '').replace(/\/$/, ''))))
  for (const [permalink, file] of permalinks) {
    // Release-draft pages under discussions/ are exempt from nav listing
    // (the prestruct docs pattern: they are copy sources for community
    // announcements, reachable by link; frontmatter + links still checked).
    if (file.includes('/discussions/')) continue
    if (permalink === '/' && listed.has('/')) continue
    if (!listed.has(permalink)) err(file, frontmatterOf[file]._lineOf('permalink'), `page not listed in _data/nav.yml`)
  }
}

// ---- 3. internal links -----------------------------------------------------
// Pages may carry Jekyll escaping ({{ '{{' }}) — strip render directives so
// href checks see what the browser will.
for (const file of pages) {
  const src = readFileSync(file, 'utf8')
  const body = src.replace(/\{\{\s*'\{\{'\s*\}\}|{{ '\{\{'' }}'/g, '{{ ').replace(/\{\{\s*'\}\}'\s*\}\}|{{ '\}\}'' }}'/g, ' }}')
  const hrefs = [...body.matchAll(/\]\((\/[^)#\s]*)[#\s)]?/g)].map(m => m[1])
  for (const href of hrefs) {
    if (!href.startsWith(NAV_URL_PREFIX)) { err(file, 1, `internal link "${href}" should start with ${NAV_URL_PREFIX}`); continue }
    const bare = href.replace(NAV_URL_PREFIX, '') || '/'
    const home = bare === '/' ? '/' : bare.replace(/\/$/, '')
    if (!permalinks.has(bare) && !permalinks.has(home)) err(file, 1, `internal link "${href}" has no page`)
  }
}

if (errors.length) {
  console.error(`CHECK-DOCS: FAIL (${errors.length} error(s))`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}
console.log(`CHECK-DOCS: PASS (${pages.length} pages, frontmatter + nav + links)`)

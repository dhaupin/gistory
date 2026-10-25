// .eyes/manifest.yml - the pin + route matrix. Strict subset of YAML that
// this module writes and reads, so the file stays hand-editable and the
// parser stays deterministic (no schema drift from a third-party YAML lib):
//
//   pin:
//     browser-image: ghcr.io/fleet/pinned-chromium:2026-10
//     renderer: resvg@2.6.2
//   routes:
//     - path: /          view: desktop-1280  theme: dark  viewport: 1280x800
//     - path: /settings  view: desktop-1280  theme: light viewport: 1280x800
//
// Reads: manifest missing -> MISSING_MANIFEST (exit 2); shape wrong ->
// MANIFEST_CORRUPT (exit 2). Captures MUST read the pin and refuse on a pin
// other than the baseline (PIN_MISMATCH, exit 1).

'use strict'

const fs = require('fs')
const path = require('path')
const { fail } = require('./reasons')

function manifestPath(cwd, flags) {
  return path.resolve(cwd, flags.manifest || '.eyes/manifest.yml')
}

function parsePin(text) {
  const pin = {}
  const m = text.match(/^pin:\s*\n((?:\s{2}.+\n?)+)?/m)
  if (m && m[1]) {
    for (const line of m[1].split('\n')) {
      if (!line.trim()) continue
      const kv = line.trim().match(/^([\w-]+):\s*(.+)$/)
      if (!kv) fail('MANIFEST_CORRUPT', `pin row not key: value -> "${line.trim()}"`)
      pin[kv[1]] = kv[2].trim()
    }
  }
  if (!pin['browser-image']) fail('MANIFEST_CORRUPT', 'pin.browser-image is required')
  if (!pin.renderer) fail('MANIFEST_CORRUPT', 'pin.renderer is required')
  return pin
}

function parseRoutes(text) {
  const routes = []
  const idx = text.search(/^routes:/m)
  if (idx === -1) return routes
  const body = text.slice(idx)
  for (const line of body.split('\n').slice(1)) {
    if (!line.trim() || line.startsWith('routes:')) continue
    if (!/^\s{2}-\s/.test(line)) break // first non-route row ends the list
    // Scan key: value pairs directly; spacing is cosmetic, not syntax.
    // (A 2+-space split once made 'theme: light viewport: 1024x768'
    // unreadable when columns happened to be one space apart.)
    const row = {}
    for (const kv of line.trim().slice(2).matchAll(/([\w-]+):\s*(\S+)/g)) {
      row[kv[1]] = kv[2]
    }
    if (!row.path || !row.view || !row.theme || !row.viewport) {
      fail('MANIFEST_CORRUPT', `route row needs path/view/theme/viewport -> "${line.trim()}"`)
    }
    routes.push(row)
  }
  return routes
}

function read(cwd, flags) {
  const file = manifestPath(cwd, flags)
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    fail('MISSING_MANIFEST', file)
  }
  return { file, pin: parsePin(text), routes: parseRoutes(text) }
}

/** Seed-written on `eyestruct init`; hand-editable after. */
function write(cwd, flags, { browserImage, renderer, routes }) {
  const rows = (routes && routes.length ? routes : [
    { path: '/', view: 'desktop-1280', theme: 'dark', viewport: '1280x800' },
  ])
    .map((r) => `  - path: ${r.path}  view: ${r.view}  theme: ${r.theme}  viewport: ${r.viewport}`)
    .join('\n')
  const text =
    `pin:\n  browser-image: ${browserImage || 'UNSET-edit-me'}\n  renderer: ${renderer || 'UNSET-edit-me'}\nroutes:\n${rows}\n`
  const file = manifestPath(cwd, flags)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

module.exports = { manifestPath, read, write }

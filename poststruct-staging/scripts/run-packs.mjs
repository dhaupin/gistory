#!/usr/bin/env node
// The poststruct pack runner - the TEXT leg's own campaign lane, in the
// family shape (zero dependencies, moduleCtx-armed, committed verdict
// ledger). Today it runs one real pack:
//
//   packs/public/eyes-reference/  - the eye companion: every og/twitter
//     image a baked page declares must be REAL pixels the scrapers see
//     (magic bytes, IHDR dims vs declared og:image:width/height, plausible
//     size; SVG refs rasterize through the eyestruct raster gate).
//
// Crashledger semantics on packs/eye-ledger.json: a NEW EXPLOITED fails,
// a verdict change vs a recorded row fails, re-baseline is explicit
// --adopt. Targets the audited site via --dist (default ../gistory dist).

'use strict'

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const LEDGER = path.join(ROOT, 'packs', 'eye-ledger.json')
const PKG = 'poststruct-pack-runner'

const adopt = process.argv.includes('--adopt')
const distIdx = process.argv.indexOf('--dist')

// Resolution order for the audited site: --dist <path>, else
// POSTSTRUCT_DIST (the HOST DECISION env knob - on a standalone checkout the
// honest default is ./dist; the gistory-relative sibling only wins when
// someone audits gistory FROM poststruct, and even there the env knob
// outranks the sibling guess), then the gistory-mount sibling, then ./dist.
const distEnv = process.env.POSTSTRUCT_DIST
const candidates = [
  distIdx !== -1 ? path.resolve(process.cwd(), process.argv[distIdx + 1]) : null,
  distEnv ? path.resolve(distEnv) : null,
  path.resolve(ROOT, '..', 'dist'),
  path.resolve(ROOT, 'dist'),
].filter(Boolean)
const distDir = candidates.find((p) => fs.existsSync(path.join(p, 'index.html')))

// The eyestruct interop resolver: bounded remote refs mirrored to the
// local staging copy (production absolute URLs point at this same repo's
// own card, so a local twin is the deterministic stand-in). A missing twin
// keeps the BOUNDED verdict - an absent mirror must never look like a PASS.
const localTwinRels = new Map([
  ['https://gistory.creadev.org/og-image.png', ['og-image.png', 'public/og-image.png']],
  ['https://docs.creadev.org/gistory/og-image.png', ['../gistory/docs/og-image.png']],
])

// EYESTRUCT_BIN: the raster leg's reference-tool HOST DECISION knob.
// In this mount the sibling staging tree is the reference; once eyestruct
// publishes 0.9.0 the standalone default flips to an npx-resolved path
// with an honest version pin - never a bare `npx eyestruct` (the pin
// discipline the ecosystem carries everywhere else). The env knob
// OUTRANKS the sibling guess so a checkout picks its own truth.
const eyestructBin = process.env.EYESTRUCT_BIN
  ? path.resolve(process.env.EYESTRUCT_BIN)
  : path.resolve(ROOT, '..', 'eyestruct-staging', 'bin', 'eyestruct.js')

function twinBuf(rel) {
  for (const twin of localTwinRels.get(rel) || []) {
    try {
      return fs.readFileSync(path.resolve(ROOT, '..', twin))
    } catch { /* try the next twin candidate */ }
  }
  return null
}

function armModuleCtx() {
  return {
    distDir,
    // Interop: the EYES leg's raster gate is the renderer of record for SVG.
    raster(rel) {
      const abs = path.join(distDir, rel)
      try {
        return { code: 0, out: execFileSync(process.execPath, [eyestructBin, 'raster', abs], { cwd: ROOT, encoding: 'utf8' }) }
      } catch (err) {
        return { code: err.status == null ? 2 : err.status, out: (err.stdout || '') + (err.stderr || '') }
      }
    },
    readdir(rel) {
      try { return fs.readdirSync(path.join(distDir, rel)) } catch { return [] }
    },
    exists(rel) {
      return fs.existsSync(path.join(distDir, rel))
    },
    readBuf(rel) {
      try { return fs.readFileSync(path.join(distDir, rel)) } catch { return null }
    },
    text(rel) {
      try { return fs.readFileSync(path.join(distDir, rel), 'utf8') } catch { return null }
    },
    // Remote og:image refs verify deterministically through a LOCAL twin of
    // the same file (production URLs point at this repo's own card). No
    // twin -> the pack's own docketed BOUNDED, never a fake pass.
    twinLookup(ref) {
      for (const twin of localTwinRels.get(ref) || []) {
        try {
          return { buf: fs.readFileSync(path.resolve(ROOT, '..', twin)), label: twin }
        } catch { /* next twin candidate */ }
      }
      return null
    },
  }
}

function loadLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  } catch {
    return { schemaVersion: 1, rows: [] }
  }
}

function rowKey(row) {
  return `${row.pack}:${row.id}`
}

// Overridable packs root: packstruct's audit-conformance drives the loader
// with a scratch bundle root (SPEC section 7), so a positional non-flag argv
// replaces packs/public. Fixture mode (an audit bundle) has no committed
// ledger and no baked site - the exit contract is the whole claim there.
const packsDirArg = process.argv.slice(2).find((a) => !a.startsWith('-'))
const DEFAULT_PACKS = path.resolve(ROOT, 'packs', 'public')
let packsRoot = DEFAULT_PACKS
let fixtureMode = false
if (packsDirArg) {
  const resolved = path.resolve(packsDirArg)
  const defaultResolved = path.resolve(DEFAULT_PACKS)
  packsRoot = resolved === defaultResolved || fs.existsSync(path.join(resolved, 'public')) ? path.join(resolved, 'public') : resolved
  fixtureMode = resolved !== defaultResolved && path.basename(resolved) !== 'public'
}

if (!fixtureMode && !distDir) {
  console.error(`${PKG}: no baked site found ( tried: ${candidates.map((c) => c || '(null)').join(', ')} ) - bake first; the pack cannot audit what was never built`)
  process.exit(2)
}

function fail(message) {
  console.error(`${PKG}: ${message}`)
  process.exit(2)
}

async function discoverPacks(packsDir) {
  let packs = []
  try {
    packs = fs.readdirSync(packsDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch (err) {
    fail(`${packsDir} is not a readable pack tree: ${err.message}`)
  }
  const loaded = []
  const seenNames = new Set()
  for (const e of packs) {
    const manifest = path.join(packsDir, e.name, 'pack.json')
    let spec
    try {
      spec = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    } catch {
      fail(`packdir ${e.name} has no parseable pack.json - every pack dir must declare itself`)
    }
    // The packstruct@1 grammar (SPEC section 2) at load: same rules the
    // linter reports, enforced before any campaign runs. Refusals name the pack.
    if (typeof spec.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.name)) {
      fail(`pack ${e.name}: manifest "name" must be a kebab-case string (got ${JSON.stringify(spec.name)})`)
    }
    if (spec.name !== e.name) {
      fail(`pack ${e.name}: manifest name "${spec.name}" does not match the directory name`)
    }
    if (seenNames.has(spec.name)) {
      fail(`pack ${e.name}: manifest name "${spec.name}" collides with an earlier pack`)
    }
    seenNames.add(spec.name)
    if (spec.schemaVersion !== 1) {
      fail(`pack ${e.name}: pack.json schemaVersion must be 1 (got ${JSON.stringify(spec.schemaVersion)})`)
    }
    if (typeof spec.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(spec.version)) {
      fail(`pack ${e.name}: "version" must be dotted semver-ish (got ${JSON.stringify(spec.version)})`)
    }
    if (typeof spec.description !== 'string' || !spec.description.trim()) {
      fail(`pack ${e.name}: "description" must be a non-empty string`)
    }
    if (typeof spec.entry !== 'string' || !spec.entry
        || path.isAbsolute(spec.entry) || spec.entry.split('/').includes('..')) {
      fail(`pack ${e.name}: "entry" must be a relative path inside the pack dir (got ${JSON.stringify(spec.entry)})`)
    }
    let loaded2
    try {
      loaded2 = await import(path.join(packsDir, e.name, spec.entry))
    } catch (err) {
      fail(`pack ${e.name}: entry "${spec.entry}" failed to load: ${err.message}`)
    }
    // SPEC section 3: a module with a DEFAULT export. run(ctx) is a campaign
    // concern, not a load concern - the spec's conformance fixtures are inert.
    let module = loaded2
    if (loaded2 && typeof loaded2 === 'object' && 'default' in loaded2) {
      if (loaded2.default == null) fail(`pack ${e.name}: entry "${spec.entry}" has a null default export`)
      module = loaded2.default
    }
    if (!fixtureMode && (!module || typeof module.run !== 'function')) {
      fail(`pack ${e.name}: entry "${spec.entry}" does not export run(ctx) - an armed pack must be runnable`)
    }
    loaded.push({ name: e.name, spec, module })
  }
  if (!loaded.length) fail('no packs found - an unarmed leg must not read as clean')
  return loaded
}

const packs = await discoverPacks(packsRoot)
const ctx = fixtureMode ? null : armModuleCtx()
const allRows = []
let allOk = true
for (const pack of packs) {
  // Fixture-mode entries may be inert (no run) - zero rows from a loaded
  // module is a clean audit, never a crash.
  if (typeof pack.module.run !== 'function') continue
  const result = pack.module.run(ctx)
  allRows.push(...(result.rows || []))
  if (!result.ok) allOk = false
}

let problems = []
const exploited = allRows.filter((r) => r.verdict === 'EXPLOITED')
if (exploited.length) {
  console.log('EXPLOITED case(s) found - the pack failed:')
  for (const row of exploited) {
    console.log(`  ${row.pack ? row.pack + ':' : ''}${row.id} - ${row.detail}`)
  }
} else if (!adopt && !fixtureMode) {
  const ledger = loadLedger()
  const pinned = new Map(ledger.rows.map((r) => [rowKey(r), r]))
  for (const row of allRows) {
    const prev = pinned.get(rowKey(row))
    if (!prev) problems.push(`NEW ${rowKey(row)} -> ${row.verdict} (adopt with: npm run packs -- --adopt)`)
    else if (prev.verdict !== row.verdict) problems.push(`VERDICT DRIFT ${rowKey(row)}: ${prev.verdict} -> ${row.verdict}`)
  }
}

for (const row of allRows) {
  console.log(`  ${String(row.verdict).padEnd(11)} ${row.pack ? row.pack + ':' : ''}${row.id}${row.detail ? ' | ' + row.detail : ''}`)
}
if (adopt && !fixtureMode) {
  const rows = allRows.map((r) => ({ pack: r.pack, id: r.id, verdict: r.verdict }))
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true })
  fs.writeFileSync(LEDGER, JSON.stringify({ schemaVersion: 1, rows }, null, 2) + '\n')
  console.log('pack ledger re-baselined (explicit adopt)')
}
process.exit(exploited.length || problems.length ? 1 : 0)

#!/usr/bin/env node
// The eyestruct pack runner - the family's adversarial campaign against the
// eye daemon, in the crashtest shape:
//
//   - each pack in packs/public/ is armed with moduleCtx vocabulary (the
//     REAL CLI driven as a subprocess, disposable fixture dirs)
//   - verdict taxonomy REFUSED / BOUNDED / PASSED / EXPLOITED
//   - a committed packledger (packs/eye-ledger.json) pins every row id's
//     verdict; the run fails on a NEW EXPLOITED or on a REGRESSION of a
//     previously REFUSED/PASSED row. New refusals/passes are adopted by
//     re-running with --adopt (the same explicit re-baseline rule).
//
// Zero dependencies (crashtest's determinism law); exits 0 green, 1 findings.

'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const BIN = path.join(ROOT, 'bin', 'eyestruct.js')
const PACKS_DIR = path.join(ROOT, 'packs', 'public')
const LEDGER = path.join(ROOT, 'packs', 'eye-ledger.json')
const PKG = 'eyestruct-pack-runner'

function discoverPacks(packsDir) {
  let entries = []
  try {
    entries = fs.readdirSync(packsDir, { withFileTypes: true })
  } catch (err) {
    fail(`${packsDir} is not a readable pack tree: ${err.message}`)
  }
  const packs = []
  const seenNames = new Set()
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const manifest = path.join(packsDir, e.name, 'pack.json')
    let spec
    try {
      spec = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    } catch {
      fail(`packdir ${e.name} has no parseable pack.json - every pack dir must declare itself`)
    }
    // The packstruck@1 grammar (SPEC section 2), enforced AT LOAD - the same
    // rules `packstruct lint --deep` reports, so a pack that fails lint
    // cannot quietly load into a campaign. Every refusal names the pack.
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
    let loaded
    try {
      loaded = require(path.join(packsDir, e.name, spec.entry))
    } catch (err) {
      fail(`pack ${e.name}: entry "${spec.entry}" failed to load: ${err.message}`)
    }
    // SPEC section 3: an entry is a module with a DEFAULT export. ESM
    // entries (the spec's conformance fixtures) arrive under Node 22's
    // require(esm) as a namespace; CJS packs export run(ctx) directly. The
    // default (or the exports object itself) is the bound module; demanding
    // run() is a CAMPAIGN concern, not a load concern - the spec's own
    // conformance fixtures are inert on purpose.
    let module = loaded
    if (loaded && typeof loaded === 'object' && 'default' in loaded) {
      if (loaded.default == null) fail(`pack ${e.name}: entry "${spec.entry}" has a null default export`)
      module = loaded.default
    }
    if (!fixtureMode && (!module || typeof module.run !== 'function')) {
      fail(`pack ${e.name}: entry "${spec.entry}" does not export run(ctx) - an armed pack must be runnable`)
    }
    packs.push({ name: e.name, spec, module })
  }
  if (!packs.length) fail('no packs found - an unarmed eye must not read as clean')
  return packs
}

function armModuleCtx() {
  return {
    run(argv, opts) {
      try {
        return { code: 0, stdout: execFileSync(process.execPath, [BIN, ...argv], { cwd: opts && opts.cwd || ROOT, encoding: 'utf8' }) }
      } catch (err) {
        return { code: err.status == null ? 2 : err.status, stdout: err.stdout || '', stderr: err.stderr || '' }
      }
    },
    tmpdir() {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'eyestruct-pack-'))
    },
    dispose(dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* disposable */ }
    },
    writeFile(dir, rel, text) {
      const file = path.join(dir, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, text)
    },
    read(dir, rel) {
      try { return fs.readFileSync(path.join(dir, rel), 'utf8') } catch { return null }
    },
    bounds: {
      // Documented, docketed accepted risks. An absent bound would be a
      // finding, so every bound here carries owner + reason.
      'browser-class-in-ci': {
        owner: 'eyestruct@0.9.0',
        bound: 'the pack campaign runs browserless for determinism; browser-class attacks are covered live by the behavior test battery (chromium-cached machines) and by the pinned-image lane when eye-ci-gate moves to the crashtest harness',
      },
    },
  }
}

function loadLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  } catch {
    fail(`packledger missing or corrupt at packs/eye-ledger.json`)
  }
}

/**
 * Row identity: the pack + case id, the fixture-irrelevant facts stripped.
 * A row key whose verdict changed is a regression; a key absent from the
 * ledger is new; both fail unless --adopt re-baselines.
 */
function rowKey(row) {
  return `${row.pack}:${row.id}`
}

function compareAgainstLedger(rows, ledger, adopt) {
  const pinned = new Map(ledger.rows.map((r) => [rowKey(r), r]))
  const problems = []
  const seen = new Set()
  for (const row of rows) {
    const key = rowKey(row)
    seen.add(key)
    const prev = pinned.get(key)
    if (!prev) {
      if (adopt) continue
      problems.push(`NEW ${key} -> ${row.verdict}\n         (adopt with: npm run packs -- --adopt)`)
    } else if (row.verdict !== prev.verdict) {
      problems.push(`REGRESSION ${key}: ${prev.verdict} -> ${row.verdict}`)
    }
  }
  const dropped = ledger.rows.filter((r) => !seen.has(rowKey(r))).map(rowKey)
  if (dropped.length && !adopt) problems.push(`RETIRED row(s) no case produces: ${dropped.join(', ')}`)
  return { problems, rows, ledger }
}

function writeLedger(rows) {
  const rowsOut = rows.map((r) => ({ pack: r.pack, id: r.id, verdict: r.verdict, reason: r.reason }))
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true })
  fs.writeFileSync(LEDGER, JSON.stringify({ schemaVersion: 1, rows: rowsOut }, null, 2) + '\n')
}

function fail(message) {
  process.stderr.write(`${PKG}: ${message}\n`)
  process.exit(2)
}

const adopt = process.argv.includes('--adopt')

// Overridable packs root: packstruct's audit-conformance drives the loader
// with a scratch bundle root (SPEC section 7), so a positional non-flag argv
// replaces packs/public. A fixture pack is an AUDIT BUNDLE: no committed
// packledger exists beside it, so fixture mode skips ledger comparison and
// never writes adoption rows - the exit contract (0 named-clean / 1 named
// findings) is everything the audit reads.
const packsDirArg = process.argv.slice(2).find(a => !a.startsWith('-'))
let packsRoot = PACKS_DIR
let fixtureMode = false
if (packsDirArg) {
  const resolved = path.resolve(packsDirArg)
  if (fs.existsSync(path.join(resolved, 'public'))) {
    packsRoot = path.join(resolved, 'public')
    fixtureMode = resolved !== path.dirname(PACKS_DIR)
  } else if (fs.existsSync(path.join(resolved))) {
    packsRoot = resolved
    fixtureMode = resolved !== PACKS_DIR
  } else {
    fail(`packs root does not exist: ${packsDirArg}`)
  }
}

const packs = discoverPacks(packsRoot)
const ctx = armModuleCtx()

const allRows = []
let anyExploited = false
const summary = []
for (const pack of packs) {
  // Fixture-mode entries may be inert (no run) - zero rows from a loaded
  // module is a clean audit, never a crash.
  const result = typeof pack.module.run === 'function' ? pack.module.run(ctx) : { rows: [], ok: true }
  allRows.push(...(result.rows || []))
  for (const row of result.rows) {
    if (row.verdict === 'EXPLOITED') anyExploited = true
  }
  summary.push(`${pack.name}: ${result.ok ? 'ok' : 'FINDINGS'} (${result.rows.length} case(s))`)
}

// Honest ledger comparison (skip while adopting: rows may be new AND the
// tree still finding). Also skipped in fixture mode - an audit bundle has no
// committed ledger to be honest against; the exit contract is the claim.
let problems = []
if (!adopt && !fixtureMode) {
  const ledger = loadLedger()
  const cmp = compareAgainstLedger(allRows, ledger, false)
  problems = cmp.problems
}
if (adopt && !fixtureMode) writeLedger(allRows)

if (anyExploited) {
  process.stdout.write(`\n${summary.join('\n')}\nEXPLOITED case(s) found - the pack failed:\n`)
  for (const row of allRows.filter((r) => r.verdict === 'EXPLOITED')) {
    process.stdout.write(`  ${row.pack}:${row.id} - ${row.error || JSON.stringify(row.got || row.expected)}\n`)
  }
  process.exit(1)
}
if (problems.length) {
  process.stdout.write(`\n${summary.join('\n')}\nPack verdicts drifted from packs/eye-ledger.json:\n`)
  for (const problem of problems) process.stdout.write(`  ${problem}\n`)
  process.exit(1)
}
process.stdout.write(`\n${summary.join('\n')}\npacks: ${allRows.length} case(s), ledger honest, 0 exploited\n`)

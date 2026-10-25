// eyestruct gate - the CI job. Crashledger semantics:
//   exit 0  every committed .eyes/ artifact is explained by a ledger row,
//           and every row references a live artifact on disk
//   exit 1  DANGLING_ROW (row references a missing artifact) or UNRECORDED
//           (artifact without a row) - explained drift is fine, unexplained is not
//   exit 2  capability problems (no manifest, corrupt ledger)
// Pure and browserless: the gate reasons over git state + the ledger, which
// is why it runs in CI with zero captures.

'use strict'

const fs = require('fs')
const path = require('path')
const manifest = require('./manifest')
const ledgerMod = require('./ledger')
const { fail } = require('./reasons')

function run(ctx) {
  const m = manifest.read(ctx.cwd, ctx)
  const ledgerFile = ledgerMod.ledgerPath(ctx.cwd, ctx)
  const rows = ledgerMod.load(ledgerFile)

  const eyesDir = path.dirname(m.file)
  const artifacts = []
  collect(eyesDir, artifacts)
  const visual = artifacts.filter((f) => /\.(png|webp)$/.test(f))

  const byArtifact = ledgerMod.byArtifact(rows)
  const unexplained = visual.filter((f) => !(byArtifact.get(rel(eyesDir, f)) || []).length)
  const dangling = rows.filter((r) => !fs.existsSync(path.join(eyesDir, r.artifact)))

  // Dangling first: canon pointing at nothing is the worse lie.
  if (dangling.length) fail('DANGLING_ROW', `dangling row(s): ${dangling.map((r) => r.id).join(', ')}`)
  if (unexplained.length)
    fail('UNRECORDED', `artifact(s) with no ledger row: ${unexplained.map((f) => rel(eyesDir, f)).join(', ')}`)

  const verdict = `gate: ${visual.length} visual artifact(s) all explained by ${rows.length} ledger row(s); pin ${m.pin['browser-image']}`
  if (ctx.json) process.stdout.write(JSON.stringify({ ok: true, verdict, artifacts: visual.length, rows: rows.length, pin: m.pin }, null, 2) + '\n')
  else process.stdout.write(verdict + '\n')
  return 0
}

function collect(dir, out) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else out.push(p)
  }
}

function rel(eyesDir, f) {
  return path.relative(eyesDir, f).split(path.sep).join('/')
}

module.exports = { run }

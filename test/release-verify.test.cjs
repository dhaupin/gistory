// test/release-verify.test.cjs - the release-verify leg, run OFFLINE on
// every push (the standing receipt eyestruct carries,
// eyestruct@4e2b552 tests/release-verify.test.js). It exercises the SAME
// script the publish lane's verify job runs on the served tarball, so the
// contents assertions are proven every push instead of living only on
// release days (the walk-exit rule: the probe is permanent).
//
// Case 1 (positive): npm pack of THIS tree -> the pack ladder -> PASS. The
//   consumer-install half needs the registry; when offline the script
//   prints a NAMED skip - the leg asserts "no silent skip", not "always
//   network".
// Case 2 (negative, fully offline): a doctored tarball carrying a file
//   under a forbidden prefix (labs/) is refused BY NAME, before any
//   install - a smuggled file can never ship as a mystery.
//
// gistory specifics: the package ships NO bin (a lib only), and dist/lib is
// BUILT, not committed (.gitignore dist/), so the positive case builds the
// lib first - the pack ladder judges the same tree npm publish would mint.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const script = path.join(root, 'scripts', 'verify-release.cjs')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

// gistory's own rules arrive as flags, derived from source - the script
// carries none of them (the generic-core rule): the exports keys pin comes
// from the checkout's package.json, and the engine probe is the frozen
// consumer marker this repo's install must answer.
const exportsKeys = Object.keys(pkg.exports).join(',')
const gsProbe = "const m=require('gistory-sync');for(const n of ['SyncAgent','mergePayload','mergeRegistry','SyncQos','pruneView','emptyVariables'])if(!(n in m))process.exit(1)"

function buildLib() {
  const r = spawnSync('npm', ['run', 'build:lib'], { cwd: root, encoding: 'utf8', timeout: 300000 })
  assert.equal(r.status, 0, `npm run build:lib failed: ${r.stderr}`)
}

function packTree(dest) {
  // npm pack of the repo root: the same files npm publish will include
  // (prepublishOnly is NOT a pack hook - the pack list is judged as one).
  const r = spawnSync('npm', ['pack', '--pack-destination', dest], {
    cwd: root, encoding: 'utf8', timeout: 180000,
  })
  assert.equal(r.status, 0, `npm pack failed: ${r.stderr}`)
  const tgz = path.join(dest, `gistory-sync-${pkg.version}.tgz`)
  assert.ok(fs.existsSync(tgz), `npm pack produced nothing at ${tgz}`)
  return tgz
}

test('the pack ladder verifies real npm pack output (contents + identity + consumer install)', () => {
  buildLib()
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-verify-'))
  const tgz = packTree(work)
  const r = spawnSync('node', [script, '--pack', tgz, '--version', pkg.version, '--exports', exportsKeys, '--probe', gsProbe], { cwd: root, encoding: 'utf8', timeout: 300000 })
  const out = `${r.stdout}\n${r.stderr}`
  assert.equal(r.status, 0, `pack ladder failed (${r.status}):\n${out}`)
  assert.ok(out.includes('PASS forbidden scan'), 'forbidden scan never ran')
  assert.ok(out.includes('PASS served set == npm pack of this tree'), 'expected-set equality never asserted')
  assert.ok(out.includes('PASS identity: gistory-sync@'), 'identity line missing')
  assert.ok(out.includes('PASS exports map held'), 'the exports pin never ran')
  // Either a real consumer PASS or a NAMED skip - a silent absence is not
  // acceptable.
  if (!out.includes('PASS consumer probes')) {
    assert.ok(out.includes('SKIP consumer install'), `no PASS and no named SKIP for the consumer install:\n${out}`)
  }
  fs.rmSync(work, { recursive: true, force: true })
})

test('a doctored tarball is refused BY NAME before any install', () => {
  const toy = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-release-smuggle-'))
  fs.writeFileSync(path.join(toy, 'package.json'), JSON.stringify({ name: 'gistory-sync', version: pkg.version, files: ['package.json'] }, null, 2))
  const r = spawnSync('npm', ['pack', '--pack-destination', toy], { cwd: toy, encoding: 'utf8', timeout: 120000 })
  assert.equal(r.status, 0, `toy npm pack failed: ${r.stderr}`)
  const base = path.join(toy, `gistory-sync-${pkg.version}.tgz`)
  const ex = path.join(toy, 'extracted')
  fs.mkdirSync(ex, { recursive: true })
  assert.equal(spawnSync('tar', ['-xzf', base, '-C', ex], { encoding: 'utf8' }).status, 0)
  fs.mkdirSync(path.join(ex, 'package', 'labs'), { recursive: true })
  fs.writeFileSync(path.join(ex, 'package', 'labs', 'smuggled.txt'), 'must never ship\n')
  const doctored = path.join(toy, 'doctored.tgz')
  assert.equal(spawnSync('tar', ['-czf', doctored, '-C', path.join(ex, 'package'), '.'], { encoding: 'utf8' }).status, 0)
  const rv = spawnSync('node', [script, '--pack', doctored, '--version', pkg.version], { cwd: toy, encoding: 'utf8', timeout: 300000 })
  const out = `${rv.stdout}\n${rv.stderr}`
  assert.equal(rv.status, 1, `the smuggle was not refused (${rv.status}):\n${out}`)
  assert.ok(out.includes('labs/smuggled.txt'), `the refusal does not name the smuggle:\n${out}`)
  fs.rmSync(toy, { recursive: true, force: true })
})

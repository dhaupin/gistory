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
    cwd: root, encoding: 'utf8', timeout: 180000, env: packEnv(),
  })
  assert.equal(r.status, 0, `npm pack failed: ${r.stderr}`)
  const tgz = path.join(dest, `gistory-sync-${pkg.version}.tgz`)
  assert.ok(fs.existsSync(tgz), `npm pack produced nothing at ${tgz}`)
  return tgz
}

// `npm publish --dry-run` exports npm_config_dry_run=true into the lifecycle
// env; a nested `npm pack` would then write no tarball. Strip it so a
// rehearsal verdict equals a real-publish verdict.
function packEnv() {
  const env = { ...process.env }
  delete env.npm_config_dry_run
  return env
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
  const r = spawnSync('npm', ['pack', '--pack-destination', toy], { cwd: toy, encoding: 'utf8', timeout: 120000, env: packEnv() })
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


// ---- the two bugs the crashtest 1.2.0 live cut surfaced ----------------
// Both were real false negatives in the shared ladder (scripts/verify-release.cjs
// + the release job) and are pinned here so a regression fails the battery
// instead of the next release.

test('the release target check accepts a branch-name target_commitish (the 1.2.0 cut bug)', () => {
  // GitHub records `target_commitish` as the default branch NAME (`main`),
  // not a SHA, when a release is cut from an already-pushed tag. Only a
  // 40-hex target is a commit claim; a branch name is not drift.
  const r = spawnSync('node', ['-e', `
    const m = require(${JSON.stringify(script)});
    const ok = [
      m.releaseTargetMatches('main', 'a'.repeat(40)),
      m.releaseTargetMatches('staging', 'a'.repeat(40)),
      m.releaseTargetMatches('', 'a'.repeat(40)),
      m.releaseTargetMatches('a'.repeat(40), 'a'.repeat(40)),
    ];
    const bad = [ m.releaseTargetMatches('b'.repeat(40), 'a'.repeat(40)) ];
    if (!ok.every(Boolean)) { console.error('a branch-name/absent target was rejected'); process.exit(1); }
    if (bad.some(Boolean)) { console.error('a disagreeing 40-hex target was accepted'); process.exit(1); }
    process.stdout.write('ok');
  `], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `releaseTargetMatches misjudged a target: ${r.stderr}`);
  assert.ok(r.stdout.includes('ok'), 'releaseTargetMatches never ran');
});

test('the registry visibility check waits out propagation lag (the 1.2.0 cut bug)', () => {
  // The read replica lagged the publish: the first read saw the old latest.
  // registryHasVersion requires BOTH dist-tags.latest == version AND the
  // version entry - a fresh publish is not visible until both hold.
  const r = spawnSync('node', ['-e', `
    const m = require(${JSON.stringify(script)});
    const v = '1.2.0';
    const lagging = { 'dist-tags': { latest: '1.1.0' }, versions: { '1.1.0': {} } };
    const settled = { 'dist-tags': { latest: v }, versions: { [v]: {}, '1.1.0': {} } };
    const partial = { 'dist-tags': { latest: v }, versions: { '1.1.0': {} } };
    if (m.registryHasVersion(lagging, v)) { console.error('lagging registry judged visible'); process.exit(1); }
    if (m.registryHasVersion(partial, v)) { console.error('version entry absent but judged visible'); process.exit(1); }
    if (!m.registryHasVersion(settled, v)) { console.error('settled registry judged invisible'); process.exit(1); }
    process.stdout.write('ok');
  `], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `registryHasVersion misjudged visibility: ${r.stderr}`);
  assert.ok(r.stdout.includes('ok'), 'registryHasVersion never ran');
});

test('release-notes reads Keep-a-Changelog sections and refuses an absent version', () => {
  // The family changelog is Keep-a-Changelog: a `## [Unreleased]` block over
  // `## [version] - date` sections. The extractor that feeds the GH release
  // body must read that shape and refuse a version with no section by name.
  const notes = path.join(root, 'scripts', 'release-notes.cjs')
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  assert.ok(/^## \[Unreleased\]$/m.test(changelog), 'CHANGELOG.md must carry a "## [Unreleased]" section')
  // An entry above the first "## " heading is unshipped (it lives outside every
  // section): the intro may hold prose, never a "### " subsection.
  const beforeUnreleased = changelog.slice(0, changelog.search(/^## \[Unreleased\]$/m))
  assert.ok(!/^### /m.test(beforeUnreleased), 'no changelog subsection may sit above the "## [Unreleased]" heading')
  const missing = spawnSync('node', [notes, '9.9.9'], { cwd: root, encoding: 'utf8' })
  assert.equal(missing.status, 1, 'release-notes must refuse a version with no changelog section')
  assert.ok(missing.stderr.includes('no "## [9.9.9]" section'), `the refusal names the miss: ${missing.stderr}`)
  if (new RegExp(`^## \\[${pkg.version.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)) {
    const r = spawnSync('node', [notes, pkg.version], { cwd: root, encoding: 'utf8' })
    assert.equal(r.status, 0, `release-notes refused the current version: ${r.stderr}`)
    assert.ok(r.stdout.trim().length > 0, 'release-notes produced an empty section')
  }
});

// Some npm builds (the phone's) answer `npm pack --dry-run --json` with an
// empty stdout - no JSON at all - and print a config warning besides. The
// ladder must not read that as a capability failure: it derives the expected
// set from a REAL `npm pack` (which the served-tarball forbidden scan already
// proved works on this build) instead of parsing the --json probe. This shim
// reproduces the phone and proves a broken --json probe cannot fail a clean
// tree.
test('the pack ladder survives a phone npm whose --dry-run --json probe is empty', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-verify-noisy-'))
  buildLib()
  const tgz = packTree(work)
  const bin = path.join(work, 'bin')
  fs.mkdirSync(bin)
  const realNpm = spawnSync('which', ['npm'], { encoding: 'utf8' }).stdout.trim()
  const shim = path.join(bin, 'npm')
  fs.writeFileSync(shim, [
    '#!/bin/sh',
    'case " $* " in',
    '  *" --dry-run "*)',
    '    echo "npm warn Unknown project config \\"always-auth\\". This will stop working in the next major version of npm."',
    '    exit 0 ;;',
    'esac',
    `exec ${realNpm} "$@"`,
    '',
  ].join('\n'))
  fs.chmodSync(shim, 0o755)
  const r = spawnSync('node', [script, '--pack', tgz, '--version', pkg.version, '--exports', exportsKeys, '--probe', gsProbe], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  })
  const out = `${r.stdout}\n${r.stderr}`
  assert.ok(out.includes('PASS served set == npm pack of this tree'), `the empty --json probe broke the pack ladder:\n${out}`)
  assert.ok(!out.includes('npm pack --dry-run --json failed'), 'an empty --json probe must not be read as a pack failure')
  fs.rmSync(work, { recursive: true, force: true })
});

// `npm publish --dry-run` exports npm_config_dry_run=true, and an unguarded
// nested `npm pack` would then write no tarball and fail here for a reason
// that has nothing to do with the tree. packEnv() strips it; this proves the
// strip is load-bearing (pack still produces a tarball under that env).
test('the pack ladder is dry-run immune (npm_config_dry_run never suppresses the pack)', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-verify-dryrun-'))
  buildLib()
  const prev = process.env.npm_config_dry_run
  process.env.npm_config_dry_run = 'true'
  try {
    const tgz = packTree(work)
    assert.ok(fs.existsSync(tgz), 'the pack still lands with npm_config_dry_run set in the parent env')
  } finally {
    if (prev === undefined) delete process.env.npm_config_dry_run
    else process.env.npm_config_dry_run = prev
    fs.rmSync(work, { recursive: true, force: true })
  }
});


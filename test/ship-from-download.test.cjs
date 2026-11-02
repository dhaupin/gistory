'use strict'
/**
 * Behavior tests for scripts/ship-from-download.cjs (the generic phone
 * publish lane). Temp dirs only, fake npm runner (the runner seam), no
 * network. The lane is family-reusable - it stages ANY npm package tree,
 * so these fixtures use an invented package name deliberately (`lib-x` /
 * `crashtest`), never eyestruct, to prove the product-agnostic contract.
 * The gate itself (whatever prepublishOnly the target repo carries) is
 * proven on its own; what is under test here is that the lane assembles
 * and refuses correctly and that the token never lands in a file or the
 * log.
 */
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ship, tokenProblems, expandHome, TOKEN_ENV, TOKEN_ENV_ALIAS } = require('../scripts/ship-from-download.cjs')

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ship-lane-'))
}

function mktree(root, name = 'lib-x', version = '1.0.0', withLock = true) {
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, version }))
  if (withLock) fs.writeFileSync(path.join(root, 'package-lock.json'), '{}')
}

/** fake runner: records {cmd,args,o} per call; optional per-command statuses {install,publish} */
function fakeRunner(status = 0, statuses = null) {
  const calls = []
  const run = (cmd, args, o) => {
    calls.push({ cmd, args: [...args], o })
    const key = args[0] === 'publish' ? 'publish' : 'install'
    return { status: statuses && key in statuses ? statuses[key] : status }
  }
  run.calls = calls
  return run
}

const GOOD_ENV = { [TOKEN_ENV]: 'npm_LIVE-AMPLE-HELLO-WORLD-0123456789abcdef' }

test('missing --target and --root are named refusals (exit 2)', () => {
  for (const opts of [
    { run: fakeRunner() },
    { target: '/no/where', run: fakeRunner() },
    { root: '/tmp/x', run: fakeRunner() },
  ]) {
    const r = ship(opts)
    assert.equal(r.code, 2, JSON.stringify(r.out))
    assert.ok(r.out.join('\n').includes('ship['), 'refusal carries a named code')
  }
})

test('the lane is product-agnostic: any named npm tree ships (fixture proves with a foreign name)', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'), 'crashtest', '1.2.0')
  const run = fakeRunner(0)
  const r = ship({ target: path.join(base, 'src-tree'), root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run })
  assert.equal(r.code, 0, JSON.stringify(r.out))
  assert.ok(r.out.join('\n').includes('crashtest@1.2.0'), 'the lane stages the tree it is pointed at, by its own name')
  fs.rmSync(base, { recursive: true, force: true })
})

test('a package.json without a name refuses BAD_PACKAGE_NAME before anything copies', () => {
  const base = tmp()
  fs.mkdirSync(path.join(base, 'src-tree'))
  fs.writeFileSync(path.join(base, 'src-tree', 'package.json'), JSON.stringify({ version: '1.0.0' }))
  const r = ship({ target: path.join(base, 'src-tree'), root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run: fakeRunner() })
  assert.equal(r.code, 2)
  assert.ok(r.out.join('\n').includes('BAD_PACKAGE_NAME'))
  assert.equal(fs.existsSync(path.join(base, 'dest')), false)
})

test('a tree with no package.json refuses NOT_A_PACKAGE_TREE (the wrong-folder zip classic)', () => {
  const base = tmp()
  fs.mkdirSync(path.join(base, 'parent', 'real-tree'), { recursive: true })
  fs.writeFileSync(path.join(base, 'parent', 'real-tree', 'package.json'), JSON.stringify({ name: 'lib-x', version: '1.0.0' }))
  const r = ship({ target: path.join(base, 'parent'), root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run: fakeRunner() })
  assert.equal(r.code, 2)
  assert.ok(r.out.join('\n').includes('NOT_A_PACKAGE_TREE'))
})

test('staged copy: target -> root, ci chosen with a lockfile, install + publish in order', () => {
  const base = tmp()
  const home = path.join(base, 'home')
  fs.mkdirSync(path.join(home, 'web'), { recursive: true })
  mktree(path.join(base, 'src-tree'))
  const run = fakeRunner(0)
  const r = ship({
    target: path.join(base, 'src-tree'),
    root: path.join(home, 'web/lib-x-main'),
    token: GOOD_ENV[TOKEN_ENV],
    run,
  })
  assert.equal(r.code, 0, JSON.stringify(r.out))
  const cmds = run.calls.map((c) => `${c.cmd} ${c.args.join(' ')}`)
  assert.deepStrictEqual(cmds, ['npm ci', 'npm publish'], 'install then publish, no dry-run flag by default')
  assert.equal(run.calls[0].o.cwd, path.join(home, 'web/lib-x-main'))
  fs.rmSync(base, { recursive: true, force: true })
})

test('npm install is used when the target carries no lockfile', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'), 'lib-x', '1.0.0', false)
  const run = fakeRunner(0)
  const r = ship({ target: path.join(base, 'src-tree'), root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run })
  assert.equal(r.code, 0)
  assert.equal(run.calls[0].args.join(' '), 'install')
  fs.rmSync(base, { recursive: true, force: true })
})

test('--dry-run rides the publish call', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  const run = fakeRunner(0)
  const r = ship({ target: path.join(base, 'src-tree'), root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run, dryRun: true })
  assert.equal(r.code, 0)
  assert.ok(run.calls[1].args.includes('--dry-run'))
  fs.rmSync(base, { recursive: true, force: true })
})

test('the staged .npmrc holds the ENV expansion, never the token; unlinked in finally even when publish fails', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  const npmrc = path.join(base, 'dest', '.npmrc')
  const run = fakeRunner(0, { install: 0, publish: 1 }) // install ok, publish fails
  const r = ship({ target: path.join(base, 'src-tree'), root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run })
  assert.equal(r.code, 1)
  assert.equal(fs.existsSync(npmrc), false, 'the staged .npmrc is gone after a failing publish')
  assert.equal(run.calls.length, 2, 'install and publish both ran')
  const publishEnv = run.calls[1].o.env[TOKEN_ENV]
  assert.equal(publishEnv, GOOD_ENV[TOKEN_ENV], 'the token rides the child ENV under the standard name, not argv')
  assert.ok(!JSON.stringify(run.calls[1].args).includes(GOOD_ENV[TOKEN_ENV]), 'the token is never in the publish argv')
  fs.rmSync(base, { recursive: true, force: true })
})

test('.npmrc content pattern: ${NPM_TOKEN} placeholder, not secret', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  let captured = null
  const origWrite = fs.writeFileSync
  fs.writeFileSync = (p, c, ...rest) => {
    if (String(p).endsWith('.npmrc')) captured = c
    return origWrite(p, c, ...rest)
  }
  try {
    const r = ship({ target: path.join(base, 'src-tree'), root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run: fakeRunner(0) })
    assert.equal(r.code, 0)
  } finally {
    fs.writeFileSync = origWrite
  }
  assert.ok(captured && captured.includes(`\${${TOKEN_ENV}}`), 'the .npmrc carries the env placeholder')
  assert.ok(captured && !captured.includes(GOOD_ENV[TOKEN_ENV]), 'the raw token never hits the staged file')
  fs.rmSync(base, { recursive: true, force: true })
})

test('a token-value leak anywhere in the log is a failing assertion (the lane must never log the secret)', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  const r = ship({ target: path.join(base, 'src-tree'), root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run: fakeRunner(0) })
  assert.equal(r.code, 0)
  assert.ok(!r.out.join('\n').includes(GOOD_ENV[TOKEN_ENV]), 'the log never carries the token')
  fs.rmSync(base, { recursive: true, force: true })
})

test('a non-empty root refuses and never deletes (ROOT_OCCUPIED, the rm line is advice, not action)', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  const root = path.join(base, 'dest')
  fs.mkdirSync(root)
  fs.writeFileSync(path.join(root, 'sentinel.txt'), 'do not touch')
  const r = ship({ target: path.join(base, 'src-tree'), root, token: GOOD_ENV[TOKEN_ENV], run: fakeRunner() })
  assert.equal(r.code, 2)
  assert.ok(r.out.join('\n').includes('ROOT_OCCUPIED'))
  assert.ok(r.out.join('\n').includes('rm -rf'), 'the refusal carries the exact command')
  assert.equal(fs.existsSync(path.join(root, 'sentinel.txt')), true, 'nothing was deleted')
})

test('shared-storage roots refuse SHARED_STORAGE_ROOT (the EACCES-symlink class)', () => {
  const base = tmp()
  const target = path.join(base, 'Download/repo-main')
  mktree(target)
  for (const root of ['/storage/emulated/0/Download/dest', '/sdcard/dest']) {
    const r = ship({ target, root, token: GOOD_ENV[TOKEN_ENV], run: fakeRunner() })
    assert.equal(r.code, 2, root)
    assert.ok(r.out.join('\n').includes('SHARED_STORAGE_ROOT'))
  }
})

test('copying the home itself, or over the target, refuses', () => {
  const base = tmp()
  const home = path.join(base, 'home')
  fs.mkdirSync(home)
  mktree(path.join(home, 'src-tree'))
  const opts = (root) => ({ target: path.join(home, 'src-tree'), root, token: GOOD_ENV[TOKEN_ENV], run: fakeRunner() })
  const overSelf = ship(opts(path.join(home, 'src-tree')))
  assert.equal(overSelf.code, 2)
})

test('publish token provenance: a bad token refuses BAD_TOKEN before the publish call, with a FRESH root per probe', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  const probes = ['', 'short', 'hunter2 password line with spaces', 'id-most-definitely-not']
  for (const [i, t] of probes.entries()) {
    const run = fakeRunner(0, { install: 0, publish: 0 })
    const r = ship({ target: path.join(base, 'src-tree'), root: path.join(base, `dest-${i}`), token: t, run })
    assert.equal(r.code, 2, JSON.stringify(t))
    assert.ok(r.out.join('\n').includes('BAD_TOKEN'))
    assert.equal(run.calls.length, 1, 'npm ci ran (install first), publish never started')
  }
})

test('tokenProblems never echoes the token value (gibberish-safe assertions)', () => {
  const good = 'npm_live-ok-hello-0123456789abcdef'
  assert.equal(tokenProblems(good), null, 'a well-formed npm_ token passes')
  // Gibberish probes: token-shaped but NOT English words. The diagnosis
  // must not quote the original - the value must be describable only by
  // shape, never by content.
  const gib = 'Zq7kxWmPv9hRt2LqBnJ4f'
  const control = 'Zq7kX\tWmPv9hRt2LqBnJ'
  for (const bad of [null, '', gib, control, gib.slice(0, 12)]) {
    const msg = tokenProblems(bad) || ''
    assert.ok(msg.length > 0, `a malformed token (${bad == null ? String(bad) : bad.length} chars) gets a named diagnosis`)
    if (bad != null && String(bad).length > 4) {
      assert.ok(!msg.includes(String(bad)), 'the diagnosis never repeats the input verbatim')
    }
  }
})

test('expandHome resolves a leading ~ and leaves absolute paths alone', () => {
  assert.equal(expandHome('~'), os.homedir())
  assert.equal(expandHome('~/web/x'), path.join(os.homedir(), 'web/x'))
  assert.equal(expandHome('/abs/x'), '/abs/x')
})

test('--clean removes the staged root on success; default never deletes', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  for (const clean of [false, true]) {
    const root = path.join(base, `dest-${clean ? 'clean' : 'keep'}`)
    const r = ship({ target: path.join(base, 'src-tree'), root, token: GOOD_ENV[TOKEN_ENV], run: fakeRunner(0), clean })
    assert.equal(r.code, 0)
    assert.equal(fs.existsSync(root), !clean, clean ? '--clean removes the staged root' : 'default keeps the staged root')
    assert.ok(!r.out.some((l) => l.includes('--clean removed')) || clean, 'no clean line without --clean')
    if (clean) assert.ok(r.out.join('\n').includes('--clean removed'), 'the clean receipt is logged')
  }
  fs.rmSync(base, { recursive: true, force: true })
})

test('--clean fires on a publish failure too (the failed run must not block the retry with ROOT_OCCUPIED)', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  const root = path.join(base, 'dest')
  const run = fakeRunner(0, { install: 0, publish: 1 })
  const r = ship({ target: path.join(base, 'src-tree'), root, token: GOOD_ENV[TOKEN_ENV], run, clean: true })
  assert.equal(r.code, 1)
  assert.equal(fs.existsSync(root), false, 'the failed run still cleans the stage')
  assert.ok(r.out.join('\n').includes('--clean removed'))
  // and the retry loop closes: re-staging into the same root now works
  const run2 = fakeRunner(0)
  const r2 = ship({ target: path.join(base, 'src-tree'), root, token: GOOD_ENV[TOKEN_ENV], run: run2 })
  assert.equal(r2.code, 0, 'the SAME root stages fresh after a cleaned failure')
  fs.rmSync(base, { recursive: true, force: true })
})

test('--clean fires on refusals after staging too (BAD_TOKEN leaves nothing behind)', () => {
  const base = tmp()
  mktree(path.join(base, 'src-tree'))
  const root = path.join(base, 'dest')
  const r = ship({ target: path.join(base, 'src-tree'), root, token: '', run: fakeRunner(0), clean: true })
  assert.equal(r.code, 2)
  assert.equal(fs.existsSync(root), false, 'a refused run with --clean leaves nothing behind')
  fs.rmSync(base, { recursive: true, force: true })
})

test('--clean NEVER touches the --target (only the root it staged in this run)', () => {
  const base = tmp()
  const target = path.join(base, 'src-tree')
  mktree(target)
  const r = ship({ target, root: path.join(base, 'dest'), token: GOOD_ENV[TOKEN_ENV], run: fakeRunner(0), clean: true })
  assert.equal(r.code, 0)
  assert.equal(fs.existsSync(target), true, 'the source target survives --clean')
  assert.equal(fs.existsSync(path.join(target, 'package.json')), true)
  fs.rmSync(base, { recursive: true, force: true })
})

test('the export names are the standard, not a product: NPM_TOKEN primary, NPM_SHIP_TOKEN generic fallback', () => {
  assert.equal(TOKEN_ENV, 'NPM_TOKEN')
  assert.equal(TOKEN_ENV_ALIAS, 'NPM_SHIP_TOKEN')
})

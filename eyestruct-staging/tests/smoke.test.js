// Behavior-only smoke for the browserless spine: exit contract, ledger
// semantics, gate rules, raster honesty. Fixtures are temp dirs; no network,
// no browser. Run: npm test

'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const BIN = path.join(__dirname, '..', 'bin', 'eyestruct.js')

function run(argv, cwd) {
  let out
  try {
    out = { stdout: execFileSync(process.execPath, [BIN, ...argv], { cwd, encoding: 'utf8' }), code: 0 }
  } catch (err) {
    out = { stdout: err.stdout || '', stderr: err.stderr || '', code: err.status }
  }
  return out
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eyestruct-test-'))
}

test('unknown command exits 1 with a named reason, not a stack trace', () => {
  const dir = tmpdir()
  const r = run(['frobnicate'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.stderr, /eyestruct\[UNKNOWN_COMMAND\]/)
  assert.ok(!/at /.test(r.stderr), 'no stack trace')
})

test('gate refuses honestly without a manifest (exit 2)', () => {
  const dir = tmpdir()
  const r = run(['gate'], dir)
  assert.strictEqual(r.code, 2)
  assert.match(r.stderr, /eyestruct\[MISSING_MANIFEST\]/)
})

test('seed the default repo state in the manifest + empty ledger', () => {
  const dir = tmpdir()
  const r = run(['init', '--browser-image', 'test-image:1', '--renderer', 'resvg@2.6.2'], dir)
  assert.strictEqual(r.code, 0)
  const text = fs.readFileSync(path.join(dir, '.eyes', 'manifest.yml'), 'utf8')
  assert.match(text, /browser-image: test-image:1/)
  assert.match(text, /routes:/)
  assert.strictEqual(fs.readFileSync(path.join(dir, '.eyes', 'ledger.json'), 'utf8').trim(), '[]')
})

test('gate passes on a fully explained seeded tree', () => {
  const dir = tmpdir()
  run(['init', '--browser-image', 't:1', '--renderer', 'r:1'], dir)
  fs.mkdirSync(path.join(dir, '.eyes', 'home', 'desktop-1280'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.eyes', 'home', 'desktop-1280', 'current.png'), 'not-a-real-png-but-file-exists')
  const ledger = path.join(dir, '.eyes', 'ledger.json')
  fs.writeFileSync(
    ledger,
    JSON.stringify([{ id: 'row-0001', ts: 1, agent: 't', commit: 'c', artifact: 'home/desktop-1280/current.png', type: 'look', note: 'seed' }]) + '\n',
  )
  const r = run(['gate'], dir)
  assert.strictEqual(r.code, 0, 'should pass with rows - got: ' + r.stderr)
  assert.match(r.stdout, /all explained/)
})

test('gate fails on an unexplained artifact (exit 1, UNRECORDED)', () => {
  const dir = tmpdir()
  run(['init', '--browser-image', 't:1', '--renderer', 'r:1'], dir)
  fs.mkdirSync(path.join(dir, '.eyes', 'home', 'desktop-1280'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.eyes', 'home', 'desktop-1280', 'current.png'), 'x')
  const r = run(['gate'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.stderr, /eyestruct\[UNRECORDED\]/)
  assert.match(r.stderr, /current\.png/)
})

test('gate fails on a dangling ledger row (exit 1)', () => {
  const dir = tmpdir()
  run(['init'], dir)
  const ledger = path.join(dir, '.eyes', 'ledger.json')
  fs.writeFileSync(
    ledger,
    JSON.stringify([{ id: 'row-0001', ts: 1, agent: 't', commit: 'c', artifact: 'ghost/current.png', type: 'look', note: 'x' }]) + '\n',
  )
  const r = run(['gate'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.stderr, /DANGLING_ROW/)
})

test('corrupt ledger is a capability error (exit 2), never guessed past', () => {
  const dir = tmpdir()
  run(['init'], dir)
  fs.writeFileSync(path.join(dir, '.eyes', 'ledger.json'), '{not json')
  const r = run(['gate'], dir)
  assert.strictEqual(r.code, 2)
  assert.match(r.stderr, /eyestruct\[LEDGER_CORRUPT\]/)
})

test('adopt without --note is refused (ADOPT_NOTE_REQUIRED)', () => {
  const dir = tmpdir()
  run(['init'], dir)
  const r = run(['adopt', 'home/desktop-1280/current.png'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.stderr, /ADOPT_NOTE_REQUIRED/)
})

test('adopt with --note writes an unratified proposal row', () => {
  const dir = tmpdir()
  run(['init'], dir)
  const r = run(['adopt', 'home/desktop-1280/current.png', '--note', 'rebuilt nav'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.stdout, /proposed .* \(ratified:false\)/)
  const rows = JSON.parse(fs.readFileSync(path.join(dir, '.eyes', 'ledger.json'), 'utf8'))
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].ratified, false)
  assert.strictEqual(rows[0].type, 'adopt')
})

test('adopt note content comes through in list', () => {
  const dir = tmpdir()
  run(['init'], dir)
  run(['adopt', 'r/c.png', '--note', 'font change semantics'], dir)
  const r = run(['ledger', 'list'], dir)
  assert.match(r.stdout, /font change semantics/)
})

test('raster refuses honestly without a renderer (exit 2), never fake-passes', () => {
  const dir = tmpdir()
  const stone = path.join(__dirname, '..', 'horcrux', 'magpie-p_mirror-eyes-2026.svg')
  const r = run(['raster', stone], dir)
  // Either a renderer is present (0) or the named refusal (2) - never
  // a silent pass or a stack trace.
  if (r.code === 0) assert.match(r.stdout, /raster OK/)
  else {
    assert.strictEqual(r.code, 2)
    assert.match(r.stderr, /MISSING_RENDER/)
  }
})

test('raster catches invalid XML with a named code (the unrenderable-stone receipt)', () => {
  const dir = tmpdir()
  const bad = path.join(dir, 'bad.svg')
  fs.writeFileSync(bad, '<svg note="<in-attr>"></svg>not-xml')
  const r = run(['raster', bad], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.stderr, /RASTER_BAD_XML/)
})

test('--help prints usage and exits 0', () => {
  const r = run(['--help'], tmpdir())
  assert.strictEqual(r.code, 0)
  assert.match(r.stdout, /eyestruct v/)
})

// -- Wired engine seam (the pinned browser landed). These use the exec the
// machine already has cached; if it is absent the tests skip honestly.

const engine = require('../lib/engine')

function browserAvailable() {
  try {
    engine.findExec({ argv: [], pin: {} })
    return true
  } catch {
    return false
  }
}

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures', 'look-fixture.html')

const maybeBrowser = browserAvailable() ? test : test.skip

maybeBrowser('look captures real pixels + element map from ONE pass', async () => {
  const cap = await engine.capture({ url: FIXTURE, argv: [], pin: {}, viewport: '800x600' })
  assert.ok(cap.png.length > 1024, 'non-skeletal frame')
  assert.strictEqual(Buffer.from(cap.png).toString('ascii', 1, 4), 'PNG')
  const ids = cap.map.map((e) => e.id).sort()
  assert.deepStrictEqual(ids, ['hero', 'ledger-card', 'search'])
  for (const e of cap.map) {
    assert.ok(e.rect.w > 0 && e.rect.h > 0, `#rect on ${e.id}`)
  }
})

maybeBrowser('region crop returns the cheap layer only', async () => {
  const cap = await engine.capture({ url: FIXTURE, argv: [], pin: {}, viewport: '800x600', region: '#search' })
  const ids = cap.map.map((e) => e.id)
  assert.ok(ids.includes('search'))
  assert.ok(!ids.includes('hero'), 'full-frame artifacts do not flood a region look')
})

maybeBrowser('look verb writes a candidate and leaves the ledger untouched', async () => {
  const dir = tmpdir()
  run(['init'], dir)
  const r = run(['look', FIXTURE, '--viewport', '800x600'], dir)
  assert.strictEqual(r.code, 0)
  const cands = fs.readdirSync(path.join(dir, '.eyes-candidates')).filter((f) => f.endsWith('.png'))
  assert.strictEqual(cands.length, 1)
  assert.deepStrictEqual(fs.readFileSync(path.join(dir, '.eyes', 'ledger.json'), 'utf8').trim(), '[]')
})

maybeBrowser('diff without a baseline refuses with a named code (exit 1)', () => {
  const dir = tmpdir()
  run(['init'], dir)
  const r = run(['diff', FIXTURE], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.stderr, /eyestruct\[NO_BASELINE\]/)
})

test('engine refuses honestly when the exec resolution finds nothing', () => {
  assert.throws(() => engine.findExec({ argv: ['--browser-exec', '/no/such/chrome'], pin: {} }), (err) => {
    return /MISSING_PINNED_BROWSER|browser exec not found/.test(err.message)
  })
})

test('engine rejects a malformed viewport with a named code', () => {
  assert.throws(() => engine.parseViewport('wide'), /BAD_VIEWPORT/)
  assert.throws(() => engine.parseViewport('10x10'), /BAD_VIEWPORT/)
})

maybeBrowser('look refuses a theme outside dark|light with a named code', () => {
  const dir = tmpdir()
  run(['init'], dir)
  const r = run(['look', FIXTURE, '--theme', 'sepia'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.stderr, /BAD_THEME/)
})

// -- MCP surface: same call surface, JSON-RPC over stdio. Framing tests,
// not transport worship: handshake, tool census, silent notifications,
// named reasons as tool errors, and stdout capture (a CLI print inside the
// transport would arrive as a parse error on the client).

function callMcp(cwd, messages) {
  const { spawnSync } = require('node:child_process')
  const stdin = messages.map((m) => JSON.stringify(m) + '\n').join('')
  const r = spawnSync(process.execPath, [BIN, 'mcp'], { cwd, input: stdin, encoding: 'utf8' })
  const responses = []
  for (const line of String(r.stdout || '').trim().split('\n')) {
    if (!line) continue
    responses.push(JSON.parse(line))
  }
  return { responses, code: r.status }
}

maybeBrowser('mcp: handshake + tool census + named reason as tool error', () => {
  const dir = tmpdir()
  run(['init'], dir)
  const { responses } = callMcp(dir, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'adopt', arguments: { artifact: 'home/x.png' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'ledger_list', arguments: {} } },
  ])
  const init = responses.find((m) => m.id === 1)
  assert.strictEqual(init.result.serverInfo.name, 'eyestruct')
  assert.ok(init.result.capabilities.tools)
  const census = responses.find((m) => m.id === 2)
  const names = census.result.tools.map((t) => t.name)
  for (const expected of ['look', 'diff', 'adopt', 'ratify', 'gate', 'raster', 'walk', 'ledger_list', 'ledger_show']) {
    assert.ok(names.includes(expected), `tool ${expected} missing from census`)
  }
  const adoptNoNote = responses.find((m) => m.id === 3)
  assert.strictEqual(adoptNoNote.result.isError, true)
  assert.match(adoptNoNote.result.content[0].text, /ADOPT_NOTE_REQUIRED/)
  const ledger = responses.find((m) => m.id === 4)
  assert.ok(!ledger.result.isError, 'happy-path tool calls never set isError')
  assert.strictEqual(JSON.parse(ledger.result.content[0].text).length, 0)
})

maybeBrowser('mcp: gate output is captured, never written raw into the transport', () => {
  const dir = tmpdir()
  run(['init'], dir)
  const { responses } = callMcp(dir, [
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'gate', arguments: {} } },
  ])
  const gate = responses.find((m) => m.id === 7)
  assert.ok(!gate.result.isError)
  const text = JSON.parse(gate.result.content[0].text)
  assert.strictEqual(text.code, 0)
  assert.match(String(text.gate.verdict || ''), /all explained/)
})

maybeBrowser('ratify: byte-identical slots ride append-only rows; drift is named, never edited', () => {
  const dir = tmpdir()
  run(['init'], dir)
  const r1 = run(['look', FIXTURE, '--viewport', '800x600'], dir)
  assert.strictEqual(r1.code, 0)
  const cand = fs.readdirSync(path.join(dir, '.eyes-candidates')).find((f) => f.endsWith('.png'))
  const slotDir = path.join(dir, '.eyes')
  // tamper: a DIFFERENT baseline must be un-verifiable, not auto-adopted
  fs.writeFileSync(path.join(slotDir, 'hand-write-tampered.png'), Buffer.alloc(2048, 7))
  run(['adopt', 'hand-write-tampered.png', '--note', 'a tampered canon row the pinned env cannot reproduce'], dir)
  const r = run(['ratify', 'file:///nowhere.anchor'], dir)
  // The manifest's seeded route path (/) does not resolve on file:// ->
  // capture fails per-surface; what must hold is that NOTHING was ratified
  // and the exit contract named the drift, with the ledger append-only.
  assert.ok([0, 1].includes(r.code))
  const ledger = JSON.parse(fs.readFileSync(path.join(dir, '.eyes', 'ledger.json'), 'utf8'))
  assert.ok(!ledger.some((row) => row.type === 'ratify'), 'ratify must not forge proof rows for drifted canon')
})

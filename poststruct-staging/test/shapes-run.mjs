#!/usr/bin/env node
// test/shapes-run.mjs - the eyestruct-shapes negative test is permanent:
// the good canon must be clean (zero EXPLOITED) and each bad canon must
// produce EXACTLY the expected EXPLOITED check id. If a refactor deletes a
// check, this fails. The fixtures are SCAFFOLDED, not committed: the
// battery builds the good canon in a temp dir and derives each bad
// fixture from it with one honest mutation (poststruct#19) - so the pack's
// refusal surface has a permanent negative test with zero fixture bytes
// to transport.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pack from '../packs/public/eyestruct-shapes/index.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'eyes-shapes-'))
const SHAPES = path.join(BASE, 'fixtures')

// A repo-tree fsapi over one fixture dir - the same contract the runner
// arms as moduleCtx.eyestructTree.
function treeFs(root) {
  const safe = (rel) => (typeof rel === 'string' && !rel.startsWith('/') && !rel.split(/[\\/]/).includes('..') ? rel : null)
  return {
    root,
    exists: (rel) => { const r = safe(rel); return r != null && fs.existsSync(path.join(root, r)) },
    read: (rel) => { const r = safe(rel); try { return r == null ? null : fs.readFileSync(path.join(root, r), 'utf8') } catch { return null } },
    readBuf: (rel) => { const r = safe(rel); try { return r == null ? null : fs.readFileSync(path.join(root, r)) } catch { return null } },
    readdir: (rel) => { const r = safe(rel); try { return r == null ? [] : fs.readdirSync(path.join(root, r)) } catch { return [] } },
  }
}

function scaffoldGoodCanon(root) {
  fs.mkdirSync(path.join(root, 'labs/.eyes/home/desktop-1280-dark'), { recursive: true })
  fs.mkdirSync(path.join(root, 'labs/.eyes-receipt'), { recursive: true })
  fs.mkdirSync(path.join(root, 'packs/public/first-pack'), { recursive: true })
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'labs/.eyes/manifest.yml'), [
    'pin:',
    '  browser-image: local-chrome@154.0.8037.57',
    '  renderer: resvg@2.6.2',
    'routes:',
    '  - path: /          view: desktop-1280-dark  theme: dark  viewport: 1280x800',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'labs/.eyes/home/desktop-1280-dark/current.png'), 'PLACEHOLDER-BASELINE-BYTES ')
  fs.writeFileSync(path.join(root, 'labs/.eyes/ledger.json'), JSON.stringify([{
    type: 'adopt', agent: 'fixture-agent', commit: 'uncommitted',
    artifact: 'home/desktop-1280-dark/current.png',
    note: 'fixture baseline: one route, honest pointers',
    ratified: false, id: 'row-0001', ts: 1792955330979,
  }], null, 2) + '\n')
  fs.writeFileSync(path.join(root, 'labs/.eyes-receipt/caught.png'), 'PLACEHOLDER-RECEIPT-FRAME ')
  fs.writeFileSync(path.join(root, 'labs/.eyes-receipt/ledger.json'), JSON.stringify([{
    type: 'adopt', agent: 'fixture-agent', commit: 'uncommitted',
    artifact: 'caught.png',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    note: 'receipt frame with an honest digest',
    ratified: false, id: 'row-0001', ts: 1793099528549,
  }], null, 2) + '\n')
  fs.writeFileSync(path.join(root, 'packs/public/first-pack/pack.json'), JSON.stringify({
    schemaVersion: 1, name: 'first-pack',
    description: 'fixture pack for the shapes battery',
    version: '0.1.0', entry: 'index.mjs',
    env: { fs: { targets: [] } },
  }, null, 2) + '\n')
  fs.writeFileSync(path.join(root, 'packs/eye-ledger.json'), JSON.stringify({
    schemaVersion: 1,
    rows: [{ pack: 'first-pack', id: 'fixture-row', verdict: 'PASSED' }],
  }, null, 2) + '\n')
  fs.writeFileSync(path.join(root, 'lib/reasons.js'), [
    'const CODES = {',
    '  MISSING_MANIFEST: 2,',
    '  DANGLING_ROW: 1,',
    '  UNSAFE_TEXT: 1,',
    '}',
    "const REASONS = {}",
    'module.exports = { CODES, REASONS }',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'docs/reasons.md'), [
    '# Reason codes',
    '',
    '| code | one-line meaning |',
    '|--------|--------------------|',
    '| `MISSING_MANIFEST` | no manifest on this fixture tree |',
    '| `DANGLING_ROW` | a pointer resolved to nothing |',
    '| `UNSAFE_TEXT` | a control character in a row string |',
    '',
  ].join('\n'))
  return root
}

// the good canon, plus one canon-free dir (no labs surface at all)
const GOOD = scaffoldGoodCanon(path.join(SHAPES, 'good-canon'))
fs.mkdirSync(path.join(SHAPES, 'canon-free/src'), { recursive: true })

// one honest mutation per bad fixture, derived from a fresh good canon
function derive(name, mutate) {
  const dir = path.join(SHAPES, name)
  scaffoldGoodCanon(dir)
  mutate(dir)
  return dir
}

const bads = [
  derive('bad-ledger-corrupt', (d) => fs.writeFileSync(path.join(d, 'labs/.eyes/ledger.json'), 'not json at all')),
  derive('bad-dangling', (d) => {
    fs.rmSync(path.join(d, 'labs/.eyes/home/desktop-1280-dark/current.png'))
  }),
  derive('bad-unsafe-path', (d) => {
    const p = path.join(d, 'labs/.eyes/ledger.json')
    const rows = JSON.parse(fs.readFileSync(p, 'utf8'))
    rows[0].artifact = '../receipt-frame-that-escaped.png'
    fs.writeFileSync(p, JSON.stringify(rows, null, 2) + '\n')
  }),
  derive('bad-manifest', (d) => {
    const p = path.join(d, 'labs/.eyes/manifest.yml')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('  renderer: resvg@2.6.2\n', ''))
  }),
  derive('bad-loose-pin', (d) => {
    const p = path.join(d, 'labs/.eyes/manifest.yml')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('local-chrome@154.0.8037.57', 'whatever-the-runner-finds'))
  }),
  derive('bad-theme', (d) => {
    const p = path.join(d, 'labs/.eyes/manifest.yml')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('theme: dark', 'theme: midnight'))
  }),
  derive('bad-notes', (d) => {
    const p = path.join(d, 'labs/.eyes/ledger.json')
    const rows = JSON.parse(fs.readFileSync(p, 'utf8'))
    rows[0].note = 'fixture baseline with a \u0001 poisoned slot'
    fs.writeFileSync(p, JSON.stringify(rows, null, 2) + '\n')
  }),
  derive('bad-receipt-sha', (d) => {
    const p = path.join(d, 'labs/.eyes-receipt/ledger.json')
    const rows = JSON.parse(fs.readFileSync(p, 'utf8'))
    rows[0].sha256 = 'deadbeef'
    fs.writeFileSync(p, JSON.stringify(rows, null, 2) + '\n')
  }),
  derive('bad-verdict-covers', (d) => {
    fs.mkdirSync(path.join(d, 'packs/public/ghost-pack'), { recursive: true })
    fs.writeFileSync(path.join(d, 'packs/public/ghost-pack/pack.json'), JSON.stringify({
      schemaVersion: 1, name: 'ghost-pack',
      description: 'exported but uncovered by the verdict baseline',
      version: '0.1.0', entry: 'index.mjs',
      env: { fs: { targets: [] } },
    }, null, 2) + '\n')
  }),
  derive('bad-reason-table', (d) => {
    const p = path.join(d, 'docs/reasons.md')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('UNSAFE_TEXT', 'GHOST_CODE'))
  }),
]

const fails = []
const assert = (cond, label) => { if (!cond) fails.push(label) }

// 1. run-level contracts: missing tree docketed, canon-free tree docketed,
//    un-armed runner context refused loudly (the REFUSED class).
{
  const out1 = pack.run({ eyestructTree: { root: null } })
  assert(out1.ok === true, 'null tree: canon-absent docket stays ok (a bounded audit is not a failure)')
  assert(out1.rows.length === 1 && out1.rows[0].id === 'eyes/canon-absent' && out1.rows[0].verdict === 'BOUNDED', 'null tree: exactly one canon-absent BOUNDED row')
  const out2 = pack.run({ eyestructTree: treeFs(path.join(SHAPES, 'canon-free')) })
  assert(out2.ok === true && out2.rows[0]?.id === 'eyes/canon-absent', 'canon-free tree: docketed, not audited, not faked')
  let refused = false
  try { pack.run({}) } catch (err) {
    refused = err instanceof TypeError && /missing/.test(err.message)
  }
  assert(refused, 'un-armed context: run refuses loudly (TypeError, module contract)')
}

// 2. the good canon fixture is clean across all seven checks.
{
  const out = pack.run({ eyestructTree: treeFs(GOOD) })
  const bad = out.rows.filter((r) => r.verdict === 'EXPLOITED')
  assert(bad.length === 0, `good canon: zero EXPLOITED (got ${JSON.stringify(bad)})`)
  const ids = new Set(out.rows.map((r) => r.id))
  for (const id of [
    'eyes/manifest-pin-drift', 'eyes/ledger-corrupt', 'eyes/dangling-canon',
    'eyes/receipt-provenance', 'eyes/verdict-count-drift',
    'eyes/reason-table-drift', 'eyes/note-unsafety',
  ]) assert(ids.has(id), `good canon: check ${id} produced a row`)
}

// 3. each bad canon must hit EXACTLY its expected id (no missing, no bleed).
const cases = [
  ['bad-ledger-corrupt', 'eyes/ledger-corrupt', 'not parseable JSON -> LEDGER_CORRUPT refused'],
  ['bad-dangling', 'eyes/dangling-canon', 'row artifact resolves to nothing -> DANGLING_ROW refused'],
  ['bad-unsafe-path', 'eyes/dangling-canon', 'row artifact carries a .. escape -> UNSAFE_PATH refused'],
  ['bad-manifest', 'eyes/manifest-pin-drift', 'pin.renderer missing -> MANIFEST_CORRUPT refused'],
  ['bad-loose-pin', 'eyes/manifest-pin-drift', 'pin value is free text, not a pinned image/bundle ref -> refused'],
  ['bad-theme', 'eyes/manifest-pin-drift', 'route theme not dark|light -> BAD_THEME refused'],
  ['bad-notes', 'eyes/note-unsafety', 'note carries a control character -> UNSAFE_TEXT read-side refused'],
  ['bad-receipt-sha', 'eyes/receipt-provenance', 'sha256 field not 64-hex -> refused'],
  ['bad-verdict-covers', 'eyes/verdict-count-drift', 'exported pack with no baseline rows -> claimed counts disagree'],
  ['bad-reason-table', 'eyes/reason-table-drift', 'docs table promises a code the lib does not ship -> refused'],
]
for (const [name, id, label] of cases) {
  const out = pack.run({ eyestructTree: treeFs(path.join(SHAPES, name)) })
  assert(out.rows.length > 0, `${name}: the harness must produce rows (empty verdicts = neither green nor refused)`)
  const hit = out.rows.find((r) => r.id === id && r.verdict === 'EXPLOITED')
  assert(hit, `${name}: ${label} (got ${JSON.stringify(out.rows.map((r) => `${r.id}=${r.verdict}`))})`)
  const others = out.rows.filter((r) => r.verdict === 'EXPLOITED' && r.id !== id)
  assert(others.length === 0, `${name}: no cross-check bleed (got ${JSON.stringify(others)})`)
}

fs.rmSync(BASE, { recursive: true, force: true })
if (fails.length) {
  console.error(`eyestruct-shapes self-test FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`eyestruct-shapes self-test: docket levels + good canon 7/7 + ${cases.length}/${cases.length} bad canons exact - PASS`)
process.exit(0)

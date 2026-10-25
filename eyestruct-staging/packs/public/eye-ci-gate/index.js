// eye-ci-gate - the crashledger-semantics verifier for any repo's .eyes/ gate.
// Run by whatever harness pulls the pack (eyestruct's runner today, the
// crashtest harness when its lane lands): it builds disposable fixture repos,
// attacks the gate, and judges ONLY by the exit contract.
//
// THE CONTRACT with the target (moduleCtx['eye-ci-gate']):
//   run(argv, cwdOption) -> { code, stdout, stderr } of the real CLI
//   tmpdir() / writeFile(dir, rel, text)
//
// The gate under test is whatever `run` resolves - any struct-leg repo that
// implements the eye gate contract passes this pack unchanged.

const PKG = 'packs/public/eye-ci-gate'

const REQUIRED_KEYS = ['run', 'tmpdir', 'writeFile']

function take(ctx, key) {
  const value = ctx?.[key]
  if (value == null) throw new TypeError(`${PKG}: moduleCtx['eye-ci-gate'].${key} is missing`)
  return value
}

function seedRepo(ctx, dir) {
  take(ctx, 'run')(['init', '--browser-image', 'gate-fixture:1', '--renderer', 'resvg@2.6.2'], { cwd: dir })
}

function addBaseline(ctx, dir, slot, note) {
  ctx.writeFile(dir, `.eyes/${slot}/current.png`, 'pngish-bytes-are-fine-for-gate-shaped-checks')
  const ledgerPath = `.eyes/ledger.json`
  const rows = JSON.parse(require('fs').readFileSync(require('path').join(dir, '.eyes', 'ledger.json'), 'utf8'))
  rows.push({
    id: `row-${String(rows.length + 1).padStart(4, '0')}`,
    ts: Date.now(), agent: 'eye-ci-gate', commit: 'fixture', type: 'adopt',
    artifact: `${slot}/current.png`, note, ratified: true,
  })
  ctx.writeFile(dir, ledgerPath, JSON.stringify(rows, null, 2))
}

const CASES = [
  {
    // The crashledger rule, aimed at appearance: unexplained drift is THE failure.
    id: 'unexplained-drift-fails-the-pass',
    claim: { verdict: 'REFUSED', reason: 'UNRECORDED', code: 1 },
    run(ctx, dir) {
      seedRepo(ctx, dir)
      ctx.writeFile(dir, '.eyes/home/desktop-1280/current.png', 'pngish')
      return take(ctx, 'run')(['gate'], { cwd: dir })
    },
  },
  {
    id: 'dangling-canon-fails-louder',
    claim: { verdict: 'REFUSED', reason: 'DANGLING_ROW', code: 1 },
    run(ctx, dir) {
      seedRepo(ctx, dir)
      ctx.writeFile(dir, '.eyes/ledger.json', JSON.stringify([{
        id: 'row-0001', ts: 1, agent: 'a', commit: 'c', type: 'adopt',
        artifact: 'home/deleted-evaporated.png', note: 'canon pointing at nothing', ratified: true,
      }], null, 2))
      return take(ctx, 'run')(['gate'], { cwd: dir })
    },
  },
  {
    id: 'explained-tree-passes',
    claim: { verdict: 'PASSED' },
    run(ctx, dir) {
      seedRepo(ctx, dir)
      addBaseline(ctx, dir, 'home/desktop-1280', 'the only re-baseline path: a ledger row (adopt)')
      return take(ctx, 'run')(['gate'], { cwd: dir })
    },
  },
  {
    id: 'schema-integrity-enforced',
    claim: { verdict: 'REFUSED', reason: 'LEDGER_CORRUPT', code: 2 },
    run(ctx, dir) {
      seedRepo(ctx, dir)
      ctx.writeFile(dir, '.eyes/ledger.json', '[{"id":"row-0001","ts":1}]')
      return take(ctx, 'run')(['gate'], { cwd: dir })
    },
  },
  {
    id: 'duplicate-row-ids-refused',
    claim: { verdict: 'REFUSED', reason: 'LEDGER_CORRUPT', code: 2 },
    run(ctx, dir) {
      seedRepo(ctx, dir)
      const row = '{"id":"row-0001","ts":1,"agent":"a","commit":"c","artifact":"x.png","type":"adopt","note":"n"}'
      ctx.writeFile(dir, '.eyes/ledger.json', `[${row},${row}]`)
      return take(ctx, 'run')(['gate'], { cwd: dir })
    },
  },
]

function run(ctx) {
  let ok = true
  const rows = []
  for (const tc of CASES) {
    const dir = take(ctx, 'tmpdir')()
    try {
      const out = tc.run(ctx, dir)
      const stderr = String(out.stderr || '')
      if (tc.claim.verdict === 'PASSED') {
        if (out.code === 0 && /gate:/.test(String(out.stdout || ''))) {
          rows.push({ pack: 'eye-ci-gate', id: tc.id, verdict: 'PASSED' })
        } else {
          ok = false
          rows.push({ pack: 'eye-ci-gate', id: tc.id, verdict: 'EXPLOITED', got: { code: out.code, out: String(out.stdout || '').slice(0, 160) } })
        }
      } else if (out.code === tc.claim.code && stderr.includes(`eyestruct[${tc.claim.reason}]`)) {
        rows.push({ pack: 'eye-ci-gate', id: tc.id, verdict: 'REFUSED', reason: tc.claim.reason })
      } else {
        ok = false
        rows.push({ pack: 'eye-ci-gate', id: tc.id, verdict: 'EXPLOITED', expected: tc.claim, got: { code: out.code, stderr: stderr.slice(0, 200) } })
      }
    } catch (err) {
      ok = false
      rows.push({ pack: 'eye-ci-gate', id: tc.id, verdict: 'EXPLOITED', error: String(err && err.message).slice(0, 200) })
    }
    if (ctx.dispose) ctx.dispose(dir)
  }
  return { ok, rows }
}

module.exports = { run, CASES, PKG, REQUIRED_KEYS }

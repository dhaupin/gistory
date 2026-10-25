// eye-shapes - the eye daemon's own adversarial pack. Mirrors the family's
// pack contract (moduleCtx-armed, verdict taxonomy REFUSED / EXPLOITED /
// BOUNDED, nothing imported from the target): the pack drives the cli the
// run root hands it and judges by the observable exit contract.
//
// THE CONTRACT with the target (moduleCtx['eye-shapes']):
//
//   run(argv, { cwd })   -> execFileSync-shaped { code, stdout, stderr }
//                           for the REAL eyestruct CLI (subprocess, so the
//                           exit contract is exercised, not re-implemented)
//   tmpdir()             -> a fresh disposable fixture directory
//   writeFile(dir, rel, text)
//   read(dir, rel)       -> boolean "exists"
//   bounds               { '<attack-name>': { owner, bound } }  (ONLY for
//                           risks the target documents as accepted - absent
//                           bounds stay findings, per the family contract)
//
// Missing vocabulary fails the run loudly naming this pack - an un-armed
// pack must not read as "everything refused".

const PKG = 'packs/public/eye-shapes'

/** The moduleCtx keys this pack refuses to run without. */
const REQUIRED_KEYS = ['run', 'tmpdir', 'writeFile', 'bounds']

function take(ctx, key) {
  const value = ctx?.[key]
  if (value == null) {
    throw new TypeError(`${PKG}: moduleCtx['eye-shapes'].${key} is missing - arm the run root`)
  }
  return value
}

function initRepo(ctx, dir) {
  take(ctx, 'run')(['init', '--browser-image', 'pack-fixture:1', '--renderer', 'resvg@2.6.2'], cwd(dir))
}

function cwd(dir) {
  return { cwd: dir }
}

const CASES = [
  {
    id: 'unknown-command',
    attack: 'a verb that never existed gets a bare stack trace',
    expect: { code: 1, reason: 'UNKNOWN_COMMAND' },
    run(ctx, dir) {
      return ctx.run(['frobnicate'], cwd(dir))
    },
  },
  {
    id: 'gate-no-manifest',
    attack: 'gate runs blind without a manifest',
    expect: { code: 2, reason: 'MISSING_MANIFEST' },
    run(ctx, dir) {
      return ctx.run(['gate'], cwd(dir))
    },
  },
  {
    id: 'manifest-corrupt-pin',
    attack: 'hand-mangled manifest pin reads as valid memory',
    setup(ctx, dir) {
      initRepo(ctx, dir)
      ctx.writeFile(dir, '.eyes/manifest.yml', 'pin:\n  no-browser-key: nope\nroutes:\n')
    },
    expect: { code: 2, reason: 'MANIFEST_CORRUPT' },
    run(ctx, dir) {
      return ctx.run(['gate'], cwd(dir))
    },
  },
  {
    id: 'ledger-corrupt-json',
    attack: 'a half-written ledger is guessed past instead of refused',
    setup(ctx, dir) {
      initRepo(ctx, dir)
      ctx.writeFile(dir, '.eyes/ledger.json', '{"rows": [oops')
    },
    expect: { code: 2, reason: 'LEDGER_CORRUPT' },
    run(ctx, dir) {
      return ctx.run(['gate'], cwd(dir))
    },
  },
  {
    id: 'ledger-duplicate-ids',
    attack: 'two canon rows with one id launder a rewrite of history',
    setup(ctx, dir) {
      initRepo(ctx, dir)
      const row = '{"id":"row-0001","ts":1,"agent":"a","commit":"c","artifact":"home/current.png","type":"adopt","note":"n"}'
      ctx.writeFile(dir, '.eyes/ledger.json', `[${row},${row}]`)
      ctx.writeFile(dir, '.eyes/home/current.png', 'pngish')
    },
    expect: { code: 2, reason: 'LEDGER_CORRUPT' },
    run(ctx, dir) {
      return ctx.run(['gate'], cwd(dir))
    },
  },
  {
    id: 'adopt-note-required',
    attack: 'an unexplained visual change re-baselines canon',
    setup: (ctx, dir) => initRepo(ctx, dir),
    expect: { code: 1, reason: 'ADOPT_NOTE_REQUIRED' },
    run(ctx, dir) {
      return ctx.run(['adopt', 'home/current.png'], cwd(dir))
    },
  },
  {
    id: 'adopt-control-char-note',
    attack: 'a control character rides the ledger into every reader',
    setup: (ctx, dir) => initRepo(ctx, dir),
    expect: { code: 1, reason: 'UNSAFE_TEXT' },
    run(ctx, dir) {
      return ctx.run(['adopt', 'home/current.png', '--note', 'legit note\u0007 shell meta'], cwd(dir))
    },
  },
  {
    id: 'gate-unrecorded-artifact',
    attack: 'a pixel change ships with no ledger row explaining it',
    setup(ctx, dir) {
      initRepo(ctx, dir)
      ctx.writeFile(dir, '.eyes/home/current.png', 'pngish')
    },
    expect: { code: 1, reason: 'UNRECORDED' },
    run(ctx, dir) {
      return ctx.run(['gate'], cwd(dir))
    },
  },
  {
    id: 'gate-dangling-row',
    attack: 'a ledger row canonizes an artifact that no longer exists',
    setup(ctx, dir) {
      initRepo(ctx, dir)
      ctx.writeFile(dir, '.eyes/ledger.json', JSON.stringify([{
        id: 'row-0001', ts: 1, agent: 'a', commit: 'c', type: 'adopt',
        artifact: 'home/ghost.png', note: 'claims a file that was never committed', ratified: false,
      }], null, 2))
    },
    expect: { code: 1, reason: 'DANGLING_ROW' },
    run(ctx, dir) {
      return ctx.run(['gate'], cwd(dir))
    },
  },
  {
    id: 'look-missing-url',
    attack: 'a look without a target improvises one',
    setup: (ctx, dir) => initRepo(ctx, dir),
    expect: { code: 1, reason: 'UNKNOWN_COMMAND' },
    run(ctx, dir) {
      return ctx.run(['look'], cwd(dir))
    },
  },
  {
    id: 'diff-no-baseline',
    attack: 'a diff manufactures its own baseline',
    setup: (ctx, dir) => initRepo(ctx, dir),
    expect: { code: 1, reason: 'NO_BASELINE' },
    run(ctx, dir) {
      return ctx.run(['diff', 'file:///nowhere'], cwd(dir))
    },
  },
  {
    id: 'browser-missing-refusal',
    attack: 'a capability gap crashes as an error path (the vant inspect receipt)',
    setup: (ctx, dir) => initRepo(ctx, dir),
    expect: { code: 2, reason: 'MISSING_PINNED_BROWSER' },
    run(ctx, dir) {
      // Forcing a bogus exec makes this case deterministic on any machine:
      // the refusal path needs no browser, that is the whole point.
      return ctx.run(['look', 'file:///nowhere', '--browser-exec', '/no/such/chrome'], cwd(dir))
    },
  },
]

/**
 * Browser-class attacks: the pack runs browserless in CI to stay
 * deterministic (no pinned image in a plain job). The accepted-risk bound
 * below must exist in the run root's ctx.bounds or the pack refuses to
 * skip - a silent skip poisons the taxonomy.
 */
const BROWSER_CLASS_CASES = [
  {
    id: 'capture-skeletal-blank-frame',
    attack: 'a blank shell frame is accepted as a look',
    detail: 'requires a pinned browser; covered live by the behavior test battery and by eye-ci-gate under the pinned-image lane',
  },
  {
    id: 'crop-target-missing',
    attack: 'a --region selector matching nothing renders full frame instead of refusing',
    detail: 'requires a pinned browser; covered live by the behavior test battery',
  },
]

function run(ctx) {
  const bounds = take(ctx, 'bounds')
  const browserBound = bounds['browser-class-in-ci']
  const rows = []
  let ok = true

  for (const tc of CASES) {
    const dir = take(ctx, 'tmpdir')()
    try {
      if (tc.setup) tc.setup(ctx, dir)
      const out = tc.run(ctx, dir)
      const stderr = String(out.stderr || '')
      if (out.code === tc.expect.code && stderr.includes(`eyestruct[${tc.expect.reason}]`)) {
        rows.push({ pack: 'eye-shapes', id: tc.id, verdict: 'REFUSED', reason: tc.expect.reason, exit: out.code })
      } else {
        ok = false
        rows.push({ pack: 'eye-shapes', id: tc.id, verdict: 'EXPLOITED', expected: tc.expect, got: { code: out.code, stderr: stderr.slice(0, 200) } })
      }
    } catch (err) {
      ok = false
      rows.push({ pack: 'eye-shapes', id: tc.id, verdict: 'EXPLOITED', error: String(err && err.message).slice(0, 200) })
    }
    if (ctx.dispose) ctx.dispose(dir)
  }

  // Browser-class rows: REFUSABLE only through the documented bound.
  if (!browserBound || !browserBound.owner || !browserBound.bound) {
    ok = false
    rows.push({ pack: 'eye-shapes', id: 'browser-class-bound', verdict: 'EXPLOITED', error: 'the browser-class skip is undocketed - bounds["browser-class-in-ci"] needs owner + bound' })
  } else {
    for (const tc of BROWSER_CLASS_CASES) {
      rows.push({ pack: 'eye-shapes', id: tc.id, verdict: 'BOUNDED', owner: browserBound.owner, bound: browserBound.bound, detail: tc.detail })
    }
  }

  return { ok, rows }
}

module.exports = { run, CASES, PKG, REQUIRED_KEYS }

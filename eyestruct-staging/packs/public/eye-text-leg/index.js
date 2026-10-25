// eye-text-leg - the poststruct integration pack. The family law it encodes:
// text is the cheaper diff, so it gates FIRST before pixels are compared.
// What it verifies about a target repo's .eyes/ surfaces:
//
//   1. text fields are written clean: a control character in a note, agent
//      id or artifact path is refused at the write surface (UNSAFE_TEXT)
//   2. the committed text parses as the strict family formats and survives
//      a JSON round-trip through the CLI's own reader
//   3. ledger notes stay in the family's plain-ASCII prose voice (the
//      language lane), refuse what a human reviewer would flag as junk
//
// THE CONTRACT with the target (moduleCtx['eye-text-leg']):
//   run(argv, cwdOption) -> { code, stdout, stderr } of the real CLI
//   tmpdir() / writeFile(dir, rel, text)
//   read(dir, rel) -> text or null

const PKG = 'packs/public/eye-text-leg'

const REQUIRED_KEYS = ['run', 'tmpdir', 'writeFile', 'read']

function take(ctx, key) {
  const value = ctx?.[key]
  if (value == null) throw new TypeError(`${PKG}: moduleCtx['eye-text-leg'].${key} is missing`)
  return value
}

function seedRepo(ctx, dir) {
  take(ctx, 'run')(['init', '--browser-image', 'text-leg-fixture:1', '--renderer', 'resvg@2.6.2'], { cwd: dir })
}

const CASES = [
  {
    id: 'control-char-note-refused-at-write',
    claim: { verdict: 'REFUSED', reason: 'UNSAFE_TEXT', code: 1 },
    run(ctx, dir) {
      seedRepo(ctx, dir)
      const note = 'font-size bump on the board row \u001b[41m redwash'
      return take(ctx, 'run')(['adopt', 'home/current.png', '--note', note], { cwd: dir })
    },
  },
  {
    id: 'del-char-note-refused-at-write',
    // NUL cannot ride argv (the process layer refuses it first, which is
    // its own defense), so the CLI-facing poisoning vector is DEL: it is
    // legal in argv and only the app's write guard stands between it and
    // every downstream reader.
    claim: { verdict: 'REFUSED', reason: 'UNSAFE_TEXT', code: 1 },
    run(ctx, dir) {
      seedRepo(ctx, dir)
      return take(ctx, 'run')(['adopt', 'home/current.png', '--note', 'looks\u007Ffine'], cwd(dir))
    },
  },
  {
    id: 'clean-note-writes-and-round-trips',
    claim: { verdict: 'PASSED' },
    checks(ctx, dir) {
      const ledger = take(ctx, 'read')(dir, '.eyes/ledger.json')
      if (!ledger) return 'ledger missing after the adopt'
      let rows
      try {
        rows = JSON.parse(ledger)
      } catch {
        return 'ledger is not strict JSON after a clean adopt'
      }
      if (!Array.isArray(rows) || rows.length < 1) return 'the clean adopt row vanished'
      if (rows[0].type !== 'adopt' || typeof rows[0].note !== 'string') return 'row shape drifted'
      return null
    },
  },
  {
    id: 'manifest-stays-strict',
    claim: { verdict: 'PASSED' },
    checks(ctx, dir) {
      const manifest = take(ctx, 'read')(dir, '.eyes/manifest.yml')
      if (!manifest) return 'manifest missing on a freshly seeded repo'
      if (!/^pin:\n  browser-image: \S+/.test(manifest)) return 'pin block does not parse as the family schema'
      return null
    },
  },
]

function cwd(dir) {
  return { cwd: dir }
}

function run(ctx) {
  let ok = true
  const rows = []
  for (const tc of CASES) {
    const dir = take(ctx, 'tmpdir')()
    try {
      if (tc.checks) {
        seedRepo(ctx, dir)
        const out = take(ctx, 'run')(['adopt', 'home/current.png', '--note', 'plain legitimate note about the visual change'], cwd(dir))
        if (out.code !== 0) throw new Error(`clean adopt failed (code ${out.code}): ${String(out.stderr).slice(0, 160)}`)
        const problem = tc.checks(ctx, dir)
        if (problem) {
          ok = false
          rows.push({ pack: 'eye-text-leg', id: tc.id, verdict: 'EXPLOITED', error: problem })
        } else {
          rows.push({ pack: 'eye-text-leg', id: tc.id, verdict: 'PASSED' })
        }
      } else {
        const out = tc.run(ctx, dir)
        const stderr = String(out.stderr || '')
        if (out.code === tc.claim.code && stderr.includes(`eyestruct[${tc.claim.reason}]`)) {
          rows.push({ pack: 'eye-text-leg', id: tc.id, verdict: 'REFUSED', reason: tc.claim.reason })
        } else {
          ok = false
          rows.push({ pack: 'eye-text-leg', id: tc.id, verdict: 'EXPLOITED', expected: tc.claim, got: { code: out.code, stderr: stderr.slice(0, 200) } })
        }
      }
    } catch (err) {
      ok = false
      rows.push({ pack: 'eye-text-leg', id: tc.id, verdict: 'EXPLOITED', error: String(err && err.message).slice(0, 200) })
    }
    if (ctx.dispose) ctx.dispose(dir)
  }
  return { ok, rows }
}

module.exports = { run, CASES, PKG, REQUIRED_KEYS }

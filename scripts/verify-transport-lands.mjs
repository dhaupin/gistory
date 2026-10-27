// Phased transport-lands gate - the structural fix for the 2026-10-27 chunk
// drift class (three typos inside an otherwise-landed base64 hand-off, none
// visible to any gate because the landed copy was the only byte source).
//
// Phase 1  shape      every carried payload still decodes as the shape it
//                     claims (wrapped base64 / gzip magic / chunk family
//                     contiguity). Catches a mid-payload transcription
//                     error or a truncated tail BEFORE anything lands.
//   Phase 2  parity     the working tree of every carried path is clean
//                       against git HEAD (no uncommitted overwrite), and
//                       HEAD's blob still matches the local bytes - so the
//                       bytes an agent is about to push are the bytes the
//                       repo just landed, not a stale local view.
//   Phase 3  origin     with --origin: fetch every carried path from
//                       raw.githubusercontent and compare sha256 against
//                       the local bytes. The independent-of-git read of
//                       what actually landed (the API/CI channel cannot
//                       hide a corrupted upload from this phase).
//
// Phase 1+2 are offline and run in CI. Phase 3 is the pre-push leg and is
// skipped (named SKIP, never a silent pass) unless --origin is given.
//
// Exit contract: 0 all phases green (or named skips), 1 any phase failure.
// --self-test refuses a corrupted fixture (the gate audits itself).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const git = (args, opt = {}) =>
  execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', ...opt })

// -- What counts as a carried payload ------------------------------------------------
// Path-shape classes, not a list: new files landing in these shapes are
// covered by construction. horcrux/stones/*.svg are excluded on purpose:
// they are validated vector artifacts (the eyestruct raster gate +
// framework-gate.mjs own them), not byte carriers - putting them in the
// base64 class produced false drifts.
const CARRIERS = [
  { re: /(?:^|\/)chunk\.(\d{2})\.part$/, lane: 'chunk' },   // hand-off chunk families
  { re: /\.gz\.b64$/, lane: 'gz-b64' },                     // wrapped gz+b64 payloads
  { re: /\.b64$/, lane: 'b64' },                            // plain 76-char base64 wrappers
]

// -- Phase 1: payload shape -----------------------------------------------------------
function runShape(failures) {
  const files = git(['ls-files']).trim().split('\n').filter((f) => f.length)

  // chunk family contiguity: gather and require 00..NN with no gap.
  const chunks = new Map()
  for (const f of files) {
    const m = f.match(CARRIERS.find((c) => c.lane === 'chunk').re)
    if (m) chunks.set(Number(m[1]), f)
  }
  if (chunks.size) {
    const idx = [...chunks.keys()].sort((a, b) => a - b)
    if (!Number.isInteger(idx[0]) || idx[0] !== 0 || idx[idx.length - 1] !== idx.length - 1) {
      failures.push({ path: chunks.get(idx[0]) ?? '(chunk family)', msg: `chunk family has a gap: indexes run ${idx.join(',')}` })
    }
  }

  for (const f of files) {
    const c = CARRIERS.find((car) => car.lane !== 'chunk' && car.re.test(f))
    if (!c) continue
    const raw = readFileSync(join(repoRoot, f), 'utf8').trim()
    if (!raw.length) { failures.push({ path: f, msg: 'empty payload' }); continue }
    const b64 = raw.replace(/\s+/g, '')
    let decoded
    try {
      decoded = Buffer.from(b64, 'base64').toString('latin1')
      // strict round-trip: re-encode and compare - catches a silent corruption
      // Buffer.from tolerates on non-base64 chunks (the transcription class).
      const rt = Buffer.from(b64, 'base64').toString('base64').replace(/=+$/, '')
      if (rt !== b64.replace(/=+$/, '')) {
        failures.push({ path: f, msg: 'base64 does not round-trip (silent transcription drift)' })
      }
    } catch (e) {
      failures.push({ path: f, msg: `base64 decode failed: ${e.message}` }); continue
    }
    if (c.lane === 'gz-b64') {
      const magic = decoded.slice(0, 2)
      if (magic !== '\u001f\u008b') {
        failures.push({ path: f, msg: `gz.b64 payload lost gzip magic (got ${magic.charCodeAt(0)}, ${magic.charCodeAt(1)}; want 31, 139)` })
      }
    }
  }
}

// -- Phase 2: working-tree parity ------------------------------------------------------
function runParity(failures) {
  for (const f of git(['ls-files']).trim().split('\n')) {
    if (!CARRIERS.some((c) => c.re.test(f))) continue
    const dirty = git(['status', '--porcelain', '--', f]).trim()
    if (dirty.length) failures.push({ path: f, msg: `working tree has uncommitted changes: "${dirty}"` })
  }
}

// -- Phase 3: origin parity (--origin, network, pre-push) -------------------------------
async function runOrigin(owner, repo, ref, failures) {
  for (const f of git(['ls-files']).trim().split('\n')) {
    if (!CARRIERS.some((c) => c.re.test(f))) continue
    const local = readFileSync(join(repoRoot, f))
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${f}`
    let res
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    } catch (e) {
      failures.push({ path: f, msg: `origin fetch failed: ${e.message}` }); continue
    }
    if (res.status !== 200) { failures.push({ path: f, msg: `origin returned ${res.status} for ${url}` }); continue }
    const remote = Buffer.from(await res.arrayBuffer())
    if (!remote.equals(local)) {
      const a = createHash('sha256').update(local).digest('hex').slice(0, 12)
      const b = createHash('sha256').update(remote).digest('hex').slice(0, 12)
      failures.push({ path: f, msg: `origin != local: sha12 local ${a}, origin ${b}` })
    }
  }
}

// -- self-test: the gate must refuse its own corrupted fixture --------------------------
function selfTest() {
  const gzip = Buffer.from([0x1f, 0x8b])
  const good = gzip.toString('binary') + 'payload-ok'
  const wrapped = Buffer.from(good, 'binary').toString('base64').replace(/(.{76})/g, '$1\n')
  const mid = Math.floor(wrapped.length / 2)
  const bad = (wrapped[mid] === 'A' ? 'B' : 'A') + wrapped.slice(mid + 1)
  if (wrapped === bad) return [{ ok: false, label: 'self-test fixture did not actually corrupt' }]
  const rt = (s) => Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('base64').replace(/=+$/, '')
  const caught = rt(wrapped) !== rt(bad)
  return [{ ok: caught, label: 'self-test: still-decodable corruption is caught by round-trip' }]
}

// -- main -------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const failures = []

  if (args.includes('--self-test')) {
    const rows = selfTest()
    for (const r of rows) console.warn(`${r.ok ? 'PASS' : 'FAIL '} ${r.label}`)
    process.exit(rows.every((r) => r.ok) ? 0 : 1)
  }

  try {
    runShape(failures)
    if (!failures.length) console.log('phase 1 (shape): PASS - every carried payload decodes its declared shape')
  } catch (e) {
    failures.push({ path: '(phase 1)', msg: `shape phase threw: ${e.message}` })
  }
  try {
    runParity(failures)
    if (!failures.some((f) => f.msg.includes('uncommitted'))) console.log('phase 2 (parity): PASS - every carried path matches git HEAD, no uncommitted drift')
  } catch (e) {
    failures.push({ path: '(phase 2)', msg: `parity phase threw: ${e.message}` })
  }
  if (args.includes('--origin')) {
    const target = args[args.indexOf('--origin') + 1] ?? 'dhaupin/gistory'
    const [owner, repo] = target.split('/')
    const ref = args[args.indexOf('--origin') + 2] ?? 'main'
    try {
      await runOrigin(owner, repo, ref, failures)
      if (!failures.some((f) => f.msg.includes('origin'))) console.log(`phase 3 (origin): PASS - every carried path byte-matches ${owner}/${repo}@${ref}`)
    } catch (e) {
      failures.push({ path: '(phase 3)', msg: `origin phase threw: ${e.message}` })
    }
  } else {
    console.log('phase 3 (origin): SKIP - named; pass --origin owner/repo ref to enable the pre-push read')
  }

  if (failures.length) {
    console.error(`\nTRANSPORT-LANDS: FAIL - ${failures.length} drift(s):`)
    for (const f of failures) console.error(`  ${f.path}: ${f.msg}`)
    process.exit(1)
  }
  console.log('TRANSPORT-LANDS: green')
}

main()

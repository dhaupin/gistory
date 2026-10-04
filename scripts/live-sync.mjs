/**
 * Live two-device sync test — `bun run sync:live [baseUrl]`
 *
 * Runs the REAL SyncAgent (real WebCrypto, real passphrase+chainId key model)
 * against the DEPLOYED relay, with two simulated devices that each have their
 * own localStorage. This is the only check that exercises the actual production
 * path end to end; `sync:smoke` covers the same code against the Pages
 * Functions on in-memory SQLite, and the browser suites run with no backend at
 * all.
 *
 * Why it exists: two of the bugs found by review were invisible to every other
 * suite — a silently dropped first push after enabling sync, and a throttle
 * that could be bypassed. Both only show up against a real server.
 *
 * It is read-mostly by design. It creates its own chain under a `live-test-`
 * prefix, so it cannot touch a real user's data, and it never deletes anything
 * (there is no delete endpoint — blobs are append-only by design).
 */

const BASE = (process.argv[2] || 'https://gistory.creadev.org').replace(/\/+$/, '')

let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    failures.push(detail ? `${name} — ${detail}` : name)
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

// Each simulated device needs its own localStorage, exactly as tests/sync-smoke
// does: the agent stores its device id and pull watermark there.
function makeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  }
}

let activeStorage = makeStorage()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get: () => activeStorage,
})

const { SyncAgent, newWriteSecret, pairingTokenFromChain, chainIdFromToken } =
  await import('../src/sync/agent.ts')
const { emptyDeleted, mergePayload } = await import('../src/sync/merge.ts')
const { errorMessage } = await import('../src/sync/errors.ts')

const PASS = 'live-test-passphrase-not-a-secret'
const CHAIN = `live-test-${Math.random().toString(36).slice(2, 12)}`

console.log(`\n\x1b[1mLive sync test\x1b[0m -> ${BASE}`)
console.log(`  chain: ${CHAIN}  (throwaway; safe to leave behind)`)

// --- 1. Handshake: first device creates the chain ---------------------------

section('1. Chain creation')

const secret = newWriteSecret()
const storageA = makeStorage()
activeStorage = storageA
const a = new SyncAgent({
  baseUrl: BASE,
  passphrase: PASS,
  deviceName: 'Live A',
  chainId: CHAIN,
  writeSecret: secret,
})
await a.init()
check('device A initialised', !!a.getDeviceId())

const statusA = await a.handshake()
check('handshake creates the chain', statusA.chainId === CHAIN, statusA.chainId)
check('a brand new chain starts at seq 0', statusA.serverSeq === 0, String(statusA.serverSeq))
check('A is registered as a device', statusA.devices.some((d) => d.id === a.getDeviceId()))

// The regression this file exists for: the first push after enabling sync.
// This is the very first push on a brand new chain, carrying a library the
// user already had locally.
section('2. First push carries the existing library')

const thread = (id, name, ts) => ({
  id,
  name,
  projectIds: [],
  createdAt: ts,
  updatedAt: ts,
})

const localLibrary = {
  threads: [thread('lt-1', 'Prompt I already had', 1000), thread('lt-2', 'And another', 2000)],
  messages: {},
  projects: [],
  deleted: emptyDeleted(),
  view: {},
}

const firstSeq = await a.push(localLibrary)
check('the first push is stored', typeof firstSeq === 'number' && firstSeq > 0, String(firstSeq))
check('the first push is seq 1', firstSeq === 1, String(firstSeq))

// --- 3. A second device pairs and reads it ---------------------------------

section('3. Second device reads the chain')

const token = pairingTokenFromChain(CHAIN, secret)
const parsed = chainIdFromToken(token)
check('the pairing token round-trips', parsed?.chainId === CHAIN && parsed?.writeSecret === secret)

const storageB = makeStorage()
activeStorage = storageB
const b = new SyncAgent({
  baseUrl: BASE,
  passphrase: PASS,
  deviceName: 'Live B',
  chainId: parsed.chainId,
  writeSecret: parsed.writeSecret,
})
await b.init()
await b.handshake()

const pulled = await b.pull()
check('B receives both threads on first pull', pulled.blobs.length === 1, String(pulled.blobs.length))
check('B decrypts without error', pulled.failures === 0, String(pulled.failures))

let merged = { ...localLibrary, threads: [], messages: {}, projects: [], deleted: emptyDeleted(), view: {} }
for (const blob of pulled.blobs) merged = mergePayload(merged, blob, b.getDeviceId())
check('B sees both of A threads', merged.threads.length === 2, String(merged.threads.length))
check('B has the thread content', merged.threads.some((t) => t.name === 'Prompt I already had'))

// --- 4. Round trip both ways ----------------------------------------------

section('4. Two-way sync')

await b.push({ ...merged, threads: [...merged.threads, thread('lt-3', 'From B', 3000)] })
const bPull = await a.pull()
check('A receives B push', bPull.blobs.length === 1, String(bPull.blobs.length))

let mergedA = mergePayload(localLibrary, bPull.blobs[0], a.getDeviceId())
check('A now sees all three threads', mergedA.threads.length === 3, String(mergedA.threads.length))
check('A sees the one B added', mergedA.threads.some((t) => t.name === 'From B'))

// --- 5. Write auth is enforced live ----------------------------------------

section('5. Write auth holds on the live server')

activeStorage = makeStorage()
const stranger = new SyncAgent({
  baseUrl: BASE,
  passphrase: PASS,
  deviceName: 'Stranger',
  chainId: CHAIN,
  // Correct passphrase, wrong write secret: this is the exact case write auth
  // exists for — anyone who knows the chainId (it travels in the pairing QR).
  writeSecret: newWriteSecret(),
})
await stranger.init()
let strangerErr = null
try {
  await stranger.push(localLibrary)
} catch (err) {
  strangerErr = err
}
check('a wrong write secret is refused', !!strangerErr, 'push unexpectedly succeeded')
check(
  'the refusal is actionable for the user',
  /not allowed to write/i.test(errorMessage(strangerErr ?? '')),
  errorMessage(strangerErr ?? ''),
)

// --- 6. Guards are live ----------------------------------------------------

section('6. Guards on the live server')

// WAF: rejected before any storage work.
const waf = await fetch(`${BASE}/sync/push`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify([1, 2, 3]),
})
check('WAF refuses a non-object body', waf.status === 400, String(waf.status))

// Throttle: walk the handshake limit for one device id and expect a 429.
const floodDevice = `flood-${Math.random().toString(36).slice(2, 8)}`
let throttledAt = -1
for (let i = 0; i < 40; i++) {
  const res = await fetch(`${BASE}/sync/handshake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN, deviceId: floodDevice, deviceName: 'flood' }),
  })
  if (res.status === 429) {
    throttledAt = i
    const retryAfter = res.headers.get('Retry-After')
    check('the throttle sends Retry-After', !!retryAfter && Number(retryAfter) > 0, String(retryAfter))
    const body = await res.json()
    check('the throttle body carries retryAfterMs', typeof body.retryAfterMs === 'number')
    break
  }
}
check('handshake is throttled within 40 requests', throttledAt > 0, String(throttledAt))

// --- 7. Wrong passphrase behaves -------------------------------------------

section('7. A wrong passphrase cannot read the chain')

activeStorage = makeStorage()
const wrong = new SyncAgent({
  baseUrl: BASE,
  passphrase: 'not-the-passphrase',
  deviceName: 'Wrong',
  chainId: CHAIN,
  writeSecret: secret,
})
await wrong.init()
const wrongPull = await wrong.pull()
check('a wrong passphrase reports decrypt failures', wrongPull.failures > 0, String(wrongPull.blobs.length))
check('and yields no usable data', wrongPull.blobs.length === 0, String(wrongPull.blobs.length))

// --- summary ---------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`\x1b[31m${failures.length} check(s) failed:\x1b[0m`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`\x1b[32mAll ${passed} live checks passed.\x1b[0m`)
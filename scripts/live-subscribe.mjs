/**
 * Live wake-target probe — `bun run sync:subscribe [baseUrl]`
 *
 * Complements scripts/live-sync.mjs by exercising the one background-sync
 * surface a Node process CAN reach: the /sync/subscribe CRUD on the deployed
 * relay. It runs AFTER the VAPID env is configured (GET must answer
 * enabled:true), creates its own `live-test-` chain via a real handshake, and
 * walks the POST's validation, success, upsert-by-endpoint, unknown-chain, and
 * DELETE paths. Row contents are deliberately not verifiable from outside
 * (GET is wiring state only — rows have no read endpoint), so every check is
 * status-code level; correctness of row handling is pinned by sync:smoke §11
 * and db:maintain:check instead.
 *
 * The chain and any surviving row are `live-test-` debris: the daily
 * maintenance sweep removes them (chain after its age bound; the row ages out
 * of the wake-target rule). Nothing real is touched and nothing is woken —
 * the fake endpoint is never fetched: only real pushes fan out, and this
 * probe never pushes.
 */
const BASE = (process.argv[2] || 'https://gistory.creadev.org').replace(/\/+$/, '')

let passed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`) }
  else { failures.push(detail ? `${name} — ${detail}` : name); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`) }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

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

const { SyncAgent, newWriteSecret } = await import('../src/sync/agent.ts')

// The Settings toggle reads the wiring state through bg-sync's
// fetchSyncConfig, but that helper resolves a relative /sync URL via Vite's
// import.meta.env, which does not exist under bun — so this probe performs
// the identical GET + parse itself. The helper's exact behaviour stays
// browser-covered by the UI suites.
const config = await (async () => {
  try {
    const res = await fetch(`${BASE}/sync/subscribe`)
    if (!res.ok) return null
    const body = await res.json()
    return {
      enabled: body.enabled === true,
      publicKey: typeof body.publicKey === 'string' ? body.publicKey : null,
    }
  } catch {
    return null
  }
})()

const post = (body) =>
  fetch(`${BASE}/sync/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
 })
const del = (body) =>
  fetch(`${BASE}/sync/subscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

// Key-shape fixtures. Validation is regex-only (base64url, 16..256 chars) —
// real EC point material is NOT needed to store a row, only to send a wake to
// it (encryptWake), which this probe never does.
const FAKE_P = 'B' + 'b'.repeat(86)
const FAKE_A = 'a' + 'a'.repeat(42)
const ENDPOINT = `https://fcm.googleapis.com/fcm/send/live-probe-${Math.random().toString(36).slice(2, 12)}`
const CHAIN = `live-test-${Math.random().toString(36).slice(2, 12)}`

const agents = []
try {
  section('wiring state')
  check('the relay reports background sync configured', config !== null && config.enabled === true,
    config ? JSON.stringify(config) : 'unreachable')
  check('the published key is a base64url P-256 point (87 chars, B-prefixed)',
    !!config && typeof config.publicKey === 'string' && config.publicKey.length === 87 && config.publicKey[0] === 'B',
    config?.publicKey?.slice(0, 8))

  section('chain + device')
  activeStorage = makeStorage()
  const agent = new SyncAgent({
    baseUrl: BASE,
    passphrase: 'live-test-passphrase-not-a-secret',
    deviceName: 'LiveSubscribeProbe',
    chainId: CHAIN,
    writeSecret: newWriteSecret(),
  })
  agents.push(agent)
  await agent.init()
  const st = await agent.handshake()
  check('the probe chain was created with its write secret', st.chainId === CHAIN, st.chainId)
  const device = agent.getDeviceId()
  check('the device id is valid for the route validator (4..128 of [A-Za-z0-9_-])',
    /^[A-Za-z0-9_-]{4,128}$/.test(device), device)

  section('POST /sync/subscribe')
  const bad = await post({ chainId: CHAIN, deviceId: device, endpoint: ENDPOINT, keys: { p256dh: 'short', auth: FAKE_A } })
  check('a malformed p256dh key is refused (400)', bad.status === 400, String(bad.status))
  const unknown = await post({ chainId: `live-test-nochain-${Math.random().toString(36).slice(2, 12)}`, deviceId: device, endpoint: ENDPOINT, keys: { p256dh: FAKE_P, auth: FAKE_A } })
  check('an unknown chain is refused (409) before any row can exist', unknown.status === 409, String(unknown.status))
  const ok = await post({ chainId: CHAIN, deviceId: device, endpoint: ENDPOINT, keys: { p256dh: FAKE_P, auth: FAKE_A } })
  const okBody = await ok.json().catch(() => null)
  check('a valid wake target is stored (200)', ok.status === 200, String(ok.status))
  check('the response echoes chain, device, endpoint', !!okBody && okBody.ok === true && okBody.chainId === CHAIN && okBody.deviceId === device, JSON.stringify(okBody))
  // Upsert-by-endpoint: the SAME browser (endpoint) re-subscribing — e.g. the
  // boot revalidation (revalidateWakeTarget) or a chain migration — must MOVE
  // the row, not fail on conflict.
  const agent2 = new SyncAgent({
    baseUrl: BASE,
    passphrase: 'live-test-passphrase-not-a-secret',
    deviceName: 'LiveSubscribeProbe2',
    chainId: CHAIN,
    writeSecret: newWriteSecret(),
  })
  agents.push(agent2)
  const device2id = 'probe-row-mover'
  await agent2.init()
  await agent2.handshake()
  const move = await post({ chainId: CHAIN, deviceId: device2id, endpoint: ENDPOINT, keys: { p256dh: FAKE_P, auth: FAKE_A } })
  check('re-POST of the same endpoint upserts (moves the row) (200)', move.status === 200, String(move.status))

  section('DELETE /sync/subscribe')
  const wrongOwner = await del({ endpoint: ENDPOINT, deviceId: device })
  check('a DELETE from a device that does not own the row still answers 200', wrongOwner.status === 200, String(wrongOwner.status))
  const gone = await del({ endpoint: ENDPOINT, deviceId: device2id })
  check('the owning device deletes the row (200)', gone.status === 200, String(gone.status))
  const again = await del({ endpoint: ENDPOINT, deviceId: device2id })
  check('deleting twice is idempotent (200)', again.status === 200, String(again.status))
  // A wrong-shaped body gets shape-checked.
  const malformed = await del({ endpoint: 'not-a-url', deviceId: device2id })
  check('a malformed endpoint is refused (400)', malformed.status === 400, String(malformed.status))

  console.log('')
  if (failures.length) {
    console.log(`\x1b[31m${failures.length} live subscribe check(s) failed.\x1b[0m`)
    process.exit(1)
  }
  console.log(`\x1b[32m${passed} live subscribe checks passed against ${BASE}.\x1b[0m`)
  console.log('The live-test chain it created is maintenance-sweep debris; nothing was woken or pushed.')
} catch (err) {
  console.error(`\n  Probe failed: ${err?.stack || err}\n`)
  process.exit(1)
}

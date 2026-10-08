// tests/redteam.ts — adversarial pass against the real Pages Functions.
//
// Runs the same harness as sync-smoke.ts (real Functions on in-memory SQLite)
// but plays attacker: every scenario is an attempt to break write auth, poison
// a chain, exhaust storage, or slip past the guards. A scenario either
// EXPLOITS (documents a real or accepted risk) or is REFUSED (the defence
// holds). Run with `bun run sync:redteam`.
//
// This attacks code, not production: no live traffic, no real chains.

import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { SyncAgent, newWriteSecret, encryptPayload, deriveKey } from '../src/sync/agent'

import { onRequestPost as handshakePost } from '../functions/sync/handshake'
import { onRequestPost as pushPost } from '../functions/sync/push'
import { onRequestGet as pullGet } from '../functions/sync/pull'
import { onRequestGet as statusGet } from '../functions/sync/status'
import { POLICIES } from '../functions/_shared/guards'

let exploited = 0
let refused = 0

/** An attack that WORKED — either a real bug or an accepted, documented risk. */
function exploitedCheck(name: string, detail = '') {
  exploited++
  console.log(`  \x1b[33m⚡ EXPLOITED\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
}

/** An attack that FAILED — the defence held. */
function refusedCheck(name: string, detail = '') {
  refused++
  console.log(`  \x1b[32m🛡 REFUSED\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

// --- harness (same shape as sync-smoke.ts) -----------------------------------

const sqlite = new Database(':memory:')
const migrationsDir = new URL('../migrations/', import.meta.url)
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'))
}

const d1 = {
  prepare(query: string) {
    let bound: unknown[] = []
    const stmt = {
      bind(...values: unknown[]) {
        bound = values
        return stmt
      },
      async first() {
        return sqlite.query(query).get(...(bound as any[])) ?? null
      },
      async all() {
        return { results: sqlite.query(query).all(...(bound as any[])) }
      },
      async run() {
        sqlite.query(query).run(...(bound as any[]))
        return { success: true }
      },
    }
    return stmt
  },
}

const env = { GISTRY_DB: d1 }

const routes: Record<string, (ctx: any) => Promise<Response>> = {
  'POST /sync/handshake': handshakePost,
  'POST /sync/push': pushPost,
  'GET /sync/pull': pullGet,
  'GET /sync/status': statusGet,
}

;(globalThis as any).fetch = async (input: any, init?: any) => {
  const request =
    input instanceof Request
      ? input
      : new Request(new URL(String(input), 'https://local.test'), init)
  const url = new URL(request.url)
  const handler = routes[`${request.method} ${url.pathname}`]
  if (!handler) return new Response('not found', { status: 404 })
  return handler({ request, env })
}

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
}

let activeStorage = makeStorage()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get: () => activeStorage,
})

const useDevice = () => {
  activeStorage = makeStorage() as any
}

const PASS = 'correct horse battery staple'

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`https://local.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function get(path: string): Promise<Response> {
  return fetch(`https://local.test${path}`)
}

const chainHash = (chainId: string) =>
  (sqlite.query('SELECT push_hash FROM chains WHERE id = ?').get(chainId) as any)?.push_hash

const chainCount = () =>
  (sqlite.query('SELECT COUNT(*) AS n FROM chains').get() as any).n

const deviceRows = (chainId: string) =>
  sqlite.query('SELECT id, name FROM devices WHERE chain_id = ?').all(chainId) as any[]

// ===========================================================================

// --- A. Takeover attempts on a secured chain --------------------------------

section('A. Takeover attempts — write auth must not be bypassable')

const CHAIN_V = 'chain-victim-0001'
const ownerSecret = newWriteSecret()
useDevice()
const owner = new SyncAgent({ passphrase: PASS, deviceName: 'Owner', chainId: CHAIN_V, writeSecret: ownerSecret })
await owner.init()
await owner.handshake()
await owner.push({ threads: [], messages: [], projects: [], deleted: {} })
const hashBefore = chainHash(CHAIN_V)

// A1: an attacker who knows only the chainId handshakes with their OWN secret
// and tries to push with it. The takeover would be: their handshake overwrites
// push_hash, their secret becomes the chain's capability.
useDevice()
const attackerSecret = newWriteSecret()
const takeoverHandshake = await post('/sync/handshake', {
  chainId: CHAIN_V,
  deviceId: 'attacker-device',
  deviceName: 'Attacker',
  writeSecret: attackerSecret,
})
const hashAfterHandshake = chainHash(CHAIN_V)
const takeoverPush = await post('/sync/push', {
  chainId: CHAIN_V,
  deviceId: 'attacker-device',
  data: await encryptPayload({ evil: true }, await deriveKey('attacker pass', CHAIN_V)),
  writeSecret: attackerSecret,
})
if (hashAfterHandshake === hashBefore && takeoverPush.status === 403) {
  refusedCheck('join-with-own-secret cannot overwrite the stored push_hash', `join ${takeoverHandshake.status}, push ${takeoverPush.status}, hash unchanged`)
} else {
  exploitedCheck('push_hash overwritten by a joining handshake', `hash changed: ${hashAfterHandshake !== hashBefore}, push ${takeoverPush.status}`)
}

// A2: a second "creator" racing the first on the same brand-new chain id.
// chainIsNew is read before ensureChain, so the second handshake must NOT be
// able to install its own capability — first writer keeps it.
const CHAIN_R = 'chain-race-00001'
const s1 = newWriteSecret()
const s2 = newWriteSecret()
await post('/sync/handshake', { chainId: CHAIN_R, deviceId: 'racer-1', deviceName: 'R1', writeSecret: s1 })
await post('/sync/handshake', { chainId: CHAIN_R, deviceId: 'racer-2', deviceName: 'R2', writeSecret: s2 })
const raceHash = chainHash(CHAIN_R)
const s1Hex = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s1))).toString('hex')
const loserPush = await post('/sync/push', { chainId: CHAIN_R, deviceId: 'racer-2', data: 'aaa.bbb', writeSecret: s2 })
const winnerPush = await post('/sync/push', { chainId: CHAIN_R, deviceId: 'racer-1', data: 'aaa.bbb', writeSecret: s1 })
if (raceHash === s1Hex && loserPush.status === 403 && winnerPush.status === 200) {
  refusedCheck('a racing creator cannot steal a chain it lost the create for', `loser ${loserPush.status}, winner ${winnerPush.status}`)
} else {
  exploitedCheck('create race let the second writer install its capability', `hash match s1: ${raceHash === s1Hex}, pushes ${loserPush.status}/${winnerPush.status}`)
}

// A3: pushing with a hash-format string that might confuse the comparator.
const weirdSecrets = [ownerSecret.toUpperCase(), '0'.repeat(64), 'g'.repeat(43)]
let weirdBypass = false
for (const ws of weirdSecrets) {
  const res = await post('/sync/push', { chainId: CHAIN_V, deviceId: 'attacker-device', data: 'aaa.bbb', writeSecret: ws })
  if (res.status === 200) weirdBypass = true
}
if (!weirdBypass) {
  refusedCheck('no case/format variant of the secret is accepted')
} else {
  exploitedCheck('a case/format variant of the secret was accepted')
}

// --- B. Chain existence oracle ----------------------------------------------

section('B. Existence oracle — can a caller learn which chain ids exist?')

// B1: a handshake WITHOUT a secret is refused for a NEW chain (400 "requires a
// write secret") but SUCCEEDS for an EXISTING one (200, it is a join). The
// status codes therefore distinguish existing chains from fresh ids.
const probeKnown = await post('/sync/handshake', { chainId: CHAIN_V, deviceId: 'probe-device', deviceName: 'Probe' })
const probeUnknown = await post('/sync/handshake', { chainId: 'chain-nonexist-x', deviceId: 'probe-device', deviceName: 'Probe' })
if (probeKnown.status !== probeUnknown.status) {
  exploitedCheck(
    'handshake status codes leak chain existence (accepted risk)',
    `known ${probeKnown.status} vs unknown ${probeUnknown.status}; ids are UUIDv4 (~122 bits) and the per-IP flood bucket caps probes at 1200/min`,
  )
} else {
  refusedCheck('handshake responses do not distinguish existing from new chains')
}

// --- C. Identity games inside a chain the attacker has joined ---------------

section('C. Identity games — the attacker holds the pairing token')

// C1: device ids are public (status lists them), so the attacker re-registers
// the VICTIM's (chain, device) row under their own name.
const victimDevices = deviceRows(CHAIN_V) as any[]
const victimRow = victimDevices.find(d => d.id === owner.getDeviceId())
const rename = await post('/sync/handshake', {
  chainId: CHAIN_V,
  deviceId: owner.getDeviceId(),
  deviceName: 'PWNED-DEVICE',
  writeSecret: attackerSecret,
})
const afterRename = deviceRows(CHAIN_V).find(d => d.id === owner.getDeviceId())
if (rename.status === 200 && afterRename?.name === 'PWNED-DEVICE') {
  exploitedCheck(
    'a chain member can rename another member\'s device row (accepted nuisance)',
    `was "${victimRow?.name}", now "${afterRename.name}"; pushes and data are unaffected`,
  )
} else {
  refusedCheck('device-row rename was not possible', `handshake ${rename.status}`)
}

// C2: pushing while SPOOFING the victim's deviceId — with the attacker's own
// (wrong) secret. Must be refused before any row is touched.
const spoofPush = await post('/sync/push', {
  chainId: CHAIN_V,
  deviceId: owner.getDeviceId(),
  data: 'aaa.bbb',
  writeSecret: attackerSecret,
})
const victimBlobCount = (
  sqlite.query('SELECT COUNT(*) AS n FROM blobs WHERE chain_id = ? AND device_id = ?').get(CHAIN_V, owner.getDeviceId()) as any
).n
if (spoofPush.status === 403 && victimBlobCount === 1) {
  refusedCheck('a spoofed deviceId cannot write under the victim\'s identity')
} else {
  exploitedCheck('spoofed-deviceId push was not correctly refused', `push ${spoofPush.status}, victim blobs ${victimBlobCount}`)
}

// C3: status returns the device list to ANY deviceId that passes the regex —
// membership is not checked (an attacker who knows the chainId reads it).
const outsiderStatus = await get(`/sync/status?chain=${CHAIN_V}&deviceId=completely-fake-id`)
const outsiderBody: any = await outsiderStatus.json()
if (outsiderStatus.status === 200 && Array.isArray(outsiderBody.devices) && outsiderBody.devices.length > 0) {
  exploitedCheck(
    'status leaks the device list to a non-member (accepted read surface)',
    `returned ${outsiderBody.devices.length} device names; blobs are ciphertext either way`,
  )
} else {
  refusedCheck('status does not leak the device list to a non-member', `status ${outsiderStatus.status}`)
}

// --- D. Storage exhaustion ---------------------------------------------------

section('D. Storage exhaustion — what can grow without bound?')

// D1: junk chain rows. A handshake with a valid-looking secret creates a
// permanent chain row; maintenance only prunes live-test-* chains. The per-
// device handshake throttle is sidestepped by rotating device ids — that is
// the realistic attack, and the per-IP flood bucket is what bounds it.
const before = chainCount()
for (let i = 0; i < 25; i++) {
  await post('/sync/handshake', {
    chainId: `chain-junk-${String(i).padStart(4, '0')}`,
    deviceId: `junk-flooder-${String(i).padStart(2, '0')}`,
    deviceName: 'Junk',
    writeSecret: newWriteSecret(),
  })
}
const created = chainCount() - before
if (created === 25) {
  exploitedCheck(
    'chain rows can be farmed by handshake floods (accepted risk)',
    `${created} permanent rows; ~1200/min per IP behind the flood bucket, pruned only for live-test-* chains`,
  )
} else {
  refusedCheck('junk chain creation was bounded', `created ${created}`)
}

// D2: phantom device rows in someone ELSE's chain — knowing the chainId is
// enough to join, and each join inserts a devices row.
useDevice()
for (let i = 0; i < 5; i++) {
  await post('/sync/handshake', { chainId: CHAIN_V, deviceId: `phantom-${String(i).padStart(2, '0')}`, deviceName: `Phantom ${i}` })
}
const phantomRows = deviceRows(CHAIN_V).length
if (phantomRows > 4) {
  exploitedCheck(
    'phantom devices can be injected into a chain\'s device list (accepted risk)',
    `${phantomRows} rows now; status caps the view at 50 and maintenance prunes after 90 days idle`,
  )
} else {
  refusedCheck('phantom device injection was bounded', `${phantomRows} rows`)
}

// --- E. Parser and WAF attacks -----------------------------------------------

section('E. Parser / WAF attacks — malformed input must not open doors')

// E1: a top-level JSON array body.
const arrayBody = await post('/sync/push', JSON.stringify([{ chainId: CHAIN_V, deviceId: 'dev-device', data: 'aaa.bbb' }]))
if (arrayBody.status === 400) {
  refusedCheck('a top-level array body is rejected', `status ${arrayBody.status}`)
} else {
  exploitedCheck('a top-level array body was accepted', `status ${arrayBody.status}`)
}

// E2: prototype-pollution keys. JSON.stringify DROPS a `__proto__` literal
// (it sets the prototype instead of an own property), so the raw wire format
// is what matters: JSON.parse DOES create an own `__proto__` property, which
// the WAF's key scan must catch.
const ppRaw = '{"chainId":"' + CHAIN_V + '","deviceId":"dev-device","data":"aaa.bbb","writeSecret":"' + ownerSecret + '","__proto__":{"isAdmin":true}}'
const ppTop = await post('/sync/push', ppRaw)
if (ppTop.status === 400) {
  refusedCheck('a raw __proto__ key is rejected by the WAF', `status ${ppTop.status}`)
} else {
  exploitedCheck('a raw __proto__ key slipped past the WAF', `status ${ppTop.status}`)
}

// E3: duplicate JSON keys — the last wins in JSON.parse; the server must just
// see a normal (or invalid) request, never a split-brain of the two values.
const dupBody = '{"chainId":"' + CHAIN_V + '","chainId":"chain-nonexist-x","deviceId":"dup-keys","data":"aaa.bbb","writeSecret":"' + ownerSecret + '"}'
const dupRes = await post('/sync/push', dupBody)
if (dupRes.status === 409 || dupRes.status === 403) {
  refusedCheck('duplicate JSON keys resolve to one value (unknown chain)', `status ${dupRes.status}`)
} else {
  exploitedCheck('duplicate JSON keys produced an unexpected outcome', `status ${dupRes.status}`)
}

// E4: `data` as a number (type confusion).
const numData = await post('/sync/push', JSON.stringify({ chainId: CHAIN_V, deviceId: 'dev-device', data: 123456, writeSecret: ownerSecret }))
if (numData.status === 400) {
  refusedCheck('a numeric data field is rejected')
} else {
  exploitedCheck('a numeric data field was accepted', `status ${numData.status}`)
}

// E5: an honest-looking GET with hostile query params.
const hugeSince = await get(`/sync/pull?chain=${CHAIN_V}&since=1e999&deviceId=pager-x`)
const negSince = await get(`/sync/pull?chain=${CHAIN_V}&since=-5&deviceId=pager-x`)
const badLimit = await get(`/sync/pull?chain=${CHAIN_V}&limit=abc&deviceId=pager-x`)
const okQuery = hugeSince.status === 200 && negSince.status === 200 && badLimit.status === 200
if (okQuery) {
  refusedCheck('hostile since/limit values are clamped, not crashing', `${hugeSince.status}/${negSince.status}/${badLimit.status}`)
} else {
  exploitedCheck('hostile query values broke pull', `${hugeSince.status}/${negSince.status}/${badLimit.status}`)
}

// E6: a deviceName far past the cap must be stored sliced to 64.
useDevice()
await post('/sync/handshake', { chainId: 'chain-namelen-001', deviceId: 'name-flooder', deviceName: 'A'.repeat(5000), writeSecret: newWriteSecret() })
const nameLen = (deviceRows('chain-namelen-001')[0]?.name as string)?.length ?? -1
if (nameLen >= 0 && nameLen <= 64) {
  refusedCheck('an oversized deviceName is stored sliced to 64', `len ${nameLen}`)
} else {
  exploitedCheck('an oversized deviceName was stored in full', `len ${nameLen}`)
}

// --- F. Watermark pinning re-check -------------------------------------------

section('F. Watermark pinning — the known poison-blob attack, re-verified')

useDevice()
const victim2 = new SyncAgent({ passphrase: PASS, deviceName: 'Victim2', chainId: CHAIN_V, writeSecret: ownerSecret })
await victim2.init()
// The poison pusher holds the token (so their SECRET is valid and the push is
// accepted) but typed a different passphrase — the mismatch is in the KEY, not
// the write capability. That is the real-world poison scenario.
const junk = await encryptPayload({ evil: true }, await deriveKey('different pass entirely', CHAIN_V))
const poisonPush = await post('/sync/push', { chainId: CHAIN_V, deviceId: 'attacker-device', data: junk, writeSecret: ownerSecret })
const pinnedPull = await victim2.pull()
if (poisonPush.status === 200 && pinnedPull.failures >= 1 && victim2.getLastSeq() < pinnedPull.serverSeq) {
  exploitedCheck(
    'a member with a different passphrase still pins the victim\'s watermark (accepted risk)',
    `failures ${pinnedPull.failures}, watermark ${victim2.getLastSeq()} < head ${pinnedPull.serverSeq}; retried on next sync, never skipped`,
  )
} else {
  refusedCheck('the poison blob did not pin the watermark', `failures ${pinnedPull.failures}`)
}

// --- G. Guard response hygiene ----------------------------------------------

section('G. Guard response hygiene')

// G1: guard responses (429/503) hand-roll their headers, so they can forget
// the no-store policy every other response carries.
useDevice()
let throttleRes: Response | null = null
for (let i = 0; i < POLICIES.handshake.limit + 3; i++) {
  const res = await post('/sync/handshake', {
    chainId: `chain-guard-${String(i).padStart(2, '0')}`,
    deviceId: 'guard-prober',
    deviceName: 'Probe',
    writeSecret: newWriteSecret(),
  })
  if (res.status === 429) {
    throttleRes = res
    break
  }
}
const noStore = throttleRes?.headers.get('cache-control')
if (noStore === 'no-store') {
  refusedCheck('a guard 429 carries Cache-Control: no-store', String(noStore))
} else {
  exploitedCheck('a guard 429 is cacheable', `cache-control: ${String(noStore)}`)
}

// --- Summary -----------------------------------------------------------------

console.log(`\n\x1b[1mRed-team summary: ${exploited} exploited (risks documented), ${refused} refused (defence held)\x1b[0m`)
console.log('Every EXPLOITED line is either an accepted design trade-off (labelled) or a bug to fix — triage follows in the report.')

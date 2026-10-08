// tests/barrage.ts — high-volume adversarial campaigns against the real
// Pages Functions, in-process (no network, no Cloudflare, nothing to get
// banned over). Companion to redteam.ts: redteam probes LOGIC, barrage
// probes BEHAVIOUR AT VOLUME — fuzzing, floods, rotation, stuffing, and
// cost accounting (D1 operations per admitted vs refused request).
//
// Run with `bun run sync:barrage`.

import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { SyncAgent, newWriteSecret, encryptPayload, deriveKey } from '../src/sync/agent'
import { POLICIES } from '../functions/_shared/guards'
import { onRequestPost as handshakePost } from '../functions/sync/handshake'
import { onRequestPost as pushPost } from '../functions/sync/push'
import { onRequestGet as pullGet } from '../functions/sync/pull'

// --- instrumented harness ----------------------------------------------------

const sqlite = new Database(':memory:')
const migrationsDir = new URL('../migrations/', import.meta.url)
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'))
}

let d1Runs = 0 // statements executed against storage (the thing that costs money)

const d1 = {
  prepare(query: string) {
    let bound: unknown[] = []
    const stmt = {
      bind(...values: unknown[]) {
        bound = values
        return stmt
      },
      async first() {
        d1Runs++
        return sqlite.query(query).get(...(bound as any[])) ?? null
      },
      async all() {
        d1Runs++
        return { results: sqlite.query(query).all(...(bound as any[])) }
      },
      async run() {
        d1Runs++
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

// Storage swap (agents keep identity in localStorage).
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

const histogram: Record<number, number> = {}
function record(res: Response) {
  histogram[res.status] = (histogram[res.status] ?? 0) + 1
}

async function post(path: string, body: unknown, ip?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ip) headers['CF-Connecting-IP'] = ip
  const res = await fetch(`https://local.test${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  record(res)
  return res
}

function campaign(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`)
}

function stats(label: string, startedOps: number, ms: number, note: string) {
  const used = d1Runs - startedOps
  const secs = ms / 1000
  console.log(
    `  \x1b[2m${label}\x1b[0m ${used} D1 ops in ${ms.toFixed(0)}ms` +
      ` (${(used / secs).toFixed(0)}/s) — ${note}`,
  )
}

// --- setup: one secured chain the campaigns attack ---------------------------

useDevice()
const CHAIN = 'chain-barrage-001'
const ownerSecret = newWriteSecret()
const owner = new SyncAgent({ passphrase: PASS, deviceName: 'Owner', chainId: CHAIN, writeSecret: ownerSecret })
await owner.init()
await owner.handshake()

// --- C1. Mutation fuzz (wfuzz-style) -----------------------------------------

campaign('C1. Mutation fuzz — 1500 malformed bodies must never throw')

const hostile = [
  '', 'x', 'A'.repeat(300), '\u0000', '{}', 'null', '1e999', '-1',
  '../../etc/passwd', "'; DROP TABLE chains;--", '{{7*7}}', '🔥'.repeat(50),
  '%s%s%s%n', 'GS1-x.y', '\u202E evil', '0'.repeat(64),
]
const shapes: unknown[] = [null, 0, -1, true, [], {}, [1, 2, 3], { nested: { deep: true } }]
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const fields = ['chainId', 'deviceId', 'deviceName', 'writeSecret', 'data']

let fuzzBad = 0
const started = d1Runs
const t0 = performance.now()
for (let i = 0; i < 1500; i++) {
  const body: Record<string, unknown> = {}
  for (const f of fields) {
    if (Math.random() < 0.15) body[f] = pick(shapes)
    else body[f] = pick(hostile)
  }
  const path = Math.random() < 0.5 ? '/sync/handshake' : '/sync/push'
  const res = await post(path, body, '10.0.0.1')
  // 429 = a throttle caught the flood (expected, correct). 500/503 = an
  // uncaught throw or a storage failure — a REAL bug under this input.
  if (res.status === 500 || res.status === 503) fuzzBad++
}
const fuzzMs = performance.now() - t0
if (fuzzBad === 0) {
  console.log(`  \x1b[32m🛡 CLEAN\x1b[0m no 500/503 in 1500 mutated requests — no uncaught throws, no storage failures`)
} else {
  console.log(`  \x1b[31m✗ BUG\x1b[0m ${fuzzBad} fuzz requests produced 500/503`) 
}
stats('fuzz:', started, fuzzMs, 'guards + WAF absorbed the barrage')

// --- C2. Burst flood, one identity -------------------------------------------

campaign('C2. Burst flood — one device pushing as fast as it can')

const burst = { ok: 0, throttled: 0 }
const started2 = d1Runs
const t2 = performance.now()
for (let i = 0; i < 2000; i++) {
  const res = await post('/sync/push', { chainId: CHAIN, deviceId: 'burst-device', data: 'aaa.bbb', writeSecret: ownerSecret })
  if (res.status === 200) burst.ok++
  else burst.throttled++
}
const burstMs = performance.now() - t2
console.log(`  ${burst.ok} admitted, ${burst.throttled} refused (push policy: ${POLICIES.push.limit}/min)`)
if (burst.ok <= POLICIES.push.limit && burst.throttled > 0) {
  console.log(`  \x1b[32m🛡 HELD\x1b[0m the per-device wall stops a runaway client`)
} else {
  console.log(`  \x1b[31m✗ BUG\x1b[0m the push bucket did not hold`) 
}
stats('flood:', started2, burstMs, 'refusals cost a fraction of an admitted push')

// --- C3. Rotation flood — rotating deviceIds across two IPs ------------------

campaign('C3. Rotation flood — fresh deviceIds, two source IPs (the realistic flood)')

const ips = ['9.9.9.9', '8.8.8.8']
const rot = { ok: 0, throttled: 0 }
const started3 = d1Runs
const t3 = performance.now()
for (let i = 0; i < 2500; i++) {
  const res = await post(
    '/sync/handshake',
    {
      chainId: `chain-farm-${String(i).padStart(5, '0')}`,
      deviceId: `rot-${String(i).padStart(5, '0')}`,
      deviceName: 'Rot',
      writeSecret: newWriteSecret(),
    },
    ips[i % 2],
  )
  if (res.status === 200) rot.ok++
  else rot.throttled++
}
const rotMs = performance.now() - t3
console.log(`  ${rot.ok} admitted, ${rot.throttled} refused (per-IP flood policy: ${POLICIES.flood.limit}/min)`)
if (rot.throttled > 0 && rot.ok <= POLICIES.flood.limit * ips.length) {
  console.log(`  \x1b[33m⚡ BOUNDED\x1b[0m rotation defeats per-device buckets; the per-IP bucket is the wall — accepted risk: ~${POLICIES.flood.limit} junk chains/min per IP`) 
} else {
  console.log(`  \x1b[31m✗ BUG\x1b[0m rotation bypassed every bucket`) 
}
stats('rotate:', started3, rotMs, 'each admitted handshake writes a chain row (the farmable cost)')

// --- C4. Secret stuffing (hydra-style) ----------------------------------------

campaign('C4. Write-secret stuffing — 500 guesses against one chain')

const stuff = { tried: 0, throttled: 0 }
const started4 = d1Runs
const t4 = performance.now()
for (let i = 0; i < 500; i++) {
  const guess = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url').slice(0, 43)
  const res = await post('/sync/push', { chainId: CHAIN, deviceId: 'stuffer', data: 'aaa.bbb', writeSecret: guess })
  stuff.tried++
  if (res.status === 429) stuff.throttled++
}
const stuffMs = performance.now() - t4
// The owner must still be able to push: a third party's guessing must not
// have spent the legitimate device's push allowance.
const ownerPush = await post('/sync/push', { chainId: CHAIN, deviceId: 'owner-device', data: 'aaa.bbb', writeSecret: ownerSecret })
if (stuff.throttled > 0 && ownerPush.status === 200) {
  console.log(`  \x1b[32m🛡 HELD\x1b[0m write-fail budget (${POLICIES.writeFailures.limit}/min) throttled the guesser; owner push unaffected (${ownerPush.status})`) 
} else {
  console.log(`  \x1b[31m✗ BUG\x1b[0m stuffing escaped its budget (throttled: ${stuff.throttled}, owner: ${ownerPush.status})`) 
}
stats('stuff:', started4, stuffMs, 'guessing burns a separate budget, not the owner\'s')

// --- C5. Storage-fill measurement --------------------------------------------

campaign('C5. Storage fill — how fast can a valid token grow the database?')

const PAYLOAD = 'K'.repeat(512 * 1024) // 512KB "snapshot"
let fillBytes = 0
let fillOk = 0
const started5 = d1Runs
const t5 = performance.now()
for (let i = 0; i < 60; i++) {
  const cid = `chain-fill-${String(i).padStart(4, '0')}`
  await post('/sync/handshake', { chainId: cid, deviceId: `filler-${i}`, deviceName: 'Fill', writeSecret: ownerSecret })
  const res = await post('/sync/push', { chainId: cid, deviceId: `filler-${i}`, data: PAYLOAD, writeSecret: ownerSecret })
  if (res.status === 200) {
    fillOk++
    fillBytes += PAYLOAD.length
  }
}
const fillMs = performance.now() - t5
const storedRow = sqlite.query('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)),0) AS bytes FROM blobs WHERE chain_id LIKE \'chain-fill-%\'').get() as any
console.log(`  ${fillOk} fresh chains x 512KB admitted = ${(fillBytes / 1024 / 1024).toFixed(1)}MB in ${(fillMs / 1000).toFixed(1)}s`)
console.log(`  \x1b[33m⚡ BOUNDED\x1b[0m accepted risk: per-IP flood (${POLICIES.flood.limit}/min) + push-chain (${POLICIES.pushChain.limit}/min) cap the rate; fresh chains evade blob retention (newest-5 per chain) — a token-holder can farm ~tens of MB/min/IP until the daily job trims`) 
stats('fill:', started5, fillMs, `${storedRow.n} blobs, ${(storedRow.bytes / 1024 / 1024).toFixed(1)}MB stored`)

// --- C6. Poison spam — amplification against victims --------------------------

campaign('C6. Poison spam — junk blobs every victim must re-download and retry')

useDevice()
const victim = new SyncAgent({ passphrase: PASS, deviceName: 'Victim', chainId: CHAIN, writeSecret: ownerSecret })
await victim.init()
const junkKey = await deriveKey('attacker passphrase', CHAIN)
const junk = await encryptPayload({ evil: true, pad: 'J'.repeat(4096) }, junkKey)
for (let i = 0; i < 30; i++) {
  await post('/sync/push', { chainId: CHAIN, deviceId: 'poisoner', data: junk, writeSecret: ownerSecret })
}
const started6 = d1Runs
const t6 = performance.now()
let lastFailures = 0
for (let i = 0; i < 5; i++) {
  const pull = await victim.pull()
  lastFailures = pull.failures
}
const pullMs = performance.now() - t6
console.log(`  5 victim syncs over 30 poison blobs: ${(pullMs / 5).toFixed(0)}ms/sync, failures reported: ${lastFailures}`)
if (lastFailures >= 1) {
  console.log(`  \x1b[33m⚡ BOUNDED\x1b[0m accepted risk: watermark pins below the junk and retries it every sync — never skipped, never lost`) 
} else {
  console.log(`  \x1b[31m✗ BUG\x1b[0m the victim did not report the poison blobs`) 
}
stats('poison:', started6, pullMs, 'the victim\'s sync pays for the attacker\'s junk, every time')

// --- summary -------------------------------------------------------------------

console.log(`\n\x1b[1mBarrage summary — response histogram:\x1b[0m`)
for (const code of Object.keys(histogram).sort()) {
  console.log(`  ${code}: ${histogram[Number(code)]}`)
}
const fiveHundreds = (histogram[500] ?? 0) + (histogram[503] ?? 0)
if (fiveHundreds === 0) {
  console.log(`\x1b[32mZero 500/503 across the whole barrage — no uncaught throws, breaker never opened.\x1b[0m`)
} else {
  console.log(`\x1b[31m${fiveHundreds} 500/503 responses — investigate above.\x1b[0m`)
  process.exitCode = 1
}

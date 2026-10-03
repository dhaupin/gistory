/**
 * Sync smoke test — `bun run sync:smoke`
 *
 * Runs the REAL code paths against real storage:
 *   • src/sync/agent.ts        (WebCrypto key derivation + encrypt/decrypt)
 *   • src/sync/merge.ts        (last-write-wins, tiebreak, tombstones)
 *   • functions/sync/*.ts      (the Pages Functions, via a fetch shim)
 *   • functions/_shared/sync.ts SQL executed on bun:sqlite (a real SQLite),
 *                              standing in for Cloudflare D1.
 *
 * No network and no Cloudflare account required.
 */

import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import {
  SyncAgent,
  deriveKey,
  encryptPayload,
  decryptPayload,
} from '../src/sync/agent'
import { emptyDeleted, mergePayload, type SyncData, type SyncPayload } from '../src/sync/merge'
import type { Message, Thread } from '../src/lib/models'

import { onRequestPost as handshakePost } from '../functions/sync/handshake'
import { onRequestPost as pushPost } from '../functions/sync/push'
import { onRequestGet as pullGet } from '../functions/sync/pull'
import { onRequestGet as statusGet } from '../functions/sync/status'

// --- tiny test harness -------------------------------------------------------

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } else {
    failures.push(detail ? `${name} — ${detail}` : name)
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

// --- fake D1 backed by real SQLite ------------------------------------------

const sqlite = new Database(':memory:')
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))

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

// Route fetch() at the Pages Functions, exactly as the client calls them.
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

// Swappable localStorage so each simulated device has its own identity.
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

const useDevice = (name: string) => {
  const storage = makeStorage()
  activeStorage = storage as any
  return { storage, name }
}

// --- 1. crypto / key model ---------------------------------------------------

section('1. Key model — passphrase + chainId')

const CHAIN_A = 'chain-alpha-0001'
const CHAIN_B = 'chain-bravo-0002'
const PASS = 'correct horse battery staple'

const keyA1 = await deriveKey(PASS, CHAIN_A)
const keyA2 = await deriveKey(PASS, CHAIN_A)
const keyB = await deriveKey(PASS, CHAIN_B)

const ciphertext = await encryptPayload({ hello: 'world', n: 42 }, keyA1)
const roundTripped = await decryptPayload<any>(ciphertext, keyA2)
check('same passphrase + same chainId derives a shared key', roundTripped.hello === 'world')

let wrongChainFailed = false
try {
  await decryptPayload(ciphertext, keyB)
} catch {
  wrongChainFailed = true
}
check('a different chainId produces a key that cannot decrypt', wrongChainFailed)

const keyWrongPass = await deriveKey('not the passphrase', CHAIN_A)
let wrongPassFailed = false
try {
  await decryptPayload(ciphertext, keyWrongPass)
} catch {
  wrongPassFailed = true
}
check('a different passphrase cannot decrypt', wrongPassFailed)

// --- 2. merge semantics ------------------------------------------------------

section('2. Merge rules')

const thread = (id: string, ts: number, name = id): Thread => ({
  id,
  name,
  projectIds: [],
  createdAt: ts,
  updatedAt: ts,
})
const msg = (id: string, ts: number, content = id): Message => ({
  id,
  threadId: 't1',
  content,
  createdAt: ts,
})

const base = (): SyncData => ({
  threads: [],
  messages: {},
  projects: [],
  deleted: emptyDeleted(),
})

const newer = mergePayload(
  { ...base(), threads: [thread('t1', 100, 'old')] },
  { threads: [thread('t1', 200, 'new')], senderDeviceId: 'devA' },
  'devZ',
)
check('later timestamp wins', newer.threads[0].name === 'new')

const tieWinner = mergePayload(
  { ...base(), threads: [thread('t1', 100, 'local')] },
  { threads: [thread('t1', 100, 'remote')], senderDeviceId: 'devZ' },
  'devA',
)
check(
  'equal timestamps break on the larger deviceId',
  tieWinner.threads[0].name === 'remote',
  tieWinner.threads[0].name,
)

const tieLoser = mergePayload(
  { ...base(), threads: [thread('t1', 100, 'local')] },
  { threads: [thread('t1', 100, 'remote')], senderDeviceId: 'devA' },
  'devZ',
)
check('equal timestamps keep the local copy when our id is larger', tieLoser.threads[0].name === 'local')

const tombstoned = mergePayload(
  { ...base(), threads: [thread('t1', 100)], deleted: emptyDeleted() },
  { deleted: { threads: { t1: 500 } }, senderDeviceId: 'devA' },
  'devZ',
)
check('a tombstone newer than the item deletes it', tombstoned.threads.length === 0)
check('the tombstone is remembered', tombstoned.deleted.threads.t1 === 500)

const resurrected = mergePayload(
  { ...base(), deleted: { ...emptyDeleted(), threads: { t1: 100 } } },
  { threads: [thread('t1', 900, 'edited after delete')], senderDeviceId: 'devA' },
  'devZ',
)
check('an edit after the deletion resurrects the item', resurrected.threads.length === 1)

const reDeleteAfterResurrect = mergePayload(
  { ...base(), threads: [thread('t1', 900, 'edited')], deleted: { ...emptyDeleted(), threads: { t1: 100 } } },
  { deleted: { threads: { t1: 100 } }, senderDeviceId: 'devA' },
  'devZ',
)
check('a stale tombstone does not delete a newer edit', reDeleteAfterResurrect.threads.length === 1)

const mergedMessages = mergePayload(
  { ...base(), messages: { t1: [msg('m1', 10)] } },
  { messages: { t1: [msg('m1', 10), msg('m2', 20)] }, senderDeviceId: 'devA' },
  'devZ',
)
check('messages union by id and sort by time', mergedMessages.messages.t1.map(m => m.id).join(',') === 'm1,m2')

const deletedMessage = mergePayload(
  { ...base(), messages: { t1: [msg('m1', 10)] } },
  { deleted: { messages: { m1: 50 } }, senderDeviceId: 'devA' },
  'devZ',
)
check('message tombstones remove messages', deletedMessage.messages.t1.length === 0)

const maxTs = mergePayload(
  { ...base(), deleted: { ...emptyDeleted(), threads: { t1: 400 } } },
  { deleted: { threads: { t1: 100, t2: 700 } }, senderDeviceId: 'devA' },
  'devZ',
)
check('tombstone timestamps merge with max', maxTs.deleted.threads.t1 === 400 && maxTs.deleted.threads.t2 === 700)

// --- 3. end-to-end through the Pages Functions --------------------------------

section('3. End-to-end sync through the Pages Functions (SQLite)')

const A = useDevice('A')
const agentA = new SyncAgent({ passphrase: PASS, deviceName: 'Device A', chainId: CHAIN_A })
await agentA.init()
const handshakeA = await agentA.handshake()
check('device A handshakes and creates the chain', handshakeA.serverSeq === 0, String(handshakeA.serverSeq))
check('a fresh chain lists this device', handshakeA.devices.length === 1)

// Push before a chain exists should be rejected.
const orphanPush = await pushPost({
  request: new Request('https://local.test/sync/push', {
    method: 'POST',
    body: JSON.stringify({ chainId: 'ghost-chain-9999', deviceId: 'devX', data: 'x' }),
  }),
  env,
})
check('pushing to an unknown chain is rejected with 409', orphanPush.status === 409, String(orphanPush.status))

const badHandshake = await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    body: JSON.stringify({ chainId: 'no', deviceId: 'devX' }),
  }),
  env,
})
check('an invalid chainId is rejected with 400', badHandshake.status === 400, String(badHandshake.status))

const seedThreads = [thread('t-a1', 1000, 'From A')]
const seedSeq = await agentA.push({ threads: seedThreads, messages: {}, projects: [], deleted: emptyDeleted() })
check('A push is assigned seq 1 by the server', seedSeq === 1, String(seedSeq))

const B = useDevice('B')
const agentB = new SyncAgent({ passphrase: PASS, deviceName: 'Device B', chainId: CHAIN_A })
await agentB.init()
const handshakeB = await agentB.handshake()
check('device B joins the existing chain at head seq 1', handshakeB.serverSeq === 1, String(handshakeB.serverSeq))
check('the chain now lists two devices', handshakeB.devices.length === 2)

const pulledByB = await agentB.pull()
check('B pulls A’s change', pulledByB.blobs.length === 1, `got ${pulledByB.blobs.length}`)
check('B decrypts A’s payload with the shared key', (pulledByB.blobs[0] as any).threads[0].name === 'From A')
check('B records no decrypt failures', pulledByB.failures === 0)

// A must never re-download its own blob.
const pulledByA = await agentA.pull()
check('A does not pull its own change back', pulledByA.blobs.length === 0, `got ${pulledByA.blobs.length}`)

// B merges A's work with its own local thread, then pushes the union.
let dataB: SyncData = { threads: [thread('t-b1', 1100, 'From B')], messages: {}, projects: [], deleted: emptyDeleted() }
for (const blob of pulledByB.blobs) dataB = mergePayload(dataB, blob as SyncPayload, agentB.getDeviceId())
check('B merges remote + local threads', dataB.threads.length === 2, `got ${dataB.threads.length}`)

const bSeq = await agentB.push({ ...dataB })
check('B push is assigned seq 2 by the server', bSeq === 2, String(bSeq))

const aSecondPull = await agentA.pull()
check('A receives B’s change on the next pull', aSecondPull.blobs.length === 1, `got ${aSecondPull.blobs.length}`)
const aMerged = mergePayload(
  { threads: seedThreads, messages: {}, projects: [], deleted: emptyDeleted() },
  aSecondPull.blobs[0] as SyncPayload,
  agentA.getDeviceId(),
)
check('A ends up with both threads', aMerged.threads.length === 2, `got ${aMerged.threads.length}`)

const aThirdPull = await agentA.pull()
check('a subsequent pull is a no-op (watermark advanced)', aThirdPull.blobs.length === 0)

const statusRes = await statusGet({
  request: new Request(`https://local.test/sync/status?chain=${CHAIN_A}`),
  env,
})
const statusBody: any = await statusRes.json()
check('status reports the chain head', statusBody.serverSeq === 2, String(statusBody.serverSeq))
check('status reports both devices', statusBody.devices.length === 2)

// A wrong passphrase must not silently destroy the watermark.
const C = useDevice('C')
const agentC = new SyncAgent({ passphrase: 'wrong passphrase', deviceName: 'Device C', chainId: CHAIN_A })
await agentC.init()
await agentC.handshake()
const pullC = await agentC.pull()
check('a device with the wrong passphrase reports decrypt failures', pullC.failures > 0, `${pullC.failures}`)
check('a failed decrypt does not advance the watermark', agentC.getLastSeq() === 0, String(agentC.getLastSeq()))

// Re-handshaking (which happens on every page load) must be idempotent.
const reHandshake = await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    body: JSON.stringify({
      chainId: CHAIN_A,
      deviceId: agentA.getDeviceId(),
      deviceName: 'Device A (renamed)',
    }),
  }),
  env,
})
const reBody: any = await reHandshake.json()
// Chain A legitimately has 3 devices by now (A, B, and the wrong-passphrase C).
// The invariant we care about is that re-registering an existing device updates
// its row instead of inserting a duplicate.
const reIds = new Set(reBody.devices.map((d: any) => d.id))
check('re-handshaking adds no duplicate device rows', reIds.size === reBody.devices.length, `${reIds.size} ids vs ${reBody.devices.length} rows`)
check(
  'the re-registered device still has exactly one row',
  reBody.devices.filter((d: any) => d.id === agentA.getDeviceId()).length === 1,
)
check(
  're-handshaking refreshes the device name',
  reBody.devices.some((d: any) => d.name === 'Device A (renamed)'),
)
check('handshake does not append blobs', reBody.serverSeq === 2, String(reBody.serverSeq))

// --- 4. pagination beyond the pull limit -------------------------------------

section('4. Pagination past the 500-blob pull limit')

const TOTAL = 520
const CHAIN_P = 'chain-pager-0003'

const storageP = makeStorage() as any
activeStorage = storageP
const agentP = new SyncAgent({ passphrase: PASS, deviceName: 'Pager P', chainId: CHAIN_P })
await agentP.init()
await agentP.handshake()
for (let i = 0; i < TOTAL; i++) {
  await agentP.push({ threads: [thread(`p-${i}`, i)], messages: {}, projects: [], deleted: emptyDeleted() })
}

useDevice('Q')
const agentQ = new SyncAgent({ passphrase: PASS, deviceName: 'Pager Q', chainId: CHAIN_P })
await agentQ.init()
await agentQ.handshake()
const qId = agentQ.getDeviceId()

const qPull = await agentQ.pull()
check(`Q pages through all ${TOTAL} blobs`, qPull.blobs.length === TOTAL, String(qPull.blobs.length))
check('Q records no decrypt failures while paging', qPull.failures === 0)
check('Q’s watermark ends at the chain head', agentQ.getLastSeq() === TOTAL, String(agentQ.getLastSeq()))
const qPull2 = await agentQ.pull()
check('a repeat pull after paging is empty', qPull2.blobs.length === 0, String(qPull2.blobs.length))

// A device whose blobs are ALL its own must still skip to the head in one call.
activeStorage = storageP
const pPull = await agentP.pull()
check('a device never pages through its own blobs', pPull.blobs.length === 0, String(pPull.blobs.length))
check('that device jumps straight to the head', agentP.getLastSeq() === TOTAL, String(agentP.getLastSeq()))

const limited = await pullGet({
  request: new Request(
    `https://local.test/sync/pull?chain=${CHAIN_P}&since=0&deviceId=${qId}&limit=2`,
  ),
  env,
})
const limitedBody: any = await limited.json()
check('an explicit limit caps the page', limitedBody.blobs.length === 2, String(limitedBody.blobs.length))
check('a capped page still reports the full head', limitedBody.serverSeq === TOTAL, String(limitedBody.serverSeq))

// --- summary -----------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`\x1b[31m${failures.length} check(s) failed:\x1b[0m`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`\x1b[32mAll ${passed} checks passed.\x1b[0m`)

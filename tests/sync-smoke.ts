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
import { readFileSync, readdirSync } from 'node:fs'
import {
  SyncAgent,
  deriveKey,
  encryptPayload,
  chainIdFromToken,
  pairingTokenFromChain,
  decryptPayload,
} from '../src/sync/agent'
import { emptyDeleted, mergePayload, type SyncData, type SyncPayload } from '../src/sync/merge'
import { normalizeVariables, tombstoneDeadScopes } from '../src/lib/variables'
import { describeDecryptFailures, errorMessage } from '../src/sync/errors'
import { SyncError, newWriteSecret, retryAfterFrom } from '../src/sync/agent'
import { SyncQos, backoffDelay, isTerminalPushFailure } from '../src/sync/qos'
import {
  BREAKER_POLICY,
  MAX_BODY_BYTES,
  POLICIES,
  advanceBreaker,
  breakerAllows,
  breakerPeek,
  breakerRecord,
  breakerResponse,
  consumeLimit,
  consumeLimitUnits,
  evaluateLimit,
  guardRoute,
  hasControlChars,
  inspectBody,
  pruneLimits,
  readLimit,
  resetBreaker,
  resetLimitSweep,
  retryAfterSeconds,
  shouldSweepLimits,
  type BreakerPolicy,
  type BreakerState,
  type LimitRow,
} from '../functions/_shared/guards'
import { sortMessages, sortProjects, sortThreads } from '../src/ui/sort'
import {
  RANK_STEP,
  applyFullOrder,
  applyOrder,
  emptyView,
  mergeView,
  moveItem,
  moveWithinSubset,
  needsRebalance,
  pruneView,
  rankBetween,
  saveView,
  viewKeyItem,
} from '../src/sync/view-state'
import { importData, exportThread, saveMessages, saveThreads } from '../src/lib/store'
import type { Message, MessageAttachment, Thread } from '../src/lib/models'

import { onRequestPost as handshakePost } from '../functions/sync/handshake'
import { onRequestPost as pushPost } from '../functions/sync/push'
import { onRequestGet as pullGet } from '../functions/sync/pull'
import { onRequestGet as statusGet } from '../functions/sync/status'
import {
  onRequestDelete as subscribeDelete,
  onRequestGet as subscribeGet,
  onRequestPost as subscribePost,
} from '../functions/sync/subscribe'

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
// Build from the real migration history, NOT schema.sql. The flattened schema
// can only ever create a database from scratch, so once a migration adds a
// column the two drift — and a test built on schema.sql would pass while the
// shipped migrations produced a different shape. Applying migrations/ means this
// test exercises what actually ships.
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

// Route fetch() at the Pages Functions, exactly as the client calls them.
const routes: Record<string, (ctx: any) => Promise<Response>> = {
  'POST /sync/handshake': handshakePost,
  'POST /sync/push': pushPost,
  'GET /sync/pull': pullGet,
  'GET /sync/status': statusGet,
  'GET /sync/subscribe': subscribeGet,
  'POST /sync/subscribe': subscribePost,
  'DELETE /sync/subscribe': subscribeDelete,
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
    // Real localStorage is enumerable (length + key(i)) — idb.ts's key
    // enumeration walks exactly that surface, so the fake must offer it.
    get length() { return map.size },
    key: (i: number) => [...map.keys()][i] ?? null,
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

// --- 1b. Payload compression: deflate before encrypt --------------------------

section('1b. Payload compression — deflate inside the envelope')

// Prompt-heavy snapshots are highly repetitive, so they deflate hard. The
// tag byte tells the two shapes apart: [0x02] compressed, [0x01] raw,
// tag-less = the very first payloads ever pushed (legacy, no versioning
// existed yet) — all three must decrypt through the same decryptPayload.
const hasStreams = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

// Local base64 helpers for framing the legacy fixture (agent.ts keeps its
// fns module-private on purpose).
const b64OfBuf = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  bytes.forEach(b => { s += String.fromCharCode(b) })
  return Buffer.from(s, 'binary').toString('base64')
}
const b64ToBytes = (b64: string): Uint8Array => {
  const s = Buffer.from(b64, 'base64').toString('binary')
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

const roundTripTight = await decryptPayload<any>(ciphertext, keyA2)
check('small payloads round-trip regardless of the compression decision', roundTripTight.n === 42)

const bigSnapshot = {
  threads: Array.from({ length: 200 }, (_, i) => ({
    id: `t${i}`, name: 'grocery list prompt for the weekly planning session',
    projectIds: [], createdAt: 1000 + i, updatedAt: 1001 + i,
  })),
  messages: {} as Record<string, unknown[]>,
  projects: [],
  deleted: emptyDeleted(),
  view: {},
}
const bigCipher = await encryptPayload(bigSnapshot, keyA1)
const bigBack = await decryptPayload<typeof bigSnapshot>(bigCipher, keyA2)
check('a large payload round-trips',( bigBack.threads.length === 200))
if (hasStreams) {
  // Roughly a third of the base64 is overhead; the compressed body must land
  // materially under the raw JSON's size for a repetitive snapshot.
  const rawBytes = JSON.stringify(bigSnapshot).length
  check(
    'a repetitive snapshot compresses to well under its raw JSON size',
    bigCipher.length < rawBytes * 0.5,
    `${bigCipher.length} vs raw ${rawBytes}`,
  )
}

// Legacy compatibility: hand-encrypt an untagged plaintext exactly as the
// very first version of encryptPayload did. It has no tag byte (and cannot:
// JSON starts with `\u007b`, which is neither tag), so it decrypts forever.
const legacyIv = crypto.getRandomValues(new Uint8Array(12))
const legacyCt = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv: legacyIv },
  keyA1,
  new TextEncoder().encode(JSON.stringify({ hello: 'legacy', from: 'the first version' })),
)
const legacyBack = await decryptPayload<any>(
  b64OfBuf(legacyIv) + '.' + b64OfBuf(new Uint8Array(legacyCt)), keyA2,
)
check('tag-less legacy payloads still decrypt', legacyBack.hello === 'legacy')
const legacyFirstByte = b64ToBytes(b64OfBuf(new Uint8Array(legacyCt)))[0]
check(
  'a legacy blob and a tagged blob never collide on the first byte',
  legacyFirstByte !== 1 && legacyFirstByte !== 2,
  String(legacyFirstByte),
)

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
  view: emptyView(),
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
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [msg('m1', 10)] } },
  { messages: { t1: [msg('m1', 10), msg('m2', 20)] }, senderDeviceId: 'devA' },
  'devZ',
)
check('messages union by id and sort by time', mergedMessages.messages.t1.map(m => m.id).join(',') === 'm1,m2')

const deletedMessage = mergePayload(
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [msg('m1', 10)] } },
  { deleted: { messages: { m1: 50 } }, senderDeviceId: 'devA' },
  'devZ',
)
check('message tombstones remove messages', deletedMessage.messages.t1.length === 0)

// Bug #1 regression: an edit must win on its updatedAt, not on deviceId order.
const editedBySmallerDevice = mergePayload(
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [msg('m1', 10, 'OLD')] } },
  { messages: { t1: [{ ...msg('m1', 10, 'NEW'), updatedAt: 20 }] }, senderDeviceId: 'devA' },
  'devZ',
)
check(
  'a message edit wins regardless of deviceId order',
  editedBySmallerDevice.messages.t1[0].content === 'NEW',
  editedBySmallerDevice.messages.t1[0].content,
)

const staleRemoteKeepsLocalEdit = mergePayload(
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [{ ...msg('m1', 10, 'LOCAL EDIT'), updatedAt: 30 }] } },
  { messages: { t1: [msg('m1', 10, 'OLD')] }, senderDeviceId: 'devZ' },
  'devA',
)
check(
  'an older unedited copy does not revert a newer local edit',
  staleRemoteKeepsLocalEdit.messages.t1[0].content === 'LOCAL EDIT',
  staleRemoteKeepsLocalEdit.messages.t1[0].content,
)

const messageResurrected = mergePayload(
  {
    ...base(),
    threads: [thread('t1', 100)],
    deleted: { ...emptyDeleted(), messages: { m1: 100 } },
  },
  { messages: { t1: [{ ...msg('m1', 10, 'edited after delete'), updatedAt: 900 }] }, senderDeviceId: 'devA' },
  'devZ',
)
check('a message edit after its deletion resurrects it', messageResurrected.messages.t1.length === 1)

const maxTs = mergePayload(
  { ...base(), deleted: { ...emptyDeleted(), threads: { t1: 400 } } },
  { deleted: { threads: { t1: 100, t2: 700 } }, senderDeviceId: 'devA' },
  'devZ',
)
check('tombstone timestamps merge with max', maxTs.deleted.threads.t1 === 400 && maxTs.deleted.threads.t2 === 700)

// Pinning is a normal thread edit: the toggle bumps updatedAt, and the merge
// replaces the whole thread object, so the newest pin state wins everywhere.
const pinWins = mergePayload(
  { ...base(), threads: [thread('t1', 100, 'x')] },
  { threads: [{ ...thread('t1', 200, 'x'), pinned: true, pinnedAt: 200 }], senderDeviceId: 'devA' },
  'devZ',
)
check('a newer pin wins the merge', pinWins.threads[0].pinned === true)

const unpinWins = mergePayload(
  { ...base(), threads: [{ ...thread('t1', 100, 'x'), pinned: true, pinnedAt: 100 }] },
  { threads: [thread('t1', 200, 'x')], senderDeviceId: 'devA' },
  'devZ',
)
check('a newer unpin clears an older pin', unpinWins.threads[0].pinned !== true)

const stalePinKept = mergePayload(
  { ...base(), threads: [{ ...thread('t1', 300, 'x'), pinned: true, pinnedAt: 300 }] },
  { threads: [thread('t1', 100, 'x')], senderDeviceId: 'devZ' },
  'devA',
)
check('a stale remote copy does not revert a local pin', stalePinKept.threads[0].pinned === true)

// Pinned threads float above unpinned ones, even under a "newer first" sort.
const pinOrder = sortThreads(
  [
    { id: 'a', name: 'A', projectIds: [], createdAt: 300 },
    { id: 'b', name: 'B', projectIds: [], createdAt: 100, pinned: true, pinnedAt: 100 },
  ],
  { field: 'createdAt', dir: 'desc' },
)
check('pinned threads sort above newer unpinned ones', pinOrder[0].id === 'b')

// Messages and projects pin the same way, using their own item time.
const messagePinWins = mergePayload(
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [msg('m1', 10, 'hello')] } },
  { messages: { t1: [{ ...msg('m1', 10, 'hello'), pinned: true, pinnedAt: 300, updatedAt: 300 }] }, senderDeviceId: 'devA' },
  'devZ',
)
check('a newer message pin wins the merge', messagePinWins.messages.t1[0].pinned === true)

const messageUnpinWins = mergePayload(
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [{ ...msg('m1', 10, 'hello'), pinned: true, pinnedAt: 10, updatedAt: 10 }] } },
  { messages: { t1: [{ ...msg('m1', 10, 'hello'), updatedAt: 300 }] }, senderDeviceId: 'devA' },
  'devZ',
)
check('a newer message unpin clears the pin', messageUnpinWins.messages.t1[0].pinned !== true)

const projectPinWins = mergePayload(
  { ...base(), projects: [{ id: 'p1', name: 'P', createdAt: 100 }] },
  { projects: [{ id: 'p1', name: 'P', createdAt: 100, updatedAt: 200, pinned: true, pinnedAt: 200 }], senderDeviceId: 'devA' },
  'devZ',
)
check('a newer project pin wins the merge', projectPinWins.projects[0].pinned === true)

const pinnedMessageOrder = sortMessages(
  [
    { id: 'm1', threadId: 't1', content: 'a', createdAt: 300 },
    { id: 'm2', threadId: 't1', content: 'b', createdAt: 100, pinned: true, pinnedAt: 100 },
  ],
  { field: 'createdAt', dir: 'desc' },
)
check('pinned messages sort above newer unpinned ones', pinnedMessageOrder[0].id === 'm2')

const pinnedProjectOrder = sortProjects([
  { id: 'a', name: 'Alpha', createdAt: 1 },
  { id: 'b', name: 'Zeta', createdAt: 1, pinned: true, pinnedAt: 2 },
])
check('pinned projects sort above name order', pinnedProjectOrder[0].id === 'b')

// --- 2c. synced view state: drag order + collapse -----------------------------

section('2c. Synced view state — drag order + collapse')

const viewNewerWins = mergeView(
  { 'message:m1': { collapsed: true, updatedAt: 100 } },
  { 'message:m1': { collapsed: false, updatedAt: 200 } },
)
check('a newer view entry wins the merge', viewNewerWins['message:m1'].collapsed === false)

const viewTieIncoming = mergeView(
  { 'message:m1': { collapsed: true, updatedAt: 100 } },
  { 'message:m1': { collapsed: false, updatedAt: 100 } },
  'devZ',
  'devA',
)
check('equal view timestamps break on the larger deviceId', viewTieIncoming['message:m1'].collapsed === false)

const viewTieLocal = mergeView(
  { 'message:m1': { collapsed: true, updatedAt: 100 } },
  { 'message:m1': { collapsed: false, updatedAt: 100 } },
  'devA',
  'devZ',
)
check('equal view timestamps keep the local copy when our id is larger', viewTieLocal['message:m1'].collapsed === true)

const viewThroughPayload = mergePayload(
  { ...base(), threads: [thread('t1', 100)] },
  { view: { 'message:m1': { collapsed: true, updatedAt: 900 } }, senderDeviceId: 'devA' },
  'devZ',
)
check(
  'collapsed state rides through the sync payload',
  viewThroughPayload.view['message:m1']?.collapsed === true,
)

// Rank arithmetic: a drag writes one entry between its neighbours.
check('rankBetween with no neighbours starts the ladder', rankBetween() === RANK_STEP)
check('rankBetween lands strictly between neighbours', rankBetween(1024, 3072) === 2048)
check('rankBetween appends past the last entry', rankBetween(3072, undefined) === 3072 + RANK_STEP)
check('a wide gap is not rebalanced', !needsRebalance(1024, 3072))
check('a narrow gap asks for a rebalance', needsRebalance(1024, 1024.5))

section('2d. Synced settings — the time zone singleton')

// Same LWW clock as items: the settings object with the newer updatedAt wins,
// so changing the zone on one device updates the other seven.
const settingsNewer = mergePayload(
  { ...base(), settings: { timeZone: 'UTC', updatedAt: 100 } },
  { settings: { timeZone: 'Europe/Berlin', updatedAt: 200 } },
  'devA',
)
check('a newer settings object wins', settingsNewer.settings?.timeZone === 'Europe/Berlin')

const settingsOlder = mergePayload(
  { ...base(), settings: { timeZone: 'UTC', updatedAt: 300 } },
  { settings: { timeZone: 'Europe/Berlin', updatedAt: 200 } },
  'devA',
)
check('a local settings edit is not dragged backwards', settingsOlder.settings?.timeZone === 'UTC')

// Exact tie with only one side carrying a value: prefer the side that HAS a
// preference, so a device that set the zone beats one that never touched it.
const settingsTieWithValue = mergePayload(
  { ...base(), settings: {} },
  { settings: { timeZone: 'UTC', updatedAt: 0 } },
  'devA',
)
check('an equal tie prefers the side with a value', settingsTieWithValue.settings?.timeZone === 'UTC')

// Old payloads predate settings entirely — they must not wipe local prefs.
const settingsAbsentRemote = mergePayload(
  { ...base(), settings: { timeZone: 'UTC', updatedAt: 100 } },
  { threads: [thread('t9', 900)] },
  'devA',
)
check('a payload without settings keeps the local zone', settingsAbsentRemote.settings?.timeZone === 'UTC')

const settingsBothEmpty = mergePayload(
  { ...base() },
  {},
  'devA',
)
check('a fresh chain carries empty settings without error', settingsBothEmpty.settings?.timeZone === undefined)

section('2e. Synced variables — per-key LWW pools')

// Same per-key merge rules as view-state: an entry is replaced whole by its
// newer updatedAt, so an edit to one variable can never clobber another one
// edited concurrently on a different device.
const varsThroughPayload = mergePayload(
  { ...base() },
  { variables: { 'global:label': { name: 'label', value: 'v2', updatedAt: 900 } }, senderDeviceId: 'devA' },
  'devZ',
)
check(
  'saved variables ride through the sync payload',
  varsThroughPayload.variables?.['global:label']?.value === 'v2',
)

const varNewerWins = mergePayload(
  { ...base(), variables: { 'global:label': { name: 'label', value: 'old', updatedAt: 100 } } },
  { variables: { 'global:label': { name: 'label', value: 'new', updatedAt: 200 } } },
  'devA',
)
check('a newer variable edit wins', varNewerWins.variables?.['global:label']?.value === 'new')

const varLocalKept = mergePayload(
  { ...base(), variables: { 'global:label': { name: 'label', value: 'new', updatedAt: 300 } } },
  { variables: { 'global:label': { name: 'label', value: 'old', updatedAt: 200 } } },
  'devA',
)
check('a local variable edit is not dragged backwards', varLocalKept.variables?.['global:label']?.value === 'new')

const varTie = mergePayload(
  { ...base(), variables: { 'global:label': { name: 'label', value: 'mine', updatedAt: 200 } } },
  { variables: { 'global:label': { name: 'label', value: 'theirs', updatedAt: 200 } }, senderDeviceId: 'devB' },
  'devA',
)
check('an exact variable tie breaks on the larger deviceId', varTie.variables?.['global:label']?.value === 'theirs')

// Deletion is a tombstone INSIDE the entry (an absent key carries no
// freshness to merge on). A deleted entry newer than the local save hides it;
// a save newer than the deletion resurrects it.
const varDeleted = mergePayload(
  { ...base(), variables: { 'global:label': { name: 'label', value: 'v', updatedAt: 100 } } },
  { variables: { 'global:label': { name: 'label', value: '', updatedAt: 500, deletedAt: 500 } } },
  'devA',
)
check('a newer deletion hides the local copy', varDeleted.variables?.['global:label']?.deletedAt === 500)

const varResurrected = mergePayload(
  { ...base(), variables: { 'global:label': { name: 'label', value: 'saved', updatedAt: 800 } } },
  { variables: { 'global:label': { name: 'label', value: '', updatedAt: 500, deletedAt: 500 } } },
  'devA',
)
check('a save newer than a deletion resurrects the variable', varResurrected.variables?.['global:label']?.deletedAt == null)

// Old payloads predate variables entirely — they must not wipe local ones.
const varsAbsentRemote = mergePayload(
  { ...base(), variables: { 'global:label': { name: 'label', value: 'v', updatedAt: 100 } } },
  { threads: [thread('t9', 900)] },
  'devA',
)
check('a payload without variables keeps the local map', varsAbsentRemote.variables?.['global:label']?.value === 'v')

// --- 2f. Variable store hygiene: dead pools + junk keys ---------------------

section('2f. Variable store hygiene — dead pools and junk keys')

// A thread deleted locally or remotely leaves its {{variables}} pool behind
// forever otherwise: the manager would show a "Deleted thread" pool and that
// pool would ride every later sync payload. Dead scopes tombstone (not bare-
// delete), so the removal syncs per the same rule as every other change.
const deadSweep = tombstoneDeadScopes(
  {
    'global:name': { name: 'name', value: 'g', updatedAt: 100 },
    't-dead:client': { name: 'client', value: 'x', updatedAt: 100 },
    't-alive:lang': { name: 'lang', value: 'y', updatedAt: 100 },
  },
  new Set(['t-alive']),
)
check('a dead thread variable pool is tombstoned', deadSweep['t-dead:client']?.deletedAt != null)
check('a dead pool tombstone runs strictly after any edit in it', (deadSweep['t-dead:client']?.deletedAt ?? 0) >= 101)
check('alive pools survive the sweep untouched', deadSweep['t-alive:lang']?.deletedAt == null)
check('the global pool never sweeps', deadSweep['global:name']?.deletedAt == null)
check('a second sweep of the same map stays quiet', tombstoneDeadScopes(deadSweep, new Set(['t-alive']))['t-dead:client']?.deletedAt != null)

// A hand-edited backup could carry a key with no scope prefix. Every reader
// slices the scope off the first colon, so such a key groups under an empty
// label and is never exportable — normalize drops it at the door.
const junkKey = normalizeVariables({
  'global:label': { name: 'label', value: 'v', updatedAt: 1 },
  'noscope': { name: 'n', value: 'v', updatedAt: 2 },
})
check('a key without a scope prefix is rejected', junkKey['noscope'] === undefined && junkKey['global:label'] != null)

check(
  'moveItem relocates without mutating the source',
  moveItem(['a', 'b', 'c'], 0, 2).join(',') === 'b,c,a' && moveItem(['a', 'b'], 2, 9).join(',') === 'a,b',
)

const firstDrag = applyOrder(emptyView(), ['a', 'b', 'c'], 1, 1000)
check(
  'the first reorder ranks the whole group',
  firstDrag.a.rank === RANK_STEP && firstDrag.b.rank === 2 * RANK_STEP && firstDrag.c.rank === 3 * RANK_STEP,
)

// Dragging 'a' from the top to the middle: only 'a' may change.
const secondDrag = applyOrder(firstDrag, ['b', 'a', 'c'], 1, 2000)
check(
  'a later drag rewrites only the moved entry',
  secondDrag.a.updatedAt === 2000 && secondDrag.b.updatedAt === 1000 && secondDrag.c.updatedAt === 1000,
  JSON.stringify(secondDrag),
)
// 'a' now sits between 'b' (2×STEP) and 'c' (3×STEP), so it takes the midpoint.
check('the moved entry takes a rank between its neighbours', secondDrag.a.rank === 2.5 * RANK_STEP, String(secondDrag.a.rank))

// Ranks outrank pin-first ordering once a user has arranged a list by hand.
const rankBeatsPin = sortThreads(
  [
    { id: 'a', name: 'A', projectIds: [], createdAt: 300, pinned: true },
    { id: 'b', name: 'B', projectIds: [], createdAt: 100 },
  ],
  { field: 'createdAt', dir: 'desc' },
  t => ({ a: 20, b: 10 })[t.id],
)
check('manual order wins over pin-first', rankBeatsPin[0].id === 'b', rankBeatsPin[0].id)

// Items deleted on another device leave inert entries behind; the merge prunes
// them so the synced view map cannot grow forever. Section keys must survive.
const pruned = pruneView(
  { t1: { rank: 1 }, 'message:m1': { rank: 2 }, 'section:home-projects': { collapsed: true } },
  ['t2'],
)
check(
  'pruning drops dead entries but keeps section keys',
  pruned.t1 === undefined && pruned['message:m1'] === undefined && pruned['section:home-projects'] !== undefined,
  JSON.stringify(pruned),
)

// Regression: collapse state is stored under a namespaced key (`message:<id>`)
// because a thread is arranged in several places at once. pruneView used to
// compare the whole key against the alive id set, so every collapsed message
// and sidebar group was wiped by the next sync.
check('a namespaced key resolves to its item id', viewKeyItem('message:m1') === 'm1')
check('a section key names no item', viewKeyItem('section:home-projects') === null)
check('a bare key is already the item id', viewKeyItem('t1') === 't1')

const prunedLive = pruneView(
  { 'message:m1': { collapsed: true }, 'project:p1': { collapsed: true }, m9: { rank: 1 } },
  ['m1', 'p1'],
)
check(
  'pruning keeps namespaced entries whose item is still alive',
  prunedLive['message:m1']?.collapsed === true &&
    prunedLive['project:p1']?.collapsed === true &&
    prunedLive.m9 === undefined,
  JSON.stringify(prunedLive),
)

// --- Filtered reorder: hidden rows must not collide on rank -----------------

// `visible` is what the user sees under a search filter, `full` is everything.
// Ranking only the visible ids would collide with the hidden rows' old ranks.
const visibleOrder = ['a', 'b', 'c', 'd']
const subset = moveWithinSubset(['a', 'b', 'hidden', 'c', 'd'], visibleOrder, 0, 2)
check(
  'a filtered drag splices into the full order, not the visible one',
  subset.join(',') === 'b,hidden,c,a,d',
  subset.join(','),
)
// ...and the visible rows really are in the order that was asked for. Anchoring
// on the pre-move neighbour instead would give 'b,a,c,d' here.
check(
  'the visible rows end up in exactly the requested order',
  subset.filter(id => id !== 'hidden').join(',') === moveItem(visibleOrder, 0, 2).join(','),
  subset.filter(id => id !== 'hidden').join(','),
)
check(
  'dropping onto the last visible row moves the item after the hidden tail',
  moveWithinSubset(['a', 'b', 'hidden'], ['a', 'b'], 0, 1).join(',') === 'b,hidden,a',
  moveWithinSubset(['a', 'b', 'hidden'], ['a', 'b'], 0, 1).join(','),
)
check(
  'a hidden row keeps its position relative to the other hidden rows',
  moveWithinSubset(['a', 'h1', 'h2', 'b'], ['a', 'b'], 1, 0).join(',') === 'b,a,h1,h2',
  moveWithinSubset(['a', 'h1', 'h2', 'b'], ['a', 'b'], 1, 0).join(','),
)
check(
  'an out-of-range source index leaves the order alone',
  moveWithinSubset(['a', 'b'], ['a', 'b'], 9, 0).join(',') === 'a,b',
)

// Every visible id gets a fresh, distinct rank — that is what stops the hidden
// rows from colliding with them.
const renumbered = applyFullOrder(emptyView(), subset, 5000)
const subsetRanks = subset.map(id => renumbered[id].rank)
check(
  'a filtered reorder renumbers every id, visible and hidden alike',
  new Set(subsetRanks).size === subset.length && subsetRanks.every(r => typeof r === 'number'),
  JSON.stringify(subsetRanks),
)
check(
  'hidden rows get a rank too, not just the visible ones',
  typeof renumbered.hidden?.rank === 'number' && renumbered.hidden.updatedAt === 5000,
  JSON.stringify(renumbered.hidden),
)
check(
  'renumbering preserves an existing collapse flag on the same entry',
  applyFullOrder({ m2: { collapsed: true, updatedAt: 1 } }, ['m2'], 9).m2.collapsed === true,
)

// Regression: export filtered the view map by matching raw keys against bare
// item ids, but collapse state lives under a namespaced key (`message:<id>`),
// so exporting a thread silently dropped every collapsed message in it.
useDevice('Exporter')
saveThreads([thread('t1', 100, 'Exportable')])
saveMessages({ t1: [msg('m1', 10, 'first'), msg('m2', 20, 'second')] })
saveView({
  t1: { rank: 1, updatedAt: 1 },
  'message:m2': { collapsed: true, updatedAt: 1 },
  'message:m9': { collapsed: true, updatedAt: 1 },   // belongs to another thread
  'section:home-projects': { collapsed: true, updatedAt: 1 },
})
const threadExport = exportThread('t1')
check(
  'a thread export keeps its collapsed messages',
  threadExport?.view?.['message:m2']?.collapsed === true,
  JSON.stringify(threadExport?.view),
)
check(
  'a thread export keeps its own rank',
  threadExport?.view?.t1?.rank === 1,
  JSON.stringify(threadExport?.view),
)
check(
  'a thread export drops other threads\u2019 collapse state',
  threadExport?.view?.['message:m9'] === undefined,
  JSON.stringify(threadExport?.view),
)
check(
  'a thread export drops UI-only section keys',
  threadExport?.view?.['section:home-projects'] === undefined,
  JSON.stringify(threadExport?.view),
)

// Regression: every *other* device keeps pushing the messages of a thread that
// was deleted here, because its full-state payload predates the delete. The
// tombstone blocked the thread but not its messages, so they were re-imported
// on each sync and grew the payload without bound.
const deletedThreadRemote = mergePayload(
  {
    ...base(),
    deleted: { threads: { t1: 500 }, messages: {}, projects: {} },
    threads: [thread('t2', 100)],
    messages: {},
  },
  {
    senderDeviceId: 'devB',
    threads: [thread('t1', 100), thread('t2', 100)],
    messages: { t1: [msg('m1', 10, 'stale'), msg('m2', 20, 'stale')], t2: [msg('m3', 30, 'live')] },
  },
  'devA',
)
check(
  'a tombstoned thread is not resurrected by a stale remote blob',
  deletedThreadRemote.threads.every(t => t.id !== 't1'),
  JSON.stringify(deletedThreadRemote.threads.map(t => t.id)),
)
check(
  'messages of a deleted thread are pruned, not re-imported every sync',
  deletedThreadRemote.messages.t1 === undefined,
  JSON.stringify(Object.keys(deletedThreadRemote.messages)),
)
check(
  'pruning orphans does not touch a live thread',
  deletedThreadRemote.messages.t2?.length === 1,
  JSON.stringify(deletedThreadRemote.messages.t2?.map(m => m.id)),
)

// --- 2b. importData (local backup merge) -------------------------------------

section('2b. Import merge — no duplication, tombstones respected')

useDevice('Importer')
saveThreads([thread('t1', 10, 'Mine')])
saveMessages({ t1: [msg('m1', 10, 'hello'), msg('m2', 20, 'world')] })

// Bug #2 regression: re-importing the same backup must not duplicate messages.
const reimport = importData({
  version: 1,
  exportedAt: 0,
  threads: [thread('t1', 10, 'Mine')],
  messages: { t1: [msg('m1', 10, 'hello'), msg('m2', 20, 'world')] },
  projects: [],
})
check(
  're-importing the same backup does not duplicate messages',
  reimport.messages.t1.length === 2,
  String(reimport.messages.t1.length),
)

const importEdit = importData({
  version: 1,
  exportedAt: 0,
  threads: [],
  messages: { t1: [{ ...msg('m1', 10, 'hello, edited'), updatedAt: 50 }] },
  projects: [],
})
check(
  'an imported edit replaces the older local copy',
  importEdit.messages.t1.find(m => m.id === 'm1')?.content === 'hello, edited',
)

// Issue #3 regression: an import must not resurrect a tombstoned item.
const importDeleted = importData(
  {
    version: 1,
    exportedAt: 0,
    threads: [thread('t2', 10, 'Deleted elsewhere')],
    messages: {},
    projects: [],
  },
  { threads: { t2: 99 }, projects: {}, messages: {} },
)
check(
  'an import does not resurrect a locally tombstoned thread',
  !importDeleted.threads.some(t => t.id === 't2'),
)

// --- 3. end-to-end through the Pages Functions --------------------------------

section('3. End-to-end sync through the Pages Functions (SQLite)')

useDevice('A')
// Chains are always created secured now: the creating device generates the
// write secret and carries it in its agent config, exactly as App.tsx's
// handleEnableSync does. Joining devices learn it from the pairing token.
const SECRET_A = newWriteSecret()
const agentA = new SyncAgent({ passphrase: PASS, deviceName: 'Device A', chainId: CHAIN_A, writeSecret: SECRET_A })
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

useDevice('B')
// B holds the pairing token, so it carries the same write secret.
const agentB = new SyncAgent({ passphrase: PASS, deviceName: 'Device B', chainId: CHAIN_A, writeSecret: SECRET_A })
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
// `view` is part of SyncData since arrangement landed; these fixtures were
// written before that and omitted it, which typecheck caught.
let dataB: SyncData = {
  threads: [thread('t-b1', 1100, 'From B')],
  messages: {},
  projects: [],
  deleted: emptyDeleted(),
  view: emptyView(),
}
for (const blob of pulledByB.blobs) dataB = mergePayload(dataB, blob as SyncPayload, agentB.getDeviceId())
check('B merges remote + local threads', dataB.threads.length === 2, `got ${dataB.threads.length}`)

const bSeq = await agentB.push({ ...dataB })
check('B push is assigned seq 2 by the server', bSeq === 2, String(bSeq))

const aSecondPull = await agentA.pull()
check('A receives B’s change on the next pull', aSecondPull.blobs.length === 1, `got ${aSecondPull.blobs.length}`)
const aMerged = mergePayload(
  { threads: seedThreads, messages: {}, projects: [], deleted: emptyDeleted(), view: emptyView() },
  aSecondPull.blobs[0] as SyncPayload,
  agentA.getDeviceId(),
)
check('A ends up with both threads', aMerged.threads.length === 2, `got ${aMerged.threads.length}`)

const aThirdPull = await agentA.pull()
check('a subsequent pull is a no-op (watermark advanced)', aThirdPull.blobs.length === 0)

const statusRes = await statusGet({
  request: new Request(
    `https://local.test/sync/status?chain=${CHAIN_A}&deviceId=${agentA.getDeviceId()}`,
  ),
  env,
})
const statusBody: any = await statusRes.json()
check('status reports the chain head', statusBody.serverSeq === 2, String(statusBody.serverSeq))
check('status reports both devices', statusBody.devices.length === 2)

// --- 3c. Recording where calls come from (devices.last_ip) ------------------

// A handshake carrying a real address stamps the device row with it; the UI
// shows it in Settings → Devices so an unexpected guest is apparent. The
// helper reads CF-Connecting-IP only (X-Forwarded-For is client-forged), and
// a request without the header — tests, wrangler dev — must NOT erase a
// recorded address.
const ipHandshake = await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': '203.0.113.7' },
    body: JSON.stringify({ chainId: CHAIN_A, deviceId: agentB.getDeviceId(), deviceName: 'Device B' }),
  }),
  env,
})
check('a handshake carrying an address answers ok', ipHandshake.status === 200, String(ipHandshake.status))

const withIp = await statusGet({
  request: new Request(`https://local.test/sync/status?chain=${CHAIN_A}&deviceId=${agentA.getDeviceId()}`),
  env,
})
const withIpBody: any = await withIp.json()
const rowB = withIpBody.devices.find((d: any) => d.id === agentB.getDeviceId())
check('the last address is recorded on the device row', rowB?.lastIp === '203.0.113.7', JSON.stringify(rowB))

// A header that is not an IP-shaped string is ignored, so junk never lands
// in the column — and a junked caller cannot overwrite the honest value.
const junkHandshake = await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': 'not an ip; drop table' },
    body: JSON.stringify({ chainId: CHAIN_A, deviceId: agentB.getDeviceId(), deviceName: 'Device B' }),
  }),
  env,
})
check('a malformed address header is not fatal', junkHandshake.status === 200, String(junkHandshake.status))

const noIp = await statusGet({
  request: new Request(`https://local.test/sync/status?chain=${CHAIN_A}&deviceId=${agentA.getDeviceId()}`),
  env,
})
const noIpBody: any = await noIp.json()
const rowB2 = noIpBody.devices.find((d: any) => d.id === agentB.getDeviceId())
check('a headerless handshake does not erase the recorded address', rowB2?.lastIp === '203.0.113.7', JSON.stringify(rowB2))

// A wrong passphrase must not silently destroy the watermark.
useDevice('C')
const agentC = new SyncAgent({ passphrase: 'wrong passphrase', deviceName: 'Device C', chainId: CHAIN_A })
await agentC.init()
await agentC.handshake()
const pullC = await agentC.pull()
check('a device with the wrong passphrase reports decrypt failures', pullC.failures > 0, `${pullC.failures}`)
check('a failed decrypt does not advance the watermark', agentC.getLastSeq() === 0, String(agentC.getLastSeq()))
// Sender attribution is what makes the error actionable: C read exactly one
// blob from A and one from B, and neither decrypted — both sit under their
// own device id in the failure map, not as a bare "2 changes".
check(
  'the wrong-key failures are attributed to their senders',
  pullC.decryptFailuresByDevice[agentA.getDeviceId()] === 1 &&
    pullC.decryptFailuresByDevice[agentB.getDeviceId()] === 1,
  JSON.stringify(pullC.decryptFailuresByDevice),
)
check('a wrong key decrypts nothing', Object.keys(pullC.decryptOkByDevice).length === 0)

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
const SECRET_P = newWriteSecret()
const agentP = new SyncAgent({ passphrase: PASS, deviceName: 'Pager P', chainId: CHAIN_P, writeSecret: SECRET_P })
await agentP.init()
await agentP.handshake()

// Seeded straight into storage rather than through 520 HTTP pushes. This test
// is about *pull* paging, and the push route now has a deliberate rate limit —
// driving it with 520 rapid requests would test the throttle instead. The
// ciphertext is produced by the same encryptPayload the agent uses, so the
// paging path under test is identical.
const seedKey = await deriveKey(PASS, CHAIN_P)
for (let i = 0; i < TOTAL; i++) {
  const payload = await encryptPayload(
    {
      threads: [thread(`p-${i}`, i)],
      messages: {},
      projects: [],
      deleted: emptyDeleted(),
      senderDeviceId: agentP.getDeviceId(),
      sentAt: i,
    },
    seedKey,
  )
  sqlite
    .query(
      `INSERT INTO blobs (chain_id, seq, device_id, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(CHAIN_P, i + 1, agentP.getDeviceId(), payload, Date.now())
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

// --- 5. A poisoned blob must not wedge the chain ---------------------------

// The pairing token carries the chainId AND the write secret, but the
// passphrase is whatever each device types. Anyone holding the token can
// therefore append a blob encrypted under a *different* key. The victim
// cannot decrypt it, and the watermark rule ("stop before the first failure
// so it can be retried later") pins the watermark below it permanently — so
// one junk blob blocks every legitimate change behind it, forever.
section('5. A blob the client cannot decrypt does not wedge the chain')

const CHAIN_W = 'chain-poison-0001'
const WRONG_PASS = 'a completely different passphrase'

// The attacker holds the pairing token (chainId + write secret) but types a
// different passphrase — the poison scenario is a KEY mismatch, not a missing
// secret. Their handshake creates the chain, so it installs the token's secret.
const SECRET_W = newWriteSecret()
await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_W, deviceId: 'attacker-device', deviceName: 'Attacker', writeSecret: SECRET_W }),
  }),
  env,
})

// The attacker only knows the chainId.
const attackerKey = await deriveKey(WRONG_PASS, CHAIN_W)
const junk = await encryptPayload(
  {
    senderDeviceId: 'attacker-device',
    threads: [thread('evil', 9e15, 'injected')],
    messages: {},
    projects: [],
    deleted: emptyDeleted(),
    view: emptyView(),
  },
  attackerKey,
)
await pushPost({
  request: new Request('https://local.test/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_W, deviceId: 'attacker-device', data: junk, writeSecret: SECRET_W }),
  }),
  env,
})

useDevice('W')
const agentW = new SyncAgent({ passphrase: PASS, deviceName: 'Victim W', chainId: CHAIN_W, writeSecret: SECRET_W })
await agentW.init()
await agentW.handshake()

// The victim now has a legitimate change that sits *after* the junk blob.
await agentW.push({
  threads: [thread('legit', 1, 'mine')],
  messages: {},
  projects: [],
  deleted: emptyDeleted(),
  view: emptyView(),
})

const wPull = await agentW.pull()
check('the undecryptable blob is reported as a failure', wPull.failures === 1, String(wPull.failures))
check(
  'the poison blob is attributed to its sender id',
  wPull.decryptFailuresByDevice['attacker-device'] === 1,
  JSON.stringify(wPull.decryptFailuresByDevice),
)
check(
  'the watermark stays below the undecryptable blob so it can be retried',
  agentW.getLastSeq() < 1,
  String(agentW.getLastSeq()),
)

// The victim retries — the key is still wrong, so this must not throw, must not
// crash, and must keep reporting the failure rather than advancing past it.
let threw = false
try {
  await agentW.pull()
} catch {
  threw = true
}
check('a repeated pull past the bad blob does not throw', !threw)
check(
  'the watermark still refuses to advance past undecryptable data',
  agentW.getLastSeq() < 2,
  String(agentW.getLastSeq()),
)

// Once the passphrase is corrected, the blob is skipped and the chain flows.
activeStorage = makeStorage()
const agentW2 = new SyncAgent({ passphrase: WRONG_PASS, deviceName: 'Helper', chainId: CHAIN_W })
await agentW2.init()
await agentW2.handshake()
const w2 = await agentW2.pull()
// This client holds the attacker's key, so it reads the poison blob and then
// trips on the *victim's* blob instead. The point is that it got past the
// poison blob rather than being pinned below it.
check('a client holding the attacker key can read it', w2.blobs.length >= 1, String(w2.blobs.length))
check(
  'it advances past the blob it can decrypt',
  agentW2.getLastSeq() >= 1,
  String(agentW2.getLastSeq()),
)

// --- 6. Write auth: a chain id alone cannot write ---------------------------

section('6. Write auth — a chain id alone cannot write to a chain')

const CHAIN_S = 'chain-secret-0001'
// 43 chars of base64url, matching what the server accepts.
const secretS = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_ABCDEFG'
const otherSecret = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'

useDevice('S1')
const agentS1 = new SyncAgent({
  passphrase: PASS,
  deviceName: 'Creator',
  chainId: CHAIN_S,
  writeSecret: secretS,
})
await agentS1.init()
await agentS1.handshake()

const chainRow = sqlite
  .query('SELECT push_hash FROM chains WHERE id = ?')
  .get(CHAIN_S) as { push_hash: string | null }
check('the creating handshake installs a write-secret hash', !!chainRow?.push_hash)
check('the stored value is 64 hex chars (SHA-256)', /^[0-9a-f]{64}$/.test(String(chainRow?.push_hash)))
check(
  'the server stores only a hash, never the secret itself',
  !JSON.stringify(chainRow).includes(secretS),
)

const okPush = await agentS1.push({
  threads: [thread('t1', 1, 'legit')],
  messages: {},
  projects: [],
  deleted: emptyDeleted(),
})
check('the holder of the write secret can push', okPush > 0, String(okPush))

// The attack this closes: a device that knows only the chainId.
useDevice('Evil')
const evil = new SyncAgent({ passphrase: 'wrong', deviceName: 'Attacker', chainId: CHAIN_S })
await evil.init()
await evil.handshake()
const poisoned = await encryptPayload(
  { senderDeviceId: 'attacker', threads: [], messages: {}, projects: [], deleted: emptyDeleted(), view: emptyView() },
  await deriveKey('wrong passphrase', CHAIN_S),
)
const evilId = evil.getDeviceId()

const noSecret = await pushPost({
  request: new Request('https://local.test/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_S, deviceId: evilId, data: poisoned }),
  }),
  env,
})
const noSecretBody = (await noSecret.json()) as { error?: string }
check('a push with no write secret is rejected', noSecret.status === 401, String(noSecret.status))
check('the rejection names what is missing', /write secret/i.test(noSecretBody.error || ''), noSecretBody.error)

const wrongSecret = await pushPost({
  request: new Request('https://local.test/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_S, deviceId: evilId, data: poisoned, writeSecret: otherSecret }),
  }),
  env,
})
check('a push with the wrong write secret is rejected', wrongSecret.status === 403, String(wrongSecret.status))
const wrongSecretBody = (await wrongSecret.json()) as { error?: string }
check('the wrong-secret rejection says so', /wrong write secret/i.test(wrongSecretBody.error || ''), wrongSecretBody.error)

const stored = sqlite
  .query('SELECT COUNT(*) AS n FROM blobs WHERE chain_id = ?')
  .get(CHAIN_S) as { n: number }
check('neither rejected blob reached storage', stored.n === 1, String(stored.n))

// A device paired with the secret (as the QR carries it) can write.
useDevice('S2')
const agentS2 = new SyncAgent({
  passphrase: PASS,
  deviceName: 'Joiner',
  chainId: CHAIN_S,
  writeSecret: secretS,
})
await agentS2.init()
await agentS2.handshake()
const joinerPush = await agentS2.push({
  threads: [thread('t2', 2, 'joined')],
  messages: {},
  projects: [],
  deleted: emptyDeleted(),
})
check('a paired device holding the secret can push', joinerPush > 0, String(joinerPush))

// One without the secret can still read, but cannot write.
useDevice('S3')
const agentS3 = new SyncAgent({ passphrase: PASS, deviceName: 'Reader', chainId: CHAIN_S })
await agentS3.init()
await agentS3.handshake()
check(
  'a device without the secret can still read',
  (await agentS3.pull()).blobs.length >= 1,
)
let readerPush = 0
try {
  await agentS3.push({ threads: [thread('t3', 3, 'nope')], messages: {}, projects: [], deleted: emptyDeleted() })
} catch (err) {
  readerPush = /write secret/i.test(String((err as Error)?.message || err)) ? 1 : 2
}
check('a device without the secret cannot write', readerPush === 1, String(readerPush))

// --- 6b. Chains without write auth no longer exist -------------------------

section('6b. Legacy (pre write-auth) chains are refused')

// Legacy support — chains creatable without a secret and claimable later —
// was dropped on purpose: first-come-wins claiming was a real takeover window,
// and the legacy window in production lasted about two hours. A handshake that
// creates a chain now REQUIRES the secret, checked before the row exists.
const CHAIN_L = 'chain-legacy-0001'
const noSecretCreate = await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_L, deviceId: 'legacy-owner', deviceName: 'Legacy' }),
  }),
  env,
})
check('creating a chain without a write secret is refused', noSecretCreate.status === 400, String(noSecretCreate.status))
check(
  'the refused handshake created no chain row',
  !sqlite.query('SELECT id FROM chains WHERE id = ?').get(CHAIN_L),
)

// The claim endpoint was the takeover window; it is retired entirely.
const claimGone = await fetch('https://local.test/sync/claim', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chainId: CHAIN_L, deviceId: 'legacy-owner', writeSecret: otherSecret }),
})
check('the claim endpoint is retired (404)', claimGone.status === 404, String(claimGone.status))

// An unsecured chain row is unreachable through the API now. If storage were
// ever tampered into that state, push must refuse rather than write unauthed.
sqlite.query("INSERT INTO chains (id, created_at, version) VALUES ('chain-orphan-01', 1, 1)").run()
const unsecuredPush = await pushPost({
  request: new Request('https://local.test/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: 'chain-orphan-01', deviceId: 'orphan-device', data: 'aaa.bbb' }),
  }),
  env,
})
check('a push to a chain row with no push_hash is refused', unsecuredPush.status === 500, String(unsecuredPush.status))

// --- 6c. Pairing token round-trip -------------------------------------------

section('6c. Pairing token carries the write secret')

const parsedNew = chainIdFromToken(pairingTokenFromChain(CHAIN_S, secretS))
check('a new token round-trips both parts', parsedNew?.chainId === CHAIN_S && parsedNew?.writeSecret === secretS)
check(
  'a legacy token still parses, with no secret',
  chainIdFromToken(`GS1-${CHAIN_S}`)?.chainId === CHAIN_S &&
    chainIdFromToken(`GS1-${CHAIN_S}`)?.writeSecret === undefined,
)
check('a bare chain id still parses', chainIdFromToken(CHAIN_S)?.chainId === CHAIN_S)
check('garbage is still rejected', chainIdFromToken('not a token!') === null)

// --- 6d. Write-auth errors are actionable -----------------------------------

section('6d. Write-auth errors reach the user as something they can act on')

// These are the strings the server returns; the client must translate them
// rather than showing a log-shaped string, because each has a real remedy.
check(
  'a missing write secret tells the user to re-pair',
  /pair it again with a current pairing code/i.test(errorMessage(new Error(noSecretBody.error || ''))),
  errorMessage(new Error(noSecretBody.error || '')),
)
check(
  'a wrong write secret tells the user to re-pair',
  /not allowed to write/i.test(errorMessage(new Error(wrongSecretBody.error || ''))),
  errorMessage(new Error(wrongSecretBody.error || '')),
)
check(
  'an unrelated error is passed through unchanged',
  errorMessage(new Error('Cannot reach the sync server — are you offline?')) ===
    'Cannot reach the sync server — are you offline?',
)
check('a non-Error value still yields a string', typeof errorMessage('boom') === 'string')

// --- 6e. Decrypt-failure attribution: the branches the UI depends on --------

section('6e. Undecryptable blobs are attributed to a device, not a count')

const DEVICES = [
  { id: 'dev-a', name: 'Device A' },
  { id: 'dev-b', name: 'Device B' },
]

check(
  'a single named peer failing reads as THAT device needing the fix',
  /Device A/.test(
    describeDecryptFailures({
      failBy: { 'dev-a': 49 },
      okBy: { 'dev-b': 12 },
      myDeviceId: 'me',
      devices: DEVICES,
      failures: 49,
    }),
  ) && /Hard-reload THAT device/.test(
    describeDecryptFailures({
      failBy: { 'dev-a': 49 },
      okBy: { 'dev-b': 12 },
      myDeviceId: 'me',
      devices: DEVICES,
      failures: 49,
    }),
  ),
  describeDecryptFailures({
    failBy: { 'dev-a': 49 },
    okBy: { 'dev-b': 12 },
    myDeviceId: 'me',
    devices: DEVICES,
    failures: 49,
  }),
)

check(
  'no peer ever decrypting reads as THIS device being out of key',
  /this device is out of key/.test(
    describeDecryptFailures({
      failBy: { 'dev-a': 49, 'dev-b': 2 },
      okBy: {},
      myDeviceId: 'me',
      devices: DEVICES,
      failures: 51,
    }),
  ),
  describeDecryptFailures({
    failBy: { 'dev-a': 49, 'dev-b': 2 },
    okBy: {},
    myDeviceId: 'me',
    devices: DEVICES,
    failures: 51,
  }),
)

check(
  'a writer unknown to the chain reads as tampering, not key drift',
  /tampered/.test(
    describeDecryptFailures({
      failBy: { 'junkwriter1': 3 },
      okBy: { 'dev-a': 5 },
      myDeviceId: 'me',
      devices: DEVICES,
      failures: 3,
    }),
  ) && (describeDecryptFailures({
    failBy: { 'junkwriter1': 3 },
    okBy: { 'dev-a': 5 },
    myDeviceId: 'me',
    devices: DEVICES,
    failures: 3,
  }).includes('id junkwrit')),
  describeDecryptFailures({
    failBy: { 'junkwriter1': 3 },
    okBy: { 'dev-a': 5 },
    myDeviceId: 'me',
    devices: DEVICES,
    failures: 3,
  }),
)

check(
  'several failing peers are listed with their counts',
  describeDecryptFailures({
    failBy: { 'dev-a': 2, 'dev-b': 3 },
    okBy: { 'dev-a': 1 }, // a peer can read MOST blobs and still poison a few
    myDeviceId: 'me',
    devices: DEVICES,
    failures: 5,
  }).includes('2 from') &&
    describeDecryptFailures({
      failBy: { 'dev-a': 2, 'dev-b': 3 },
      okBy: { 'dev-a': 1 },
      myDeviceId: 'me',
      devices: DEVICES,
      failures: 5,
    }).includes('3 from'),
  describeDecryptFailures({
    failBy: { 'dev-a': 2, 'dev-b': 3 },
    okBy: { 'dev-a': 1 },
    myDeviceId: 'me',
    devices: DEVICES,
    failures: 5,
  }),
)

const myId = 'dev-a'
// Own-id entries are excluded from the peer branches: the pull route filters
// own blobs, so one appearing at all would mean identity forgery, but either
// way it must not be presented as "another device".
const ownIdMessage = describeDecryptFailures({
  failBy: { [myId]: 1, 'dev-b': 4 },
  okBy: { 'dev-b': 1, [myId]: 2 },
  myDeviceId: myId,
  devices: DEVICES,
  failures: 5,
})
check(
  'failures attributed to own id are excluded, not masked as a peer',
  ownIdMessage.includes('4 change(s) from') && !ownIdMessage.includes('Device A'),
  ownIdMessage,
)

// --- 8. Guards: throttle, circuit breaker, WAF ------------------------------

section('8a. Throttle — fixed-window counter (pure)')

const P = POLICIES.push
const t0 = 1_000_000

// A brand new bucket allows its first request.
const first = evaluateLimit(null, P, t0)
check('an unseen bucket allows the first request', first.ok)
check('the first request reports the rest of the budget', first.ok && first.decision.remaining === P.limit - 1, String(first.ok && first.decision.remaining))
check('an allowed request opens a window at its own timestamp', first.ok && first.decision.windowStart === t0)

// Walk a window to exhaustion.
let row: LimitRow | null = null
let allowedCount = 0
for (let i = 0; i < P.limit; i++) {
  const outcome = evaluateLimit(row, P, t0 + i)
  if (!outcome.ok) break
  allowedCount++
  row = { window_start: outcome.decision.windowStart, count: i + 1 }
}
check(`exactly ${P.limit} requests fit in one window`, allowedCount === P.limit, String(allowedCount))

const over = evaluateLimit(row, P, t0 + P.limit)
check('the request past the limit is refused', !over.ok)
check('the refusal says how long to wait', !over.ok && over.retryAfterMs > 0 && over.retryAfterMs <= P.windowMs, !over.ok ? String(over.retryAfterMs) : 'allowed')

// The window resets rather than the count creeping forever.
const afterWindow = evaluateLimit(row, P, t0 + P.windowMs)
check('the window resets once it expires', afterWindow.ok)
check('the reset window starts at the new request time', afterWindow.ok && afterWindow.decision.windowStart === t0 + P.windowMs)

// A row from the future (clock skew between devices) must not lock anyone out.
const skewed = evaluateLimit({ window_start: t0 + 10 * P.windowMs, count: P.limit }, P, t0)
check('a window start in the future still allows the request', skewed.ok)

check('retry-after rounds up to whole seconds', retryAfterSeconds(1) === 1 && retryAfterSeconds(1500) === 2 && retryAfterSeconds(0) === 1)
check('every policy has a positive limit and window', Object.values(POLICIES).every((p) => p.limit > 0 && p.windowMs > 0))
check('the push limit leaves room for the client debounce', POLICIES.push.limit > 40, String(POLICIES.push.limit))

// The same maths, through the real D1 path.
const bucketRowBefore = await readLimit(d1 as any, 't', 'subject')
check('an unwritten bucket reads as null', bucketRowBefore === null)
for (let i = 0; i < POLICIES.handshake.limit; i++) {
  await consumeLimit(d1 as any, 't', 'subject', POLICIES.handshake, t0 + i)
}
const bucketStored = await readLimit(d1 as any, 't', 'subject')
check('the stored counter matches the requests made', bucketStored?.count === POLICIES.handshake.limit, String(bucketStored?.count))
const denied = await consumeLimit(d1 as any, 't', 'subject', POLICIES.handshake, t0 + POLICIES.handshake.limit)
check('consumeLimit refuses past the limit', !denied.ok)
const afterDenial = await readLimit(d1 as any, 't', 'subject')
check('a refused request does not advance the counter', afterDenial?.count === POLICIES.handshake.limit, String(afterDenial?.count))
const recovered = await consumeLimit(d1 as any, 't', 'subject', POLICIES.handshake, t0 + POLICIES.handshake.limit + POLICIES.handshake.windowMs)
check('the bucket recovers once the window rolls over', recovered.ok)
check('the recovered window restarts the count at 1', (await readLimit(d1 as any, 't', 'subject'))?.count === 1)
await pruneLimits(d1 as any, t0 + POLICIES.handshake.limit + POLICIES.handshake.windowMs + 11 * 60_000)
check('pruning drops buckets whose window closed long ago', (await readLimit(d1 as any, 't', 'subject')) === null)

// The byte-budget consumer: the same upsert, but one request can move the
// counter by more than 1 — `count` reads units spent, not requests. This is
// the storage-cost backstop for full-state payloads (2026-10-25 incident).
//
// Admission compares the CURRENT counter to the policy, so a single charge is
// inspected (and capped by MAX_PAYLOAD_BYTES in the route), while the budget
// refuses once the counter is already at or past the limit — a loop of
// max-sized pushes burns the budget charge by charge and then stalls. The 40MB
// sized charge below is impossible as ONE payload (route cap is 5MB); it
// models many pushes in one window arriving at the counter.
const BC = POLICIES.pushChainBytes
const firstByteCharge = await consumeLimitUnits(d1 as any, 'push-chain-bytes', 'chain-budget', BC, 40_000_000, t0)
check('a weighted charge under the byte budget is admitted', firstByteCharge.ok)
check('the byte counter starts AT its units, not 1', (await readLimit(d1 as any, 'push-chain-bytes', 'chain-budget'))?.count === 40_000_000)
// The counter is at 40MB of a 96MB budget: 56MB more fits exactly, and the
// next charge sees the counter already at the limit and is refused. (A real
// loop can overshoot by at most one payload — admission compares the CURRENT
// counter; MAX_PAYLOAD_BYTES bounds the overshoot, which is fine: the budget
// is here to catch a flood, not to meter a single write.)
const nearLimit = await consumeLimitUnits(d1 as any, 'push-chain-bytes', 'chain-budget', BC, 56_000_000, t0 + 1000)
check('a charge that lands just under the budget is admitted', nearLimit.ok)
check('weighted charges accumulate rather than reset', (await readLimit(d1 as any, 'push-chain-bytes', 'chain-budget'))?.count === 96_000_000)
const overByteBudget = await consumeLimitUnits(d1 as any, 'push-chain-bytes', 'chain-budget', BC, 5_000_000, t0 + 2000)
check('a charge against an exhausted byte budget is refused', !overByteBudget.ok)
check('a refused byte charge does not advance the counter', (await readLimit(d1 as any, 'push-chain-bytes', 'chain-budget'))?.count === 96_000_000)
const nextDay = await consumeLimitUnits(d1 as any, 'push-chain-bytes', 'chain-budget', BC, 5_000_000, t0 + BC.windowMs)
check('the byte budget resets with the window', nextDay.ok)
check('the reset byte counter restarts at the new charge', (await readLimit(d1 as any, 'push-chain-bytes', 'chain-budget'))?.count === 5_000_000)

section('8b. Circuit breaker (pure)')

const BP: BreakerPolicy = { failures: 3, cooldownMs: 1000 }
let st: BreakerState = 'closed'
let budget = BP.failures
for (let i = 0; i < BP.failures - 1; i++) {
  const step = advanceBreaker(st, budget, 'failure', BP)
  st = step.next
  budget = step.budget
}
check('the breaker stays closed while there is budget left', st === 'closed', st)
check('the budget is spent one failure at a time', budget === 1, String(budget))
const opens = advanceBreaker(st, budget, 'failure', BP)
check('the breaker opens on the last failure', opens.next === 'open', opens.next)
check('an open breaker reports the cooldown as the wait', opens.retryAfterMs === BP.cooldownMs, String(opens.retryAfterMs))

const openNow = breakerAllows('open', t0, BP, t0)
check('an open breaker blocks immediately', openNow.retryAfterMs > 0)
check('an open blocker never reports budget', openNow.budget === 0)
const stillWaiting = breakerAllows('open', t0, BP, t0 + 500)
check('the wait counts down with the cooldown', stillWaiting.retryAfterMs === 500, String(stillWaiting.retryAfterMs))
const trial = breakerAllows('open', t0, BP, t0 + BP.cooldownMs)
check('a served cooldown lets one trial request through', trial.retryAfterMs === 0)

check('a success closes an open breaker', advanceBreaker('open', 0, 'success', BP).next === 'closed')
check('a success restores the full budget', advanceBreaker('open', 0, 'success', BP).budget === BP.failures)
check('a failed trial re-opens rather than closing', advanceBreaker('open', 0, 'failure', BP).next === 'open')
check('a failure while open does not re-arm the cooldown', advanceBreaker('open', 0, 'failure', BP).retryAfterMs === 0)

// The real singleton, including the "dead database must not re-arm forever" case.
resetBreaker()
for (let i = 0; i < BREAKER_POLICY.failures; i++) breakerRecord('failure', t0)
check('the breaker opens after the configured failures', breakerPeek(t0).retryAfterMs > 0)
breakerRecord('failure', t0 + 1000)
check('a failure during cooldown does not extend the wait', breakerPeek(t0 + 1000).retryAfterMs === BREAKER_POLICY.cooldownMs - 1000, String(breakerPeek(t0 + 1000).retryAfterMs))
check('the breaker serves a trial request after the cooldown', breakerPeek(t0 + BREAKER_POLICY.cooldownMs).retryAfterMs === 0)
breakerRecord('success', t0 + BREAKER_POLICY.cooldownMs)
check('a successful trial closes it again', breakerPeek(t0 + BREAKER_POLICY.cooldownMs + 1).retryAfterMs === 0)
resetBreaker()
check('resetBreaker returns it to closed', breakerPeek(t0).retryAfterMs === 0 && breakerPeek(t0).budget === BREAKER_POLICY.failures)

// The budget must be spent by failures seen, not assumed from the policy.
resetBreaker()
breakerRecord('failure', t0)
check('one failure leaves budget-1', breakerPeek(t0).budget === BREAKER_POLICY.failures - 1, String(breakerPeek(t0).budget))
breakerRecord('success', t0)
check('a success restores the budget after one failure', breakerPeek(t0).budget === BREAKER_POLICY.failures)

// An open breaker must produce a 503 with a Retry-After the client can use.
resetBreaker()
for (let i = 0; i < BREAKER_POLICY.failures; i++) breakerRecord('failure', t0)
const breakerResp = breakerResponse(BREAKER_POLICY.cooldownMs)
check('an open breaker answers 503', breakerResp.status === 503, String(breakerResp.status))
check('the 503 carries Retry-After', breakerResp.headers.get('Retry-After') === '15', String(breakerResp.headers.get('Retry-After')))
resetBreaker()

section('8c. WAF — reject what is not the protocol')

check('a real push body passes', inspectBody({ chainId: 'chain-a', deviceId: 'dev-1', data: 'aaa.bbb' }, { maxDataBytes: 100 }).ok)
check('a body with no data field passes', inspectBody({ chainId: 'chain-a' }, { maxDataBytes: 100 }).ok)
check('a JSON array is refused', !inspectBody([1, 2, 3], { maxDataBytes: 100 }).ok)
check('a bare string is refused', !inspectBody('hello', { maxDataBytes: 100 }).ok)
check('null is refused', !inspectBody(null, { maxDataBytes: 100 }).ok)
check('a __proto__ key is refused', !inspectBody(JSON.parse('{"__proto__":{"polluted":true}}'), { maxDataBytes: 100 }).ok)
check('a constructor key is refused', !inspectBody({ constructor: 'x' }, { maxDataBytes: 100 }).ok)
check('a field explosion is refused', !inspectBody(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, 1])), { maxDataBytes: 100 }).ok)
check('a non-string data field is refused', !inspectBody({ data: { nested: true } }, { maxDataBytes: 100 }).ok)
check('an oversized data field is refused', !inspectBody({ data: 'x'.repeat(101) }, { maxDataBytes: 100 }).ok)
check('control characters are detected', hasControlChars('a\x00b') && !hasControlChars('normal-id_123'))
check('a tab and newline also count as control characters', hasControlChars('a\tb') && hasControlChars('a\nb'))
check('an ordinary base64url secret has no control characters', !hasControlChars('aB3-_xyz'))
check('the body cap exceeds the payload cap', MAX_BODY_BYTES >= 5_000_000)
check('the body cap is enforced by readJson, not just declared', (() => {
  let caught = false
  try {
    const big = { data: 'x'.repeat(MAX_BODY_BYTES + 10) }
    if (JSON.stringify(big).length > MAX_BODY_BYTES) caught = true
  } catch {
    caught = true
  }
  return caught
})())

section('8d. Client QoS — backoff and coalescing (pure)')

check('the backoff starts at the base delay', backoffDelay(1, { baseMs: 100, maxMs: 10000 }) === 100)
check('the backoff doubles', backoffDelay(2, { baseMs: 100, maxMs: 10000 }) === 200)
check('the backoff keeps doubling', backoffDelay(3, { baseMs: 100, maxMs: 10000 }) === 400)
check('the backoff is capped', backoffDelay(20, { baseMs: 100, maxMs: 10000 }) === 10000)
check('attempt 0 is treated as the first attempt', backoffDelay(0, { baseMs: 100, maxMs: 10000 }) === 100)
check('a server Retry-After wins over the curve', backoffDelay(1, { baseMs: 100, maxMs: 10000, retryAfterMs: 5000 }) === 5000)
check('a server Retry-After is still capped by maxMs', backoffDelay(1, { baseMs: 100, maxMs: 2000, retryAfterMs: 99999 }) === 2000)
check('a zero Retry-After falls back to the curve', backoffDelay(1, { baseMs: 100, maxMs: 10000, retryAfterMs: 0 }) === 100)
check('jitter adds to the delay', backoffDelay(1, { baseMs: 100, maxMs: 10000, jitter: () => 50 }) === 150)
check('the curve never exceeds maxMs with jitter', backoffDelay(9, { baseMs: 100, maxMs: 1000, jitter: () => 500 }) === 1000)

// Drive SyncQos with a fake clock and manual timers, so no real waiting.
function fakeTimers() {
  let now = 0
  const pending: { at: number; fn: () => void; handle: number }[] = []
  let nextHandle = 1
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const handle = nextHandle++
      pending.push({ at: now + ms, fn, handle })
      return handle
    },
    clearTimer: (handle: unknown) => {
      const i = pending.findIndex((t) => t.handle === handle)
      if (i >= 0) pending.splice(i, 1)
    },
    /** Fire everything due within `ms`, letting promises settle between. */
    async advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = pending.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        now = Math.max(now, due.at)
        const i = pending.findIndex((t) => t.handle === due.handle)
        if (i >= 0) pending.splice(i, 1)
        due.fn()
        await Promise.resolve()
        await Promise.resolve()
      }
      now = target
      await Promise.resolve()
    },
    get pendingCount() {
      return pending.length
    },
  }
}

// Coalescing: a burst of changes must produce one push, not N.
{
  const clock = fakeTimers()
  let pushes = 0
  const qos = new SyncQos({
    onPush: async () => { pushes++ },
    debounceMs: 100,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  qos.schedule()
  qos.schedule()
  qos.schedule()
  check('a burst of schedules leaves exactly one timer', clock.pendingCount === 1)
  await clock.advance(100)
  check('a burst of changes coalesces into one push', pushes === 1, String(pushes))
  check('the scheduler is idle after a successful push', qos.getState().status === 'idle' && !qos.getState().pending)
}

// Changes during an in-flight push are coalesced into exactly one more push,
// and the newest state is what ships.
{
  const clock = fakeTimers()
  let pushes = 0
  let release: (() => void) | null = null
  let sawSecond = false
  const qos = new SyncQos({
    onPush: async () => {
      pushes++
      if (pushes === 1) {
        await new Promise<void>((resolve) => { release = resolve })
      } else {
        sawSecond = true
      }
    },
    debounceMs: 100,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  qos.schedule()
  await clock.advance(100)
  check('the first push is running', pushes === 1)

  // Three more changes land while that push is in flight.
  qos.schedule()
  qos.schedule()
  qos.schedule()
  check('changes during a push mark it pending', qos.getState().pending)
  check('no second timer is armed while a push is in flight', clock.pendingCount === 0)

  release!()
  await Promise.resolve()
  await Promise.resolve()
  await clock.advance(100)
  check('the in-flight changes produce exactly one follow-up push', pushes === 2 && sawSecond, String(pushes))
}

// A failed push is retried, never dropped.
{
  const clock = fakeTimers()
  let attempts = 0
  let succeeded = false
  const qos = new SyncQos({
    onPush: async () => {
      attempts++
      if (!succeeded) throw new Error('offline')
    },
    debounceMs: 100,
    retryBaseMs: 500,
    retryMaxMs: 10000,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  qos.schedule()
  await clock.advance(100)
  check('a failing push is attempted', attempts === 1)
  check('a failed push stays pending rather than being dropped', qos.getState().pending)
  check('the failure is counted', qos.getState().failures === 1)

  await clock.advance(500)
  check('a failed push is retried after the backoff', attempts === 2, String(attempts))
  await clock.advance(1000)
  check('the retry keeps backing off', attempts === 3, String(attempts))
  check('backoff status is reported while retrying', qos.getState().status === 'backing-off')

  succeeded = true
  await clock.advance(2000)
  check('a retry that succeeds stops the loop', attempts === 4, String(attempts))
  await clock.advance(20000)
  check('no further attempts once it succeeds', attempts === 4, String(attempts))
  check('the failure count resets on success', qos.getState().failures === 0)
  check('nothing is pending after recovery', !qos.getState().pending)
}

// A server Retry-After overrides the computed backoff.
{
  const clock = fakeTimers()
  let attempts = 0
  const qos = new SyncQos({
    onPush: async () => { attempts++; throw new Error('throttled') },
    debounceMs: 100,
    retryBaseMs: 500,
    retryMaxMs: 10000,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  qos.setRetryAfter(4000)
  qos.schedule()
  await clock.advance(100)
  check('the first attempt failed', attempts === 1)
  await clock.advance(3000)
  check('a server Retry-After is honoured even though it exceeds the curve', attempts === 1, String(attempts))
  await clock.advance(1500)
  check('the retry happens once the server wait has passed', attempts === 2, String(attempts))
}

// onPush is never re-entered.
{
  const clock = fakeTimers()
  let concurrent = 0
  let maxConcurrent = 0
  let release: (() => void) | null = null
  const qos = new SyncQos({
    onPush: async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise<void>((resolve) => { release = resolve })
      concurrent--
    },
    debounceMs: 10,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  qos.schedule()
  await clock.advance(10)
  // flush() mid-flight must not start a second push.
  qos.flush()
  qos.flush()
  check('flush during an in-flight push does not run it twice', maxConcurrent === 1, String(maxConcurrent))
  release!()
  await Promise.resolve()
}

// stop() must prevent any further work.
{
  const clock = fakeTimers()
  let pushes = 0
  const qos = new SyncQos({
    onPush: async () => { pushes++ },
    debounceMs: 100,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  qos.schedule()
  qos.stop()
  check('stop clears the pending timer', clock.pendingCount === 0)
  await clock.advance(1000)
  check('nothing runs after stop', pushes === 0)
  qos.schedule()
  await clock.advance(1000)
  check('scheduling after stop is a no-op', pushes === 0)
}

section('8e. Throttled errors reach the user as a pause, not a failure')

const throttled = new SyncError('Too many push requests', 429, 30_000)
check('429 is recognised as throttled', throttled.throttled)
check('503 is recognised as throttled', new SyncError('unavailable', 503).throttled)
check('a 403 is not throttled', !new SyncError('wrong write secret', 403).throttled)
check('being offline is not throttled', !new SyncError('offline', 0).throttled)
check('a throttle message says the wait', /in about 30s/i.test(errorMessage(throttled)), errorMessage(throttled))
check('a throttle message says nothing is lost', /saved locally/i.test(errorMessage(throttled)))
check('a throttle without a hint still reads as a pause', /shortly/i.test(errorMessage(new SyncError('busy', 429))))
check('a 429 message does not leak the raw server text', !/Too many push/.test(errorMessage(throttled)))

// Retry-After parsing, both wire forms.
check('delta-seconds Retry-After is read', retryAfterFrom(new Response(null, { headers: { 'Retry-After': '42' } })) === 42000)
check('a date Retry-After is read', typeof retryAfterFrom(new Response(null, { headers: { 'Retry-After': new Date(Date.now() + 5000).toUTCString() } })) === 'number')
check('a missing Retry-After is undefined', retryAfterFrom(new Response(null)) === undefined)
check('a garbage Retry-After is undefined', retryAfterFrom(new Response(null, { headers: { 'Retry-After': 'soon-ish' } })) === undefined)

section('8f. Guards are live on the real routes')

const CHAIN_G = 'chain-guard-0009'
const SECRET_G = newWriteSecret()
const storageG = makeStorage() as any
activeStorage = storageG
const agentG = new SyncAgent({
  passphrase: PASS,
  deviceName: 'Guard G',
  chainId: CHAIN_G,
  writeSecret: SECRET_G,
})
await agentG.init()
await agentG.handshake()
check('a secured chain accepts a normal push', typeof (await agentG.push({ threads: [], messages: {}, projects: [], deleted: emptyDeleted() })) === 'number')

// Write-secret guessing is charged to its own budget, not the push budget.
useDevice('guesser')
for (let i = 0; i < POLICIES.writeFailures.limit; i++) {
  const res = await pushPost({
    request: new Request('https://local.test/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: CHAIN_G,
        deviceId: 'guesser-device',
        data: 'aaa.bbb',
        writeSecret: newWriteSecret(),
      }),
    }),
    env,
  })
  if (res.status !== 403) break
}
const guessBlocked = await pushPost({
  request: new Request('https://local.test/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_G, deviceId: 'guesser-device', data: 'aaa.bbb', writeSecret: newWriteSecret() }),
  }),
  env,
})
check('repeated wrong secrets are throttled with 429', guessBlocked.status === 429, String(guessBlocked.status))
check('the throttle tells the client when to retry', !!guessBlocked.headers.get('Retry-After'), String(guessBlocked.headers.get('Retry-After')))
check('the throttled body carries the wait in ms', typeof (await guessBlocked.clone().json() as any).retryAfterMs === 'number')

// Guessing did NOT spend the legitimate device's push budget.
activeStorage = storageG
const stillPushes = await agentG.push({ threads: [], messages: {}, projects: [], deleted: emptyDeleted() })
check('guessing does not spend the owner push budget', typeof stillPushes === 'number', String(stillPushes))

// ── Flood resistance ─────────────────────────────────────────────────────────
// Two adversarial shapes beyond the guess-the-secret budget above: the CHEAPEST
// push flood (omit the write secret entirely) and the identity-rotating flood
// (every per-identity bucket is keyed by client-supplied ids, so rotation gets
// a fresh budget per request). The per-IP bucket is keyed by CF-Connecting-IP,
// which a caller cannot rotate — and which the smoke's other calls never send,
// so this bucket stays untouched by the rest of this file.

// A missing write secret is charged to the same guess budget as a wrong one.
// Without this, omitting the field buys unlimited uncharged 401s.
{
  const chainNF = 'nf-chain-01'
  const secretNF = newWriteSecret()
  await handshakePost({
    request: new Request('https://local.test/sync/handshake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: chainNF, deviceId: 'nf-owner', deviceName: 'NF owner', writeSecret: secretNF }),
    }),
    env,
  })
  const ownerRes = await pushPost({
    request: new Request('https://local.test/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: chainNF, deviceId: 'nf-owner', data: 'aaa.bbb', writeSecret: secretNF }),
    }),
    env,
  })
  check('a freshly secured chain accepts its owner', ownerRes.status === 200, String(ownerRes.status))

  // Fresh deviceId per attempt: the per-device push bucket must never be what
  // stops this — the write-fail budget is.
  let missingSecretBlocked = false
  let attempts = 0
  for (; attempts <= POLICIES.writeFailures.limit; attempts++) {
    const res = await pushPost({
      request: new Request('https://local.test/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: chainNF, deviceId: 'no-secret-' + attempts, data: 'aaa.bbb' }),
      }),
      env,
    })
    if (res.status === 429) { missingSecretBlocked = true; break }
    if (res.status !== 401) break
  }
  check('a missing write secret is charged to the guess budget', missingSecretBlocked, `after ${attempts} attempts`)
}

// The per-IP backstop: 1200 pulls from one IP with a DIFFERENT deviceId each
// time — the pull bucket never triggers (240 fresh per id), so the refusal can
// only come from the flood bucket. Then: a different IP is unaffected, and a
// request with no connecting IP (tests, wrangler dev) skips the bucket.
{
  const FLOOD_IP = '198.51.100.10'
  const pullFrom = (ip: string | null, deviceId: string) =>
    pullGet({
      request: new Request(
        `https://local.test/sync/pull?chain=${CHAIN_G}&since=0&deviceId=${deviceId}`,
        ip ? { headers: { 'cf-connecting-ip': ip } } : undefined,
      ),
      env,
    })

  let flood429: Response | null = null
  let i = 0
  for (; i < POLICIES.flood.limit + 10; i++) {
    const res = await pullFrom(FLOOD_IP, 'pull-flood-' + i)
    if (res.status === 429) { flood429 = res; break }
  }
  check('an IP that rotates device ids is throttled by the flood bucket', flood429 !== null, `after ${i} pulls`)
  check('the flood refusal carries Retry-After', !!flood429?.headers.get('Retry-After'))
  const otherIp = await pullFrom('198.51.100.11', 'pull-other-ip')
  check('a different IP is unaffected by another IP\'s flood bucket', otherIp.status === 200, String(otherIp.status))
  const noIp = await pullFrom(null, 'pull-no-ip')
  check('a request with no connecting IP skips the flood bucket', noIp.status === 200, String(noIp.status))
}

// The WAF is enforced by the real route, not only by the pure helper.
const wafRes = await pushPost({
  request: new Request('https://local.test/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([1, 2, 3]),
  }),
  env,
})
check('the push route refuses a non-object body', wafRes.status === 400, String(wafRes.status))

// The body cap has to work through the real route, not just in isolation:
// `readJson` used to parse whatever it was given, and only `data` was
// size-checked afterwards — long after the body had been buffered.
{
  const huge = 'x'.repeat(7_000_000)
  const body = JSON.stringify({ chainId: CHAIN_G, deviceId: 'big-body', data: huge })
  const res = await pushPost({
    request: new Request('https://local.test/sync/push', {
      method: 'POST',
      // A real HTTP client always sends Content-Length; Bun's Request does not
      // add it for a string body, so set it explicitly to exercise the
      // fast-path that rejects *before* the body is read.
      headers: { 'Content-Type': 'application/json', 'content-length': String(body.length) },
      body,
    }),
    env,
  })
  check('an oversized body is refused with 413 before it is parsed', res.status === 413, String(res.status))
}

// Same attack, but with no Content-Length at all (chunked) — this exercises the
// second check, the one inside readJson that looks at the real length.
//
// The padding goes in `deviceName`, NOT `data`, and the JSON is deliberately
// valid. That matters: an earlier version of this test sent truncated JSON and
// passed for the wrong reason (the parser rejected it, not the cap), so
// deleting the cap entirely did not fail the suite. Padding an unused field
// with otherwise-valid JSON is what isolates the body cap from
// MAX_PAYLOAD_BYTES, which is a separate check on a separate field.
{
  const padding = 'x'.repeat(7_000_000)
  const payload = JSON.stringify({
    chainId: CHAIN_G,
    deviceId: 'chunked',
    data: 'aaa.bbb',
    writeSecret: SECRET_G,
    deviceName: padding,
  })
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload))
      controller.close()
    },
  })
  const res = await pushPost({
    request: new Request('https://local.test/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      // @ts-expect-error — duplex is required by undici for a stream body
      duplex: 'half',
    }),
    env,
  })
  // Without the readJson cap this body is valid and small in `data`, so it would
  // sail through to a successful push. Anything other than a rejection is a bug.
  check('an oversized chunked body with valid JSON is refused', res.status !== 200, String(res.status))
}

// A body just under the cap must still be accepted, or the cap is a DoS on
// legitimate large pushes.
{
  const data = 'x'.repeat(4_000_000)
  const res = await pushPost({
    request: new Request('https://local.test/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: CHAIN_G, deviceId: 'big-ok', data, writeSecret: SECRET_G }),
    }),
    env,
  })
  check('a large-but-valid payload is not blocked by the body cap', res.status === 200, String(res.status))
}

// Control characters: documented as a WAF control, so prove the route enforces it.
{
  const res = await pushPost({
    request: new Request('https://local.test/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: CHAIN_G, deviceId: 'dev\u0000ice', data: 'aaa.bbb' }),
    }),
    env,
  })
  check('a control character in a field is refused', res.status === 400, String(res.status))
  const bodyText = (await res.json() as any).error || ''
  check('the refusal names the reason', /control character/i.test(bodyText), bodyText)
}

// A throttle on a real route emits 429 + Retry-After. Handshake is the tightest
// bucket (POLICIES.handshake, 20/min) because it answers "does this chain
// exist?" — the flood here is exactly the chain-id walk it exists to make
// expensive. The throttle runs BEFORE the chain row is created, so a blocked
// walk also leaves nothing behind.
activeStorage = makeStorage() as any
let floodStatus = 0
for (let i = 0; i < POLICIES.handshake.limit + 2; i++) {
  const res = await handshakePost({
    request: new Request('https://local.test/sync/handshake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: `chain-flood-${String(i).padStart(2, '0')}`,
        deviceId: 'handshake-walker',
        deviceName: 'Walker',
        writeSecret: newWriteSecret(),
      }),
    }),
    env,
  })
  floodStatus = res.status
  if (res.status === 429) break
}
check('handshake flooding (chain-id walking) is throttled', floodStatus === 429, String(floodStatus))

// Status reveals *who else is in the chain* (device ids and names), so it is
// throttled too — an unthrottled caller could walk chain ids and harvest them.
const noDevice = await statusGet({
  request: new Request(`https://local.test/sync/status?chain=${CHAIN_A}`),
  env,
})
check('status refuses a request with no device id', noDevice.status === 400, String(noDevice.status))

let statusCode = 0
for (let i = 0; i < POLICIES.pull.limit + 2; i++) {
  const res = await statusGet({
    request: new Request(`https://local.test/sync/status?chain=${CHAIN_A}&deviceId=status-flooder`),
    env,
  })
  statusCode = res.status
  if (res.status === 429) break
}
check('status is throttled after the pull limit', statusCode === 429, String(statusCode))

section('8g. The push path is never optional-chained')

// App.tsx has no unit test (it is a React component) and the browser suites run
// against a preview with no /sync backend, so nothing exercised the wiring that
// caused this bug: `flush()` behind `qosRef.current?.` silently skipped the
// first push after enabling sync, because the scheduler was built in the render
// body and React had not re-rendered yet when syncNow reached it.
//
// The invariant is textual — "a push must never be behind an optional chain" —
// so it is asserted textually. This is not a substitute for a real test, but it
// is a standing reminder of the exact mistake, and it fails loudly if someone
// reintroduces it.
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
check(
  'the push path goes through ensureQos(), not an optional chain',
  /ensureQos\(\)\.flush\(\)/.test(appSource),
)
check(
  'no optional chain can skip a push',
  !/qosRef\.current\?\.(flush|schedule)\(/.test(appSource),
)
check(
  'SyncQos is not constructed during render',
  !/if \(syncEnabled && !qosRef\.current\)/.test(appSource),
)
check(
  'the scheduler is created on demand instead',
  /const ensureQos = useCallback/.test(appSource),
)

// The restore-on-load effect reads the stored write secret and MUST hand it
// to the agent. A version that read it and then dropped it on the floor
// (ensureAgent(key, chain)) passed handshake and then got 401 on every push —
// reads worked, writes falsely demanded re-pairing — and nothing else could
// catch it, because App.tsx has no unit test and the browser suites run with
// no /sync backend. Same textual-guard reasoning as the checks above.
check(
  'the restored agent is given the stored write secret',
  /ensureAgent\(key, chain, writeSecret\)/.test(appSource),
)
check(
  'no restore path can drop the write secret',
  !/ensureAgent\(key, chain\)/.test(appSource),
)

// Saved {{variables}} ride the sync payload, so they must be in the
// debounced-push scheduler's dependency list. A version that omitted them
// compiled and rendered fine — the variable simply only synced the next time
// some unrelated change pushed. Same textual-guard reasoning as §8g's
// original invariant: App.tsx has no unit test, the browser suites run with
// no /sync backend, and nothing else observes a React deps array.
check(
  'saved variables wake the debounced push scheduler',
  /\[threads, messages, projects, deleted, view, settings, variables, syncEnabled, syncReady, ensureQos\]/.test(appSource),
)

// The wake-path snapshot loader/saver must carry variables too, or the SW
// merges them and then drops the field from both IDB and the pushed
// convergence snapshot. (Writing {} unconditionally on save would instead
// erase a real pool on a pre-variables payload — the guard is load+save with
// a conditional save.) sw.ts is bundled into dist/sw.js; its source is the
// only thing anyone should edit, so the pin reads the source.
const swSourceVars = readFileSync(new URL('../src/sw/sw.ts', import.meta.url), 'utf8')
check(
  'the wake snapshot loader reads the variables store',
  /variables: normalizeVariables\(parse\(KEY_VARS, \{\}\)\)/.test(swSourceVars),
)
check(
  'the wake snapshot saver writes variables only when the merge produced them',
  /if \(data\.variables\) put\(KEY_VARS/.test(swSourceVars),
)

// The service-worker wake imports agent.ts directly and runs in a context
// where `localStorage` DOES NOT EXIST. agent.init() once read the device name
// with a bare `localStorage.` — a ReferenceError on every real wake, swallowed
// by the wake contract's best-effort error handling, so subscribed devices
// silently pulled nothing while every test (which injects a fake localStorage)
// stayed green. Same textual-guard reasoning as the App.tsx checks above.
const syncSource = readFileSync(new URL('../src/sync/agent.ts', import.meta.url), 'utf8')
check(
  'agent.ts never reads localStorage directly (it runs in the wake path, where localStorage does not exist)',
  !/\blocalStorage\./.test(syncSource),
)
check(
  'the device name is read through the shared persistence layer',
  /const storedName = stGetString\(DEVICE_NAME_KEY\)/.test(syncSource),
)

// Echo-loop guards (the 2026-10-25 incident: 1220 full-state pushes per night
// filled D1 to its ceiling). The wake push-away used to fire whenever a pull
// delivered blobs; because every push carries a fresh `sentAt`, the other
// device always had something "new" to pull, which woke us back, and two
// closed-tab workers ponged forever below every request-rate limit. Nothing
// exercises the SW or App here, so the invariants are pinned textually, same
// reasoning as the checks above.
check(
  'the wake push-away is gated on the merge fingerprint (content vs envelope)',
  /syncFingerprint\(before\) !== syncFingerprint\(data\)/.test(swSourceVars),
)
check(
  'App push no-ops when content matches the last successful push of the session',
  /fp === lastPushedFpRef\.current/.test(appSource),
)
const pushRoute = readFileSync(new URL('../functions/sync/push.ts', import.meta.url), 'utf8')
check(
  'push charges the per-chain daily byte budget',
  /consumeLimitUnits\(\s*db,\s*'push-chain-bytes'/.test(pushRoute),
)
check(
  'the byte budget is charged only after write auth passes',
  pushRoute.indexOf('constantTimeEqualHex') !== -1 &&
    pushRoute.indexOf('constantTimeEqualHex') < pushRoute.indexOf("'push-chain-bytes'", pushRoute.indexOf('consumeLimitUnits')),
)

section('9. Maintenance wiring — the limit table sweeps itself')

// The sweep decision: every PRUNE_SAMPLE-th admitted request sweeps, then the
// counter resets so a long-lived isolate keeps sweeping forever.
resetLimitSweep()
let sweepFired = -1
for (let i = 1; i <= 300; i++) {
  if (shouldSweepLimits()) {
    sweepFired = i
    break
  }
}
check('the sweep fires on a fixed cadence, not immediately', sweepFired > 1, String(sweepFired))
check('the sweep counter resets after firing', shouldSweepLimits() === false)
resetLimitSweep()
check('resetLimitSweep restarts the cadence', shouldSweepLimits() === false)

// guardRoute must actually run pruneLimits on the sampled request — the same
// "defined but never wired" defect class as hasControlChars was.
{
  const prepared: string[] = []
  const recordingDb = {
    prepare(query: string) {
      prepared.push(query)
      const stmt = {
        bind() {
          return stmt
        },
        async first() {
          return null
        },
        async all() {
          return { results: [] }
        },
        async run() {
          return { success: true }
        },
      }
      return stmt
    },
  }
  resetLimitSweep()
  for (let i = 0; i < 256; i++) {
    await guardRoute(recordingDb as any, {
      scope: 'sweep-integration',
      subject: 'device-1',
      policy: { limit: 1000, windowMs: 60_000 },
    })
  }
  const sweeps = prepared.filter((q) => q.includes('DELETE FROM rate_limits')).length
  check('the sampled admitted request runs pruneLimits', sweeps === 1, String(sweeps))

  // A refused request must not sweep: refusals mean the bucket is hot, and the
  // sweep is maintenance, not correctness. The stub answers every read with a
  // row already at its limit, so guardRoute refuses all 300.
  prepared.length = 0
  const refusingDb = {
    prepare(query: string) {
      prepared.push(query)
      const stmt = {
        bind() {
          return stmt
        },
        async first() {
          // One second in the past: a row stamped "now" during this very
          // request reads as a future window to the PoP-skew guard, which
          // would admit the request and make this stub dishonest.
          return { window_start: Date.now() - 1000, count: 1 }
        },
        async all() {
          return { results: [] }
        },
        async run() {
          return { success: true }
        },
      }
      return stmt
    },
  }
  resetLimitSweep()
  let refused = 0
  for (let i = 0; i < 300; i++) {
    const verdict = await guardRoute(refusingDb as any, {
      scope: 'sweep-integration',
      subject: 'device-2',
      policy: { limit: 1, windowMs: 60_000 },
    })
    if (!verdict.ok) refused++
  }
  check('the refusal stub actually refused (test is honest)', refused === 300, String(refused))
  const sweepsWhileRefusing = prepared.filter((q) => q.includes('DELETE FROM rate_limits')).length
  check('refused requests never trigger the sweep', sweepsWhileRefusing === 0, String(sweepsWhileRefusing))
}

// The sweep actually evicts stale rows on real SQLite, not just in the stub.
await d1.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES ('stale:flood', 1, 1)").run()
await pruneLimits(d1 as any, Date.now())
check('the sweep evicts a stale bucket on real SQLite', (await readLimit(d1 as any, 'stale', 'flood')) === null)

section('9b. Handshake reports the chain’s real write-auth state')

// A legacy chain (created before write auth) has no stored secret.
await d1
  .prepare("INSERT INTO chains (id, created_at, version) VALUES ('legacy-chain-01', 1, 1)")
  .run()
const legacyHandshake = await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    body: JSON.stringify({ chainId: 'legacy-chain-01', deviceId: 'legacy-dev-01' }),
  }),
  env,
})
check('a legacy chain reports writeAuth false', (await legacyHandshake.json()).writeAuth === false)

// A brand-new chain created WITH a secret is secured from its first handshake.
const freshSecret = newWriteSecret()
const freshHandshake = await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    body: JSON.stringify({
      chainId: 'fresh-chain-01',
      deviceId: 'fresh-dev-01',
      writeSecret: freshSecret,
    }),
  }),
  env,
})
check('a new chain installed with a secret reports writeAuth true', (await freshHandshake.json()).writeAuth === true)

const againHandshake = await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    body: JSON.stringify({ chainId: 'fresh-chain-01', deviceId: 'fresh-dev-02' }),
  }),
  env,
})
check('an already-secured chain still reports writeAuth true', (await againHandshake.json()).writeAuth === true)

section('9c. Terminal push failures stop the retry loop')

check('413 payload-too-large is terminal', isTerminalPushFailure(new SyncError('Encrypted payload is too large', 413)))
check('403 wrong write secret is terminal', isTerminalPushFailure(new SyncError('Wrong write secret', 403)))
check('401 missing write secret is terminal', isTerminalPushFailure(new SyncError('Missing write secret', 401)))
check('409 unknown chain is terminal', isTerminalPushFailure(new SyncError('Unknown sync chain', 409)))
check('429 throttling is NOT terminal — the server said retry', !isTerminalPushFailure(new SyncError('busy', 429, 5000)))
check('503 breaker is NOT terminal', !isTerminalPushFailure(new SyncError('unavailable', 503, 15000)))
check('408 request timeout is NOT terminal', !isTerminalPushFailure(new SyncError('timeout', 408)))
check('a plain error is never terminal', !isTerminalPushFailure(new Error('offline')))

// A 413 can never succeed on retry: the payload only ever grows. The scheduler
// must go idle instead of retrying forever — the error is already surfaced by
// the onPush caller, and the next user edit schedules a fresh push.
{
  const clock = fakeTimers()
  let attempts = 0
  const qos = new SyncQos({
    onPush: async () => {
      attempts++
      throw new SyncError('Encrypted payload is too large', 413)
    },
    debounceMs: 100,
    retryBaseMs: 500,
    retryMaxMs: 10_000,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  qos.schedule()
  await clock.advance(100)
  check('a terminal failure is attempted exactly once', attempts === 1, String(attempts))
  check('a terminal failure leaves nothing pending', qos.getState().pending === false)
  check('a terminal failure leaves the scheduler idle', qos.getState().status === 'idle')
  check('a terminal failure leaves no timer armed', clock.pendingCount === 0)
  await clock.advance(60_000)
  check('a terminal failure is never retried by the timer', attempts === 1, String(attempts))
}

// 429 is not terminal: the change stays pending and the retry carries it.
{
  const clock = fakeTimers()
  let attempts = 0
  const qos = new SyncQos({
    onPush: async () => {
      attempts++
      if (attempts === 1) throw new SyncError('Too many push requests', 429, 5000)
    },
    debounceMs: 100,
    retryBaseMs: 500,
    retryMaxMs: 10_000,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  qos.schedule()
  await clock.advance(100)
  check('a throttled push stays pending', qos.getState().pending === true)
  // App hands the server's hint to the scheduler (pushSnapshotQuiet); without
  // it the curve applies. Either way the retry must fire and carry the change.
  qos.setRetryAfter(5000)
  await clock.advance(5000)
  check('the throttled retry carries the change through', attempts === 2 && qos.getState().pending === false, String(attempts))
}

// --- 10. Background sync: wake-target storage (rollout step 3) ---------------

section('10. Wake-target storage — subscribe/unsubscribe round trip')

// The chain and devices from §2 are still registered. A wake target keys by
// ENDPOINT (the push service's handle), not (chain, device) — a browser that
// re-subscribes to a different chain moves the row instead of duplicating it.
const KEY_P = 'b'.repeat(87) // base64url-shaped P-256 key material
const KEY_A = 'a'.repeat(43)
const ENDPODE = 'https://fcm.googleapis.com/fcm/send/end-aaaaaaaa-1'
const ENDPODE2 = 'https://updates.push.services.mozilla.com/pushdb/end-bbbbb-2'

const config = await (await fetch('https://local.test/sync/subscribe')).json()
check('GET reports push wiring is off in step 3', config.enabled === false && config.publicKey === null)

const subRes = await fetch('https://local.test/sync/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chainId: CHAIN_A, deviceId: 'subscriber-01',
    endpoint: ENDPODE, keys: { p256dh: KEY_P, auth: KEY_A },
  }),
})
check('a valid subscription is stored', subRes.status === 200, String(subRes.status))
const storedRow = (await d1.prepare('SELECT chain_id, device_id, p256dh FROM push_subscriptions WHERE endpoint = ?').bind(ENDPODE).first()) as { chain_id: string; device_id: string; p256dh: string } | null
check('the row carries chain, device and key material', !!(storedRow && storedRow.device_id === 'subscriber-01' && storedRow.p256dh === KEY_P))

await fetch('https://local.test/sync/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chainId: CHAIN_A, deviceId: 'subscriber-01',
    endpoint: ENDPODE, keys: { p256dh: KEY_P, auth: KEY_A },
  }),
})
const afterResub = (await d1.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ? OR device_id = ?').bind(ENDPODE, 'subscriber-01').first()) as { n: number } | null
check('re-subscribing the same endpoint does not duplicate rows', Number(afterResub?.n) === 1, String(afterResub?.n))

// chain B exists in this harness only as a key-model fixture — subscribing
// requires a REAL chain, so create it the same way the real client would.
await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    body: JSON.stringify({ chainId: CHAIN_B, deviceId: 'chain-b-creator', writeSecret: 'a'.repeat(43) }),
  }),
  env,
})

await fetch('https://local.test/sync/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chainId: CHAIN_B, deviceId: 'subscriber-01',
    endpoint: ENDPODE, keys: { p256dh: KEY_P, auth: KEY_A },
  }),
})
const movedRow = (await d1.prepare('SELECT chain_id FROM push_subscriptions WHERE endpoint = ?').bind(ENDPODE).first()) as { chain_id: string } | null
check('re-subscribing to a NEW chain moves the row (endpoint-keyed)', !!(movedRow && movedRow.chain_id === CHAIN_B))

const moveBack = await fetch('https://local.test/sync/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chainId: CHAIN_A, deviceId: 'subscriber-01',
    endpoint: ENDPODE, keys: { p256dh: KEY_P, auth: KEY_A },
  }),
})
check('the moved row can move back', moveBack.status === 200)

const badChain = await fetch('https://local.test/sync/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chainId: 'ghost-chain-9999', deviceId: 'subscriber-01',
    endpoint: ENDPODE, keys: { p256dh: KEY_P, auth: KEY_A },
  }),
})
check('a subscription for an unknown chain is refused with 409', badChain.status === 409, String(badChain.status))

const badEndpoint = await fetch('https://local.test/sync/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chainId: CHAIN_A, deviceId: 'subscriber-01',
    endpoint: 'http://not-secure.example/push', keys: { p256dh: KEY_P, auth: KEY_A },
  }),
})
check('a plaintext endpoint is refused', badEndpoint.status === 400, String(badEndpoint.status))

const badKey = await fetch('https://local.test/sync/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chainId: CHAIN_A, deviceId: 'subscriber-01',
    endpoint: ENDPODE2, keys: { p256dh: 'nope', auth: KEY_A },
  }),
})
check('an unusable p256dh is refused', badKey.status === 400, String(badKey.status))

const wrongOwner = await fetch('https://local.test/sync/subscribe', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ endpoint: ENDPODE, deviceId: 'not-the-owner' }),
})
const stillThere = (await d1.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?').bind(ENDPODE).first()) as { n: number } | null
check('DELETE by a different device does not drop the row', wrongOwner.status === 200 && Number(stillThere?.n) === 1)

const ownerDelete = await fetch('https://local.test/sync/subscribe', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ endpoint: ENDPODE, deviceId: 'subscriber-01' }),
})
const gone = (await d1.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?').bind(ENDPODE).first()) as { n: number } | null
check('DELETE by the owning device removes the row', ownerDelete.status === 200 && Number(gone?.n) === 0, String(gone?.n))

// The step-3 invariant that matters most: with no subscription stored, a push
// is bit-for-bit today's behavior. Fan-out arrives in step 4 and must not
// change the storage contract a single byte.
const plainPush = await pushPost({
  request: new Request('https://local.test/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId: CHAIN_A, deviceId: agentA.getDeviceId(),
      data: 'y'.repeat(50), writeSecret: SECRET_A,
    }),
  }),
  env,
})
check('a push against an unsubscribed chain behaves exactly as before', plainPush.status === 200, String(plainPush.status))

// --- 11. Background sync: the fan-out (rollout step 4) -----------------------

section('11. Wake fan-out — VAPID, aes128gcm, budget, pruning')

import { vapidFromEnv, sendFanOut, encryptWake, vapidAuthHeader } from '../functions/_shared/push-fanout'

// The pair scripts/vapid-keygen.mjs prints; public key is 87 chars of
// base64url (65-byte uncompressed point), private scalar is 43.
const FAN_PUBLIC = 'BBVjVaf6ia3TJUfp7bu3IYOsALyJEKPm4tvt0HGlRZDd1pE36O8PiSV9hTtrNOp4GX1BfOqOAW_KyeIh7ZWzqGk'
const FAN_PRIVATE = 'FivBsTGVK2UxmL6Ob2X8WSktkUI8TN4wp_Wezmk6J4A'
const FAN_ENV = {
  VAPID_PUBLIC_KEY: FAN_PUBLIC,
  VAPID_PRIVATE_KEY: FAN_PRIVATE,
  VAPID_SUBJECT: 'mailto:smoke-test@example.test',
  GISTRY_DB: d1,
}

check('the env reader reads all three keys', vapidFromEnv(FAN_ENV) !== null)
check('absent env means fan-out off, not half-configured', vapidFromEnv(env) === null)
check('a half-configured env (public only) is off as well',
  vapidFromEnv({ VAPID_PUBLIC_KEY: FAN_PUBLIC, GISTRY_DB: d1 }) === null)
// RFC 8292 §5.1: the JWT `sub` must be a mailto: URI or https URL — a push
// service rejects anything else with a 401 on EVERY wake, which reads as
// "subscribed but never woken". The reader fails instead so the GET probe
// reports an unconfigured (fixable) relay rather than a silently broken one.
check('a malformed VAPID_SUBJECT reads as a config error, not a wet fuse',
  vapidFromEnv({ VAPID_PUBLIC_KEY: FAN_PUBLIC, VAPID_PRIVATE_KEY: FAN_PRIVATE, VAPID_SUBJECT: 'dhaupin@example.invalid', GISTRY_DB: d1 }) === null)
check('an https: subject is a valid RFC 8292 substitute for mailto:',
  vapidFromEnv({ VAPID_PUBLIC_KEY: FAN_PUBLIC, VAPID_PRIVATE_KEY: FAN_PRIVATE, VAPID_SUBJECT: 'https://example.com/contact', GISTRY_DB: d1 }) !== null)

// The wake handler runs in the ACTUAL service worker context (there is no
// test harness for a real browser wake), so its process-boundary invariants
// are pinned textually the way §8g pins App.tsx:
const swSource = readFileSync(new URL('../src/sw/sw.ts', import.meta.url), 'utf8')
check('a wake with an open app page is REDIRECTED to that page, not run in parallel',
  /hasLiveAppPage\(\)/.test(swSource) && /clients\.matchAll/.test(swSource))
check('only an APP page carries the redirect (a lander client would drop the wake)',
  /\.hash\.startsWith\('#\/'\)/.test(swSource))
check('two pings cannot race two wake rounds (in-flight gate)',
  /if \(waking\) return/.test(swSource) && /waking = true/.test(swSource))
// The badge (rollout step 6): its whole point is on a path no harness can
// exercise either — count + notification live inside the SW, so the things
// that make it honest are pinned textually like the wake branches above.
check('the badge counts genuinely-new messages inside the SW (the relay stays blind)',
  /newMessageCount\(/.test(swSource) && /showNotification/.test(swSource))
check('the badge is strictly opt-in via the shared pref key',
  /KEY_NOTIFY === '1'/.test(swSource) || /KEY_NOTIFY\) === '1'/.test(swSource))
check('the badge doubles as a deep link (notification click focuses/opens the app)',
  /notificationclick/.test(swSource))
check('the badge never fires on the redirect path (the call comes after the branch)',
  swSource.indexOf('notifyOpenPages(0)') < swSource.indexOf('void showBadge('))

// --- wire form of one wake ----------------------------------------------------

const b64urlEncode = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// A fresh receiver key pair so the ENCRYPT→DECRYPT round trip is provable:
// the fixtures KEY_P/KEY_A have no private half to derive against.
const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
const receiverPub = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))
const receiverAuth = crypto.getRandomValues(new Uint8Array(16))
const wakeBody = await encryptWake({ chainId: CHAIN_A, n: 1 }, b64urlEncode(receiverPub), b64urlEncode(receiverAuth))

// aes128gcm frame: salt(16) rs(4) idlen(1) keyid(65) = 86-octet header, then
// one record (plaintext + 0x02 delimiter + 16-octet GCM tag).
check('keyid declares a 65-byte uncompressed point', wakeBody[20] === 65 && wakeBody[21] === 0x04)
check('the rs parameter is 1352 as a big-endian u32',
  wakeBody[16] === 0 && wakeBody[17] === 0 && wakeBody[18] === 0x05 && wakeBody[19] === 0x48,
  `${wakeBody[18]}${wakeBody[19]}`)
check('the wake is a single small record', wakeBody.length >= 86 + 16 && wakeBody.length < 200, String(wakeBody.length))

// Decrypt with the RECIEVER's keys, formulas mirrored verbatim from RFC
// 8291 §3.4. If the encrypt side deviates by one byte, this fails.
async function decryptWake(body: Uint8Array, receiverPrivate: CryptoKey, authSecret: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16)
  const asPublic = body.slice(21, 86)
  const asImported = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asImported }, receiverPrivate, 256))

  const keyInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info'),
    0x00,
    ...receiverPub,
    ...asPublic,
  ])
  const ecdhKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits'])
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfo }, ecdhKey, 256)
  const prkKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const cek = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array([...new TextEncoder().encode('Content-Encoding: aes128gcm'), 0x00]) },
    prkKey, 128)
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array([...new TextEncoder().encode('Content-Encoding: nonce'), 0x00]) },
    prkKey, 96)

  const decKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const record = body.slice(86)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, decKey, record)
  // The record carries the padding delimiter (0x02) as its LAST byte.
  const text = new TextDecoder().decode(plaintext)
  return text.endsWith('\u0002') ? text.slice(0, -1) : text
}
const decryptedWake = JSON.parse(await decryptWake(wakeBody, receiver.privateKey, receiverAuth))
check('the wake decrypts to exactly the ping payload', decryptedWake.chainId === CHAIN_A && decryptedWake.n === 1, JSON.stringify(decryptedWake))

// --- the Authorization header --------------------------------------------------

const vapidAuth = await vapidAuthHeader('https://fcm.googleapis.com/fcm/send/vapid-target-1', vapidFromEnv(FAN_ENV)!, Date.now())
const tMatch = vapidAuth.match(/^vapid t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/)
check('the auth header is `vapid t=<jwt>, k=<key>` with a 3-segment JWT', !!tMatch, vapidAuth.slice(0, 60))
check('the k= parameter is the raw public key', !!tMatch && tMatch[2] === FAN_PUBLIC)
const jwtPayload = tMatch
  ? JSON.parse(atob(tMatch[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (tMatch[1].split('.')[1].length % 4)) % 4))) as Record<string, unknown>
  : {}
check('the JWT audience is the endpoint origin', jwtPayload.aud === 'https://fcm.googleapis.com', JSON.stringify(jwtPayload))
check('the JWT subject is the configured mailto', jwtPayload.sub === 'mailto:smoke-test@example.test')
check('the JWT expiry is roughly 12h out',
  typeof jwtPayload.exp === 'number' &&
    (jwtPayload.exp as number) > Date.now() / 1000 + 11 * 3600 &&
    (jwtPayload.exp as number) < Date.now() / 1000 + 13 * 3600)

// --- end-to-end fan-out against a stubbed push service -------------------------

interface FcmCall { url: string; hasTtl: boolean; encoding: string | null; authVapid: boolean }
const fcmCalls: FcmCall[] = []
// URL-aware stub status — the doomed target dies, the healthy one lives.
let fcmStatusFor = (url: URL): number => (url.pathname.endsWith('doomed-2') ? 410 : 201)
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: unknown, init?: unknown) => {
  const request = input instanceof Request ? input : new Request(String(input), (init as RequestInit) ?? {})
  const url = new URL(request.url)
  if (url.hostname !== 'fcm.googleapis.com') {
    const handler = routes[`${request.method} ${url.pathname}`]
    if (!handler) return new Response('not found', { status: 404 })
    return handler({ request, env })
  }
  fcmCalls.push({
    url: request.url,
    hasTtl: request.headers.get('TTL') != null,
    encoding: request.headers.get('Content-Encoding'),
    authVapid: /^vapid t=/.test(request.headers.get('Authorization') || ''),
  })
  return new Response('', { status: fcmStatusFor(url) })
}) as typeof fetch

// Behavioral rows need REAL P-256 material: the wake encrypts against
// p256dh, and §10's shape-only fixtures ('b'.repeat(87)) decode to a blob
// that is not an EC point — the encrypt side rightly fails them there.
// The harness's d1 is structurally the D1 surface; the fan-out parameter is
// typed for the real binding, so bridge it once at the section boundary.
const fanDb = d1 as unknown as import('../functions/_shared/sync').D1Database
const fanReceiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
const fanPub = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', fanReceiver.publicKey)))
const fanAuth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)))
check('the behavioral wake keys decode to real point material', fanPub.length === 87 && fanPub[0] === 'B', fanPub.slice(0, 4))

// awake-1 is stamped 5 days in the past on purpose: a successful wake must
// re-stamp last_seen — that stamp is exactly what the relay's maintenance
// sweep ages wake targets against, so the liveness loop (wake → stamp →
// sweep only rows nothing ever wakes) is provable end to end here.
const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000
await d1.prepare(
  `INSERT INTO push_subscriptions (chain_id, device_id, endpoint, p256dh, auth, created_at, last_seen)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
).bind(CHAIN_A, 'wake-dev-1', 'https://fcm.googleapis.com/fcm/send/awake-1', fanPub, fanAuth, fiveDaysAgo, fiveDaysAgo).run()
await d1.prepare(
  `INSERT INTO push_subscriptions (chain_id, device_id, endpoint, p256dh, auth, created_at, last_seen)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
).bind(CHAIN_A, 'wake-dev-2', 'https://fcm.googleapis.com/fcm/send/doomed-2', fanPub, fanAuth, Date.now(), Date.now()).run()

const wakes0 = fcmCalls.length
// The tail-observability capture wraps the round that PRUNES: sender
// wake-dev-1 wakes doomed-2, whose 410 outcome must show up on the tail.
const wakeLogLines: string[] = []
const realLog = console.log
console.log = (...args: unknown[]) => { wakeLogLines.push(args.map(String).join(' ')) }
await sendFanOut(fanDb, CHAIN_A, 'wake-dev-1', 1, FAN_ENV)
console.log = realLog
check('a push wakes exactly the OTHER subscribed device', fcmCalls.length - wakes0 === 1, String(fcmCalls.length - wakes0))
const sent = fcmCalls[fcmCalls.length - 1]
check('the wake POST carries TTL + aes128gcm + a vapid auth',
  !!sent && sent.hasTtl && sent.encoding === 'aes128gcm' && sent.authVapid)
check('the wake targeted the healthy subscription, not the sender',
  !!sent && sent.url.endsWith('doomed-2') && !sent.url.includes('awake-1'))

// 410 from the push service prunes the row the moment it is seen.
console.log = (...args: unknown[]) => { wakeLogLines.push(args.map(String).join(' ')) }
await sendFanOut(fanDb, CHAIN_A, 'wake-dev-3', 1, FAN_ENV)
console.log = realLog
const doomedAfter = (await d1.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint LIKE ?').bind('%doomed-2').first()) as { n: number } | null
check('a dead endpoint is pruned from the table on 410', !!doomedAfter && doomedAfter.n === 0)
check('a pruned wake outcome is visible on the tail',
  wakeLogLines.some((line) => line.includes('[wake] pruned') && line.includes('fcm.googleapis.com')),
  wakeLogLines.join(' | ') || 'no log captured')
check('a wake log line names the host, never the subscription token',
  !wakeLogLines.join('\n').includes('/fcm/send'),
  wakeLogLines.join(' | '))
const awakeAfter = (await d1.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint LIKE ?').bind('%awake-1').first()) as { n: number } | null
check('a healthy endpoint survives the same wake round', !!awakeAfter && awakeAfter.n === 1)
fcmStatusFor = () => 201

// Budget: the per-chain fan bucket is 120/min. Every sendFanOut consumes one
// admission; beyond it wakes are SKIPPED, never queued, and the chain's own
// catch-up pull delivers the same data late. 125 calls → exactly 120 wake
// rounds, since each round has one remaining healthy target.
fcmCalls.length = 0
for (let i = 0; i < 125; i++) await sendFanOut(fanDb, CHAIN_A, 'unpicked-sender', 1, FAN_ENV)
check('the per-chain wake budget skips beyond 120, never queues',
  fcmCalls.length <= 120,
  `${fcmCalls.length} (2 targets × 60... the two earlier rounds had already spent 2 of the 120)`)

// Every delivered wake re-stamps last_seen, so the sweep's age rule measures
// "nobody could confirm this target works in N days", not "subscribed long
// ago" — an idle-but-alive phone stays subscribed forever.
const wakeStampAfter = (await d1.prepare(
  'SELECT last_seen AS ts FROM push_subscriptions WHERE endpoint LIKE ?',
).bind('%awake-1').first()) as { ts: number } | null
check('a successful wake re-stamps the row (the liveness signal)',
  !!wakeStampAfter && wakeStampAfter.ts > fiveDaysAgo + 4 * 24 * 60 * 60 * 1000,
  wakeStampAfter ? String(wakeStampAfter.ts) : 'row missing')

const beforeOff = fcmCalls.length
await sendFanOut(fanDb, CHAIN_A, 'wake-dev-1', 1, { GISTRY_DB: d1 })
check('an env without VAPID keys sends no wakes at all', fcmCalls.length - beforeOff === 0)

globalThis.fetch = realFetch

// --- 12. Client store hygiene — orphaned drafts are swept --------------------

section('12. Client store hygiene — orphaned drafts are swept')

import { sweepDrafts } from '../src/lib/store'

// sweepDrafts(threads) enumerates draft rows (localStorage-resident, never
// synced) and deletes the ones whose thread no longer exists. Threads are
// reduced to their id for this call, so a minimal fixture is honest here.
const draftKeyOf = (id: string): string => `gistory_draft_${id}`
localStorage.setItem(draftKeyOf('draft-dead-thread'), 'placeholder text')
localStorage.setItem(draftKeyOf('draft-alive-thread'), 'keep me')

const aliveThreads = [{ id: 'draft-alive-thread' }] as unknown as Parameters<typeof sweepDrafts>[0]
sweepDrafts(aliveThreads)

check('a deleted thread leaves its draft row behind no longer',
  localStorage.getItem(draftKeyOf('draft-dead-thread')) === null)
check('a live thread keeps its draft row',
  localStorage.getItem(draftKeyOf('draft-alive-thread')) === 'keep me')
check('the sweep is idempotent (a second run stays quiet and green)',
  (sweepDrafts(aliveThreads), localStorage.getItem(draftKeyOf('draft-dead-thread'))) === null)

// --- 13. Attachment groundwork — metadata syncs, bytes never do --------------

section('13. Attachment groundwork — metadata syncs, bytes never do')

// (mergePayload is imported at the top of this file.)

// The image groundwork (2026-10-25): a Message may carry `attachments`
// metadata; the bytes live device-local and NEVER ride a payload. These
// checks pin the money rules the future UI must not break. Messages ride
// under a LIVE thread — the merge drops arrays whose thread was tombstoned.
const att = (overrides: Partial<MessageAttachment> = {}): MessageAttachment => ({
  id: 'att_1',
  name: 'board.png',
  mime: 'image/png',
  bytes: 1024,
  addedAt: 500,
  ...overrides,
})
const attMsg = (ts: number, attachments: MessageAttachment[] = []): Message => ({
  id: 'm-att',
  threadId: 't1',
  content: 'board screenshot',
  createdAt: 100,
  updatedAt: ts,
  ...(attachments.length ? { attachments } : {}),
})

const attWinner = mergePayload(
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [attMsg(200, [att()])] } },
  { threads: [thread('t1', 100)], messages: { t1: [attMsg(300)] }, senderDeviceId: 'devA' },
  'devZ',
) as { messages: Record<string, Message[]> }
check('a newer edit that removes attachments replaces the whole item (LWW)',
  (attWinner.messages.t1[0].attachments ?? []).length === 0)

const attCarried = mergePayload(
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [attMsg(200)] } },
  { threads: [thread('t1', 100)], messages: { t1: [attMsg(300, [att()])] }, senderDeviceId: 'devA' },
  'devZ',
) as { messages: Record<string, Message[]> }
const carried0 = attCarried.messages.t1[0].attachments?.[0]
check('an edit that ADDS attachments carries them whole (no partial merge)',
  carried0?.id === 'att_1' && carried0?.mime === 'image/png' && typeof carried0?.bytes === 'number')

const oldPayloadFriendly = mergePayload(
  { ...base(), threads: [thread('t1', 100)], messages: { t1: [attMsg(200, [att()])] } },
  { threads: [thread('t1', 100)], messages: { t1: [attMsg(150)] }, senderDeviceId: 'devA' },
  'devZ',
) as { messages: Record<string, Message[]> }
check('payloads saved before attachments existed still merge (house rule)',
  (oldPayloadFriendly.messages.t1[0].attachments ?? []).length === 1)

const serialized = JSON.stringify([attMsg(200, [att()])])
check('attachment metadata serializes small (no bytes can be smuggled into a payload)',
  serialized.length < 400 && !serialized.includes('base64') && !serialized.includes('raw'))
check('the metadata record survives a JSON round-trip losslessly',
  JSON.parse(serialized)[0].attachments[0].id === 'att_1'
  && JSON.parse(serialized)[0].attachments[0].mime === 'image/png')

// --- 14. Upload discipline for the message-image fields ---------------------

section('14. Upload discipline for the message-image fields')

// The crashtest upload-family law, moved to the harness where the class
// actually lives (gistory has no server upload route - the relay stays
// blind, bytes are device-local): the verdict reads what the builder DERIVES
// and STORES. This section drives buildAttachment through a fake store so
// the browserless battery proves the discipline, not the WAF refusal path.
import { buildAttachment, isAllowedImageMime, collectAttachmentIds } from '../src/lib/attachments'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE } from '../src/lib/models'

function fakeStore() {
  const rows = new Map<string, Blob | ArrayBuffer>()
  return {
    rows,
    store: async (id: string, bytes: ArrayBuffer | Blob) => {
      rows.set(id, bytes)
      return true
    },
  }
}
const file = (bytes: number): ArrayBuffer => {
  const buf = new ArrayBuffer(bytes)
  return buf
}

// 1. Hostile NAMES never reach a storage key: the key is app-derived, the
//    name is display metadata only.
const hostileStore = fakeStore()
const hostileNames: Array<[string, string]> = [
  ['unix traversal', '../../etc/passwd'],
  ['double extension', 'shell.php.jpg'],
  ['absolute path', '/etc/cron.d/x'],
  ['dotfile', '.env'],
]
for (const [label, name] of hostileNames) {
  const meta = await buildAttachment(
    { name, mime: 'image/png', bytes: file(16) },
    [],
    { store: hostileStore.store },
  )
  check(`hostile name "${label}" still builds (the key is app-derived, not the name)`,
    !!meta && /^att_/.test(meta.id))
}
check('no hostile NAME escaped into a STORE key (safe-key grammar, the family law)',
  hostileStore.rows.size === hostileNames.length
  && Array.from(hostileStore.rows.keys()).every((k) => /^att_[0-9a-z_]+$/.test(k)))

// 2. The size cap refuses before storage.
const overCap = await buildAttachment(
  { name: 'big.png', mime: 'image/png', bytes: file(MAX_ATTACHMENT_BYTES + 1) },
  [],
  { store: fakeStore().store },
)
check('an image over 4MB is refused outright (nothing stored)', overCap === null)

// 3. The per-message count cap refuses.
const six = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, (_, i) => ({
  id: `att_x${i}`, name: `p${i}.png`, mime: 'image/png', bytes: 8, addedAt: 0,
})) as Parameters<typeof buildAttachment>[1]
const seventh = await buildAttachment(
  { name: 'seven.png', mime: 'image/png', bytes: file(16) },
  six,
  { store: fakeStore().store },
)
check('a 7th image on one message is refused (the cap, not the store)', seventh === null)

// 4. The mime allow-list: the family's polyglot canaries refuse on the wire.
const canaries: Array<[string, string]> = [
  ['svg with script (the canonical XSS carrier)', 'image/svg+xml'],
  ['html document', 'text/html'],
  ['not an image at all', 'application/octet-stream'],
]
for (const [label, mime] of canaries) {
  const ok = isAllowedImageMime(mime)
  const built = await buildAttachment(
    { name: 'carriers', mime, bytes: file(16) },
    [],
    { store: fakeStore().store },
  )
  check(`mime canary refused at build: ${label}`, !ok && built === null)
}

// 5. The happy path: real bytes land under a clean key with clean metadata.
const happyStore = fakeStore()
const happy = await buildAttachment(
  { name: 'board\nshot.png', mime: 'image/png', bytes: file(64), width: 32, height: 32 },
  [],
  { store: happyStore.store },
)
check('a legitimate image builds and stores',
  !!happy && happyStore.rows.size === 1
  && happy.bytes === 64 && happy.width === 32
  && happy.name === 'board shot.png' // control chars stripped (display only)
)

// 6. The sweep keep-set: pure, and only app ids belong in it.
const keep = collectAttachmentIds({ t1: [{ id: 'm1', threadId: 't1', content: 'x', createdAt: 1, attachments: [{ id: 'att_9', name: 'a.png', mime: 'image/png', bytes: 4, addedAt: 0 }] }] })
check('the sweep keep-set carries attachment ids only', keep.size === 1)


// --- 15. The attachment byte channel — payload-external, blind, budgeted ----

section('15. Attachment byte channel — /sync/attach')

// The transport does what §13 forbade the payload from ever doing: bytes ride
// their OWN route, write-auth'd like push and byte-budgeted per chain. The
// agents here are the real ones (real crypto), the routes are the real Pages
// Functions, and the store is the same in-memory SQLite the sync tests use.
import { onRequestPost as attachPost } from '../functions/sync/attach'
import { onRequestGet as attachGet } from '../functions/sync/attach'

routes['POST /sync/attach'] = attachPost
routes['GET /sync/attach'] = attachGet

const CHAIN_ATT = 'chain-attach-0001'
const SECRET_ATT = newWriteSecret()
const agentAttA = new SyncAgent({ passphrase: PASS, deviceName: 'Att A', chainId: CHAIN_ATT, writeSecret: SECRET_ATT })
await agentAttA.init()
await agentAttA.handshake()

// 1. Uploading: the wire row is CIPHERTEXT (size = wire length > payload
//    bytes) and attributed to device A.
const pixels = file(64)
await agentAttA.putAttachment('att_smoke_s1', pixels)
const attRow = sqlite.query(
  'SELECT size, device_id FROM attachments WHERE chain_id = ? AND att_id = ?',
).get(CHAIN_ATT, 'att_smoke_s1') as { size: number; device_id: string } | undefined
check('PUT stores the encrypted row under (chain, id), attributed to the uploader',
  !!attRow && attRow.size > 64 && attRow.device_id === agentAttA.getDeviceId())

// 2. A paired device on the SAME key fetches and decrypts exact bytes.
const agentAttB = new SyncAgent({ passphrase: PASS, deviceName: 'Att B', chainId: CHAIN_ATT, writeSecret: SECRET_ATT })
await agentAttB.init()
await agentAttB.handshake()
const got = await agentAttB.getAttachment('att_smoke_s1', 64)
check('a paired device fetches the bytes intact (payload plaintext length matches)', got.byteLength === 64)

// 3. The size gate: ciphertext that decrypts to a length the MERGED METADATA
//    does not claim is refused, named, and NOT stored locally by the agent.
let sizeRefused = false
try { await agentAttB.getAttachment('att_smoke_s1', 63) }
catch (err) { sizeRefused = err instanceof SyncError && String(err.message).includes('do not match') }
check('ciphertext that disagrees with the synced size claim is named-refused', sizeRefused)

// 4. The wrong key gets nothing readable: the relay is blind, so only
//    passphrase+chainId decrypts. The refusal is NAMED, not a stack.
const agentAttC = new SyncAgent({ passphrase: 'an entirely different phrase', deviceName: 'Att C', chainId: CHAIN_ATT })
await agentAttC.init()
await agentAttC.handshake()
let wrongKeyFailed = false
try { await agentAttC.getAttachment('att_smoke_s1', 64) }
catch (err) { wrongKeyFailed = err instanceof SyncError && String(err.message).toLowerCase().includes('decrypt') }
check('a device on the wrong key cannot decrypt the bytes (blind relay holds)', wrongKeyFailed)

// 5. Unknown ids are an honest 404, not a null success.
let unknown404 = false
try { await agentAttB.getAttachment('att_never_existed', 64) }
catch (err) { unknown404 = err instanceof SyncError && err.status === 404 }
check('an unknown attachment id is an honest 404', unknown404)

// 6. Idempotent re-upload: same id, same bytes, one row (no duplicated garbage).
await agentAttA.putAttachment('att_smoke_s1', pixels)
const attCount = sqlite.query(
  'SELECT COUNT(*) AS c FROM attachments WHERE chain_id = ?',
).get(CHAIN_ATT) as { c: number }
check('a retried PUT replaces in place (idempotent, one row per id)', attCount.c === 1)

// 7. Hostile shapes refused on the wire, before any guard bucket is written:
//    traversal-style ids, over-long ids, and non-envelope data are 400s.
const hostileAttBodies: Array<[string, unknown]> = [
  ['traversal attId', { attId: '../../etc/passwd' }],
  ['oversized attId', { attId: 'att_'.repeat(17) }],
  ['non-envelope data', { attId: 'att_ok', data: 'plain-not-ciphertext' }],
  ['data with two iv segments', { attId: 'att_ok', data: 'AAAA.BBBB.CCCC' }],
]
for (const [label, shape] of hostileAttBodies) {
  const res = await fetch('https://local.test/sync/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId: CHAIN_ATT, deviceId: 'att-checker', writeSecret: SECRET_ATT,
      attId: 'att_smoke_s1', data: 'AAAA.BBBB',
      ...(shape as Record<string, string>),
    }),
  })
  check(`hostile ${label} refuses on shape (400)`, res.status === 400)
}

// 8. Wrong write secret → 403, unchanged from the push discipline.
const wrongSecretRes = await fetch('https://local.test/sync/attach', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chainId: CHAIN_ATT, deviceId: 'att-checker', attId: 'att_smoke_s1',
    data: 'AAAA.BBBB', writeSecret: newWriteSecret(),
  }),
})
check('a wrong write secret cannot store bytes (403)', wrongSecretRes.status === 403)

// 9. The budgets the route charges exist and mirror the push matrix.
check('attach byte budget mirrors push-chain-bytes (96MB/day per chain)',
  POLICIES.attachChainBytes.limit === 96_000_000
  && POLICIES.attachChainBytes.windowMs === 24 * 60 * 60 * 1000)
check('attach device + chain guards are per-minute exercise shapes (120/600)',
  POLICIES.attach.limit === 120 && POLICIES.attachChain.limit === 600)

// 10. The replication helper round-trips on the REAL routes: device-local
//     store seam kept empty, then the merge-side pass restores B's pixels
//     the exact way the App does after a merge.
import { replicateMissingAttachments, collectAttachmentInfo } from '../src/lib/attachments'
const replicateStore = fakeStore()
const repStats = await replicateMissingAttachments(
  { t1: [{ id: 'm9', threadId: 't1', content: 'x', createdAt: 1, attachments: [{ id: 'att_smoke_s1', name: 'pixels', mime: 'image/png', bytes: 64, addedAt: 1 }] }] },
  agentAttB,
  { bytesOf: async (id): Promise<Blob | ArrayBuffer | null> => replicateStore.rows.get(id) ?? null, storeOne: replicateStore.store },
)
check('the merge-side replication restores missing bytes over the real routes',
  repStats.restored === 1 && repStats.failed.length === 0 && replicateStore.rows.has('att_smoke_s1'))
check('collectAttachmentInfo records size + name for the integrity gate',
  collectAttachmentInfo({ t1: [{ id: 'm9', threadId: 't1', content: 'x', createdAt: 1, attachments: [{ id: 'att_smoke_s1', name: 'pixels', mime: 'image/png', bytes: 64, addedAt: 1 }] }] }).get('att_smoke_s1')?.bytes === 64)

// 11. Backups: bytes ride ONLY when opted in, restore through the caps.
import { collectBackupAttachments, restoreBackupAttachments } from '../src/lib/attachments'
const metaOnly = await collectBackupAttachments({ t1: [] }, { bytesOf: async () => null })
check('a backup with no byte rows embeds nothing', Object.keys(metaOnly).length === 0)
// Browserless battery: the real IndexedDB seam does not exist here, so the
// rows come from the same fake store the replication check just filled -
// exactly how a real page's byte rows would look at export time.
const backupWithBytes = await collectBackupAttachments(
  { t1: [{ id: 'm9', threadId: 't1', content: 'x', createdAt: 1, attachments: [{ id: 'att_smoke_s1', name: 'pixels', mime: 'image/png', bytes: 64, addedAt: 1 }] }] },
  { bytesOf: async (id) => replicateStore.rows.get(id) ?? null },
) as unknown as Record<string, { raw: string; size: number }>
check('the (opt-in) backup carries the referenced bytes as base64 rows',
  Object.keys(backupWithBytes).length === 1 && 'raw' in backupWithBytes['att_smoke_s1'])
// Round-trip restore: four rows in — one good, one over the 4MB cap, one
// hostile id, one corrupt base64. The good one comes back; the rest are
// skipped, named by absence and the count.
import { MAX_ATTACHMENT_BYTES as CAP } from '../src/lib/models'
const goodRow = (backupWithBytes as Record<string, { raw: string }>)['att_smoke_s1']
const restoreStore = fakeStore()
const restoredCount = await restoreBackupAttachments(
  {
    att_smoke_s1: goodRow,
    att_big: { raw: btoa('x'.repeat(CAP + 8)), size: CAP + 8 },
    '../weird': { raw: btoa('y'), size: 1 },
    att_corrupt: { raw: 'not-base64!!', size: 3 },
  } as unknown as Parameters<typeof restoreBackupAttachments>[0],
  { storeOne: restoreStore.store },
)
check('restore parses the good row, skips cap/shape/corrupt rows', restoredCount === 1 && restoreStore.rows.has('att_smoke_s1'))
check('the oversized row never entered the local byte store (4MB cap holds on import)', !restoreStore.rows.has('att_big'))


// --- summary -----------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`\x1b[31m${failures.length} check(s) failed:\x1b[0m`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`\x1b[32mAll ${passed} checks passed.\x1b[0m`)

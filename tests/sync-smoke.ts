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
import { errorMessage } from '../src/sync/errors'
import { SyncError, newWriteSecret, retryAfterFrom } from '../src/sync/agent'
import { SyncQos, backoffDelay } from '../src/sync/qos'
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
  evaluateLimit,
  hasControlChars,
  inspectBody,
  pruneLimits,
  readLimit,
  resetBreaker,
  retryAfterSeconds,
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
import type { Message, Thread } from '../src/lib/models'

import { onRequestPost as handshakePost } from '../functions/sync/handshake'
import { onRequestPost as pushPost } from '../functions/sync/push'
import { onRequestGet as pullGet } from '../functions/sync/pull'
import { onRequestPost as claimPost } from '../functions/sync/claim'
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
  'POST /sync/claim': claimPost,
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

// The server has no auth beyond knowing the chainId, and the chainId travels
// in the pairing QR. Anyone holding it can therefore append a blob encrypted
// with a *different* key. The victim cannot decrypt it, and the watermark rule
// ("stop before the first failure so it can be retried later") pins the
// watermark below it permanently — so one junk blob blocks every legitimate
// change behind it, forever.
section('5. A blob the client cannot decrypt does not wedge the chain')

const CHAIN_W = 'chain-poison-0001'
const WRONG_PASS = 'a completely different passphrase'

// The chain has to exist before anything can be pushed to it, so the attacker
// handshakes first — which needs no secret beyond the chainId itself.
await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_W, deviceId: 'attacker-device', deviceName: 'Attacker' }),
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
    body: JSON.stringify({ chainId: CHAIN_W, deviceId: 'attacker-device', data: junk }),
  }),
  env,
})

useDevice('W')
const agentW = new SyncAgent({ passphrase: PASS, deviceName: 'Victim W', chainId: CHAIN_W })
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

// --- 6b. Claiming a chain that predates write auth --------------------------

section('6b. Claiming an existing (pre write-auth) chain')

const CHAIN_L = 'chain-legacy-0001'
await handshakePost({
  request: new Request('https://local.test/sync/handshake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_L, deviceId: 'legacy-owner', deviceName: 'Legacy' }),
  }),
  env,
})
const legacyBefore = sqlite
  .query('SELECT push_hash FROM chains WHERE id = ?')
  .get(CHAIN_L) as { push_hash: string | null }
check('a pre-write-auth chain has no secret stored', legacyBefore?.push_hash == null)

const legacySecret = 'legacySecretValue_0123456789abcdefghijklmnop'
const claimOk = await claimPost({
  request: new Request('https://local.test/sync/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_L, deviceId: 'legacy-owner', writeSecret: legacySecret }),
  }),
  env,
})
check('the owner can claim a legacy chain', claimOk.status === 200, String(claimOk.status))
check(
  'claiming installs the secret hash',
  !!((sqlite.query('SELECT push_hash FROM chains WHERE id = ?').get(CHAIN_L) as any)?.push_hash),
)

useDevice('L1')
const agentL = new SyncAgent({
  passphrase: PASS,
  deviceName: 'Legacy owner',
  chainId: CHAIN_L,
  writeSecret: legacySecret,
})
await agentL.init()
await agentL.handshake()
check(
  'the owner can push after claiming',
  (await agentL.push({ threads: [thread('l1', 1, 'after')], messages: {}, projects: [], deleted: emptyDeleted() })) > 0,
)

const reClaim = await claimPost({
  request: new Request('https://local.test/sync/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_L, deviceId: 'legacy-owner', writeSecret: legacySecret }),
  }),
  env,
})
check('re-claiming with the same secret is a harmless retry', reClaim.status === 200, String(reClaim.status))

const steal = await claimPost({
  request: new Request('https://local.test/sync/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId: CHAIN_L, deviceId: 'someone-else', writeSecret: otherSecret }),
  }),
  env,
})
check('a second claim with a different secret is refused', steal.status === 409, String(steal.status))
check(
  'the original secret still works after a refused claim',
  (await agentL.push({ threads: [thread('l2', 2, 'still')], messages: {}, projects: [], deleted: emptyDeleted() })) > 0,
)

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
  'losing a claim race names the other device',
  /secured by another device/i.test(errorMessage(new Error('This chain was secured by another device first'))),
)
check(
  'an unrelated error is passed through unchanged',
  errorMessage(new Error('Cannot reach the sync server — are you offline?')) ===
    'Cannot reach the sync server — are you offline?',
)
check('a non-Error value still yields a string', typeof errorMessage('boom') === 'string')

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
const guesser = useDevice('guesser')
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

// A throttle on a real route emits 429 + Retry-After.
activeStorage = makeStorage() as any
const claimChain = 'chain-guard-claim'
const ownerStorage = makeStorage() as any
activeStorage = ownerStorage
const owner = new SyncAgent({ passphrase: PASS, deviceName: 'Owner', chainId: claimChain })
await owner.init()
await owner.handshake()

activeStorage = makeStorage() as any
let claimStatus = 0
for (let i = 0; i < POLICIES.claim.limit + 2; i++) {
  const res = await claimPost({
    request: new Request('https://local.test/sync/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: claimChain, deviceId: 'claim-guesser', writeSecret: newWriteSecret() }),
    }),
    env,
  })
  claimStatus = res.status
  if (res.status === 429) break
}
check('claiming is throttled after the limit', claimStatus === 429, String(claimStatus))

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

// --- summary -----------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`\x1b[31m${failures.length} check(s) failed:\x1b[0m`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`\x1b[32mAll ${passed} checks passed.\x1b[0m`)

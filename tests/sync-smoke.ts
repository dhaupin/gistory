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

// --- summary -----------------------------------------------------------------

console.log('')
if (failures.length) {
  console.log(`\x1b[31m${failures.length} check(s) failed:\x1b[0m`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`\x1b[32mAll ${passed} checks passed.\x1b[0m`)

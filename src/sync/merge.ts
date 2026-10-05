// 🔀 Merge logic - pure, deterministic, tombstone-aware
// =====================================================
//
// Every device holds the full dataset. When a remote snapshot arrives we
// reconcile it item-by-item:
//
//   1. Later timestamp wins (updatedAt ?? createdAt).
//   2. Equal timestamps are broken by sender device id (lexicographically
//      larger wins), so both devices pick the same winner.
//   3. Deletions are carried as tombstones (id -> deletedAt). A tombstone
//      hides an item unless the item was edited AFTER the deletion, in which
//      case the edit resurrects it.
//
// The functions here are pure so they can be unit tested without a browser.

import type { Message, MessagesByThread, Project, Thread } from '../lib/models'
import { emptyView, mergeView, type ViewState } from './view-state'

export interface DeletedRegistry {
  threads: Record<string, number>
  projects: Record<string, number>
  messages: Record<string, number>
}

/**
 * Singleton preferences that ride the sync payload. Deliberately tiny: only
 * things every device should agree on (currently the IANA time zone used for
 * displayed timestamps). Absent timeZone means "use the device zone".
 */
export interface SyncSettings {
  timeZone?: string
  /** LWW clock for the singleton — bumped whenever a device changes anything. */
  updatedAt?: number
}

export interface SyncData {
  threads: Thread[]
  messages: MessagesByThread
  projects: Project[]
  deleted: DeletedRegistry
  /** Synced arrangement: drag order + collapsed flags. See ./view-state. */
  view: ViewState
  /** Synced preferences. Optional so payloads predating settings still merge. */
  settings?: SyncSettings
}

export interface SyncPayload {
  threads?: Thread[]
  messages?: MessagesByThread
  projects?: Project[]
  deleted?: Partial<DeletedRegistry>
  view?: Partial<ViewState>
  settings?: SyncSettings
  senderDeviceId?: string
  sentAt?: number
}

export function emptyDeleted(): DeletedRegistry {
  return { threads: {}, projects: {}, messages: {} }
}

export function normalizeDeleted(input?: Partial<DeletedRegistry> | null): DeletedRegistry {
  return {
    threads: { ...(input?.threads || {}) },
    projects: { ...(input?.projects || {}) },
    messages: { ...(input?.messages || {}) },
  }
}

/** Record tombstone timestamps (never moving a tombstone backwards). */
export function mergeRegistry(
  local: Record<string, number>,
  incoming?: Record<string, number> | null,
): Record<string, number> {
  const next = { ...local }
  if (!incoming) return next
  for (const [id, ts] of Object.entries(incoming)) {
    if (typeof ts !== 'number') continue
    if (next[id] == null || ts > next[id]) next[id] = ts
  }
  return next
}

function itemTime(item: { updatedAt?: number; createdAt?: number }): number {
  return item.updatedAt ?? item.createdAt ?? 0
}

function incomingWins(
  incomingTs: number,
  localTs: number,
  sender: string,
  myDeviceId: string,
): boolean {
  if (incomingTs > localTs) return true
  if (incomingTs < localTs) return false
  return sender > myDeviceId
}

interface Syncable {
  id: string
  createdAt?: number
  updatedAt?: number
}

function mergeList<T extends Syncable>(
  local: T[],
  incoming: T[],
  sender: string,
  myDeviceId: string,
  tombstones: Record<string, number>,
): T[] {
  const map = new Map<string, T>()

  for (const item of local) {
    const deletedAt = tombstones[item.id]
    if (deletedAt != null && deletedAt >= itemTime(item)) continue
    map.set(item.id, item)
  }

  for (const item of incoming) {
    const deletedAt = tombstones[item.id]
    if (deletedAt != null && deletedAt >= itemTime(item)) continue
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
      continue
    }
    if (incomingWins(itemTime(item), itemTime(existing), sender, myDeviceId)) {
      map.set(item.id, item)
    }
  }

  return Array.from(map.values())
}

function mergeMessages(
  local: MessagesByThread,
  incoming: MessagesByThread,
  sender: string,
  myDeviceId: string,
  tombstones: Record<string, number>,
): MessagesByThread {
  const threadIds = new Set([...Object.keys(local), ...Object.keys(incoming)])
  const result: MessagesByThread = {}

  for (const threadId of threadIds) {
    const map = new Map<string, Message>()

    for (const msg of local[threadId] || []) {
      const deletedAt = tombstones[msg.id]
      if (deletedAt != null && deletedAt >= itemTime(msg)) continue
      map.set(msg.id, msg)
    }

    for (const msg of incoming[threadId] || []) {
      const deletedAt = tombstones[msg.id]
      if (deletedAt != null && deletedAt >= itemTime(msg)) continue
      const existing = map.get(msg.id)
      if (!existing) {
        map.set(msg.id, msg)
        continue
      }
      // Compare the last edit time (falling back to createdAt for messages
      // created before edits carried an updatedAt), not just createdAt —
      // otherwise a content edit only wins if the editor's deviceId sorts
      // higher and can be silently reverted.
      if (incomingWins(itemTime(msg), itemTime(existing), sender, myDeviceId)) {
        map.set(msg.id, msg)
      }
    }

    result[threadId] = Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt)
  }

  return result
}

/**
 * Merge the singleton settings object. Same LWW + deviceId tie-break as items,
 * compared on `updatedAt`. A tie with only one side carrying a value prefers
 * that side, so a device that has set a preference wins over one that never
 * touched settings even if their clocks agree exactly.
 */
export function mergeSettings(
  local?: SyncSettings,
  incoming?: SyncSettings,
  sender = '',
  myDeviceId = '',
): SyncSettings {
  const l = local || {}
  const i = incoming || {}
  const lt = l.updatedAt ?? 0
  const it = i.updatedAt ?? 0
  if (it > lt) return i
  if (it < lt) return l
  if (l.timeZone == null && i.timeZone != null) return i
  if (l.timeZone != null && i.timeZone == null) return l
  return sender > myDeviceId ? i : l
}

/** Merge one decrypted remote payload into the local dataset. */
export function mergePayload(
  local: SyncData,
  remote: SyncPayload,
  myDeviceId: string,
): SyncData {
  const sender = remote.senderDeviceId || ''
  const deleted: DeletedRegistry = {
    threads: mergeRegistry(local.deleted.threads, remote.deleted?.threads),
    projects: mergeRegistry(local.deleted.projects, remote.deleted?.projects),
    messages: mergeRegistry(local.deleted.messages, remote.deleted?.messages),
  }

  const threads = mergeList(local.threads, remote.threads || [], sender, myDeviceId, deleted.threads)
  const messages = mergeMessages(
    local.messages,
    remote.messages || {},
    sender,
    myDeviceId,
    deleted.messages,
  )

  // Drop message arrays whose thread no longer exists. A device that deleted a
  // thread pushes a tombstone, but every *other* device still carries that
  // thread's messages in its full-state payload — so without this, each sync
  // re-imports messages for a deleted thread and they accumulate forever,
  // growing every later push.
  const aliveThreads = new Set(threads.map(thread => thread.id))
  for (const threadId of Object.keys(messages)) {
    if (!aliveThreads.has(threadId)) delete messages[threadId]
  }

  return {
    deleted,
    view: mergeView(local.view ?? emptyView(), remote.view, sender, myDeviceId),
    settings: mergeSettings(local.settings, remote.settings, sender, myDeviceId),
    threads,
    projects: mergeList(
      local.projects,
      remote.projects || [],
      sender,
      myDeviceId,
      deleted.projects,
    ),
    messages,
  }
}

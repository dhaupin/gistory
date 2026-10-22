// Sync-state management: IndexedDB (authoritative) with a localStorage
// shadow — see src/sync/idb.ts for why the loaders have the same shape as
// before but a different store underneath.

import { stGetString, stKeyList, stSetString } from '../sync/idb'
import type { Message, Project, Thread, MessagesByThread } from './models'
import type { DeletedRegistry, SyncSettings } from '../sync/merge'
import { mergeSettings, mergeVariables } from '../sync/merge'
import { loadView, mergeView, viewKeyItem, type ViewState } from '../sync/view-state'
import { normalizeVariables, type Variables } from './variables'

const THREADS_KEY = 'gistory_threads'
const MESSAGES_KEY = 'gistory_messages'
const PROJECTS_KEY = 'gistory_projects'
const SETTINGS_KEY = 'gistory_settings'
const VARIABLES_KEY = 'gistory_vars'
const DRAFT_KEY_PREFIX = 'gistory_draft_'

export function loadData(): {
  threads: Thread[]
  messages: MessagesByThread
  projects: Project[]
} {
  try {
    return {
      threads: JSON.parse(stGetString(THREADS_KEY) || '[]'),
      messages: JSON.parse(stGetString(MESSAGES_KEY) || '{}'),
      projects: JSON.parse(stGetString(PROJECTS_KEY) || '[]')
    }
  } catch {
    return { threads: [], messages: {}, projects: [] }
  }
}

/**
 * These run from React effects on every state change. A full or blocked
 * localStorage (quota exceeded, Safari private mode) must not throw out of an
 * effect and take the whole app down with it — `saveView` already swallowed
 * this, so the content writers were the odd ones out. Data stays correct in
 * memory either way; only the persistence is lost.
 */
function writeJson(key: string, value: unknown): boolean {
  try {
    stSetString(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function saveThreads(threads: Thread[]) {
  return writeJson(THREADS_KEY, threads)
}

export function saveMessages(messages: MessagesByThread) {
  return writeJson(MESSAGES_KEY, messages)
}

export function saveProjects(projects: Project[]) {
  return writeJson(PROJECTS_KEY, projects)
}

let idCounter = Date.now()
export function generateId(prefix = ''): string {
  return `${prefix}${++idCounter}-${Math.random().toString(36).slice(2, 9)}`
}

// --- Backup tracking ---------------------------------------------------------
// Sync retains only the newest 5 snapshots per chain, so a downloaded export
// is the real archive. The Settings Snapshot tab shows this stamp and nudges
// when it goes stale.

const LAST_EXPORT_KEY = 'gistory_last_export'

export function getLastExport(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_EXPORT_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function setLastExport(ts: number = Date.now()) {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(ts))
  } catch {
    /* storage full — the nudge just keeps showing */
  }
}

// Draft (auto-save) functions
export function loadDraft(threadId: string): string {
  try {
    return localStorage.getItem(DRAFT_KEY_PREFIX + threadId) || ''
  } catch {
    return ''
  }
}

export function saveDraft(threadId: string, content: string) {
  if (content) {
    localStorage.setItem(DRAFT_KEY_PREFIX + threadId, content)
  } else {
    localStorage.removeItem(DRAFT_KEY_PREFIX + threadId)
  }
}

export function clearDraft(threadId: string) {
  localStorage.removeItem(DRAFT_KEY_PREFIX + threadId)
}

/**
 * Draft rows are device-local scratch (never synced), so nothing else ever
 * cleans them: deleting a thread would leave its `gistory_draft_<id>` row in
 * storage forever. Sweep the store of drafts whose thread is not in the
 * given (post-merge, post-delete) list. Idempotent; never throws — a failed
 * delete leaves a few bytes of dead text, not data corruption.
 */
export function sweepDrafts(threads: Thread[]) {
  const alive = new Set(threads.map((t) => t.id))
  for (const key of stKeyList(DRAFT_KEY_PREFIX)) {
    if (!alive.has(key.slice(DRAFT_KEY_PREFIX.length))) {
      try {
        localStorage.removeItem(key)
        stSetString(key, null)
      } catch {
        /* stale text is harmless; swept again next boot */
      }
    }
  }
}

export function loadSettings(): SyncSettings {
  // Prerender guard (prestruct runs AppLayout in Node): stGetString returns
  // null without any storage at all, so the parse below degrades to {}.
  try {
    const raw = JSON.parse(stGetString(SETTINGS_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function saveSettings(settings: SyncSettings) {
  return writeJson(SETTINGS_KEY, settings)
}

export function loadVariables(): Variables {
  try {
    return normalizeVariables(JSON.parse(stGetString(VARIABLES_KEY) || '{}'))
  } catch {
    return {}
  }
}

export function saveVariables(variables: Variables) {
  return writeJson(VARIABLES_KEY, variables)
}

// Export types
export interface ExportData {
  version: number
  exportedAt: number
  threads: Thread[]
  messages: MessagesByThread
  projects: Project[]
  /** Synced arrangement (drag order + collapsed flags). Optional on import. */
  view?: ViewState
  /** Synced preferences (time zone). Optional on import; merged by LWW. */
  settings?: SyncSettings
  /** Saved {{variables}}. Optional on import; merged per key by LWW. */
  variables?: Variables
}

// Export all data
export function exportAll(): ExportData {
  const { threads, messages, projects } = loadData()
  return {
    version: 1,
    exportedAt: Date.now(),
    threads,
    messages,
    projects,
    view: loadView(),
    settings: loadSettings(),
    variables: loadVariables()
  }
}

/**
 * Keep only the view entries belonging to the exported items.
 *
 * Collapse state is stored under a namespaced key (`message:<id>`,
 * `project:<id>`) because an item is arranged in several places at once, so
 * this has to compare the *item id* a key resolves to. Matching the raw key
 * against a list of bare ids silently dropped every collapsed message and
 * sidebar group from a thread or project export.
 *
 * `section:*` keys resolve to no item and are UI regions rather than exported
 * content, so they are dropped.
 */
function viewFor(view: ViewState, ids: string[]): ViewState {
  const keep = new Set(ids)
  const out: ViewState = {}
  for (const [key, entry] of Object.entries(view)) {
    const item = viewKeyItem(key)
    if (item !== null && keep.has(item)) out[key] = entry
  }
  return out
}

// Export single thread with its messages
export function exportThread(threadId: string): ExportData | null {
  const { threads, messages } = loadData()
  const thread = threads.find(t => t.id === threadId)
  if (!thread) return null
  
  const threadMessages = messages[threadId] || []
  return {
    version: 1,
    exportedAt: Date.now(),
    threads: [thread],
    messages: { [threadId]: threadMessages },
    projects: [],
    view: viewFor(loadView(), [threadId, ...threadMessages.map(m => m.id)]),
    // Global pool + this thread's own pool: re-importing a thread backup
    // restores its variables without dragging in unrelated thread pools.
    variables: exportVariablesFor([threadId])
  }
}

/** Alive global entries plus the alive pools of the given thread scopes. */
function exportVariablesFor(threadIds: string[]): Variables {
  const all = loadVariables()
  const keep = new Set(threadIds)
  const out: Variables = {}
  for (const [key, entry] of Object.entries(all)) {
    if (entry.deletedAt != null) continue
    const scope = key.slice(0, key.indexOf(':'))
    if (scope === 'global' || keep.has(scope)) out[key] = entry
  }
  return out
}

// Export single project with its threads
export function exportProject(projectId: string): ExportData | null {
  const { threads, messages, projects } = loadData()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null
  
  const projectThreads = threads.filter(t => t.projectIds.includes(projectId))
  const projectMessages: MessagesByThread = {}
  for (const thread of projectThreads) {
    projectMessages[thread.id] = messages[thread.id] || []
  }
  
  return {
    version: 1,
    exportedAt: Date.now(),
    threads: projectThreads,
    messages: projectMessages,
    projects: [project],
    view: viewFor(loadView(), [
      project.id,
      ...projectThreads.map(t => t.id),
      ...Object.values(projectMessages).flat().map(m => m.id),
    ]),
    variables: exportVariablesFor(projectThreads.map(t => t.id))
  }
}

// Import - returns merged data. `deleted` (the tombstone registry) is optional:
// when supplied, previously-deleted items are not resurrected by an import.
export function importData(
  data: ExportData,
  deleted?: DeletedRegistry,
): { threads: Thread[], messages: MessagesByThread, projects: Project[], view: ViewState, settings: SyncSettings, variables: Variables } {
  const existing = loadData()
  const importedThreads = data.threads || []
  const importedMessages = data.messages || {}
  const importedProjects = data.projects || []

  const timeOf = (item: { updatedAt?: number; createdAt?: number }) =>
    item.updatedAt ?? item.createdAt ?? 0

  // Merge threads (by id - overwrite if same), skipping anything the local
  // tombstone registry still considers deleted.
  const threadMap = new Map(existing.threads.map(t => [t.id, t]))
  for (const thread of importedThreads) {
    const deletedAt = deleted?.threads[thread.id]
    if (deletedAt != null && deletedAt >= timeOf(thread)) continue
    threadMap.set(thread.id, thread)
  }

  // Merge messages by id - never concat, or re-importing the same backup would
  // duplicate every message. Keep whichever copy was edited most recently.
  const messageMap = { ...existing.messages }
  for (const [threadId, msgs] of Object.entries(importedMessages)) {
    const byId = new Map<string, Message>()
    for (const msg of messageMap[threadId] || []) byId.set(msg.id, msg)
    for (const msg of msgs) {
      const deletedAt = deleted?.messages[msg.id]
      if (deletedAt != null && deletedAt >= timeOf(msg)) continue
      const current = byId.get(msg.id)
      if (!current || timeOf(msg) >= timeOf(current)) byId.set(msg.id, msg)
    }
    messageMap[threadId] = Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt)
  }

  // Merge projects (by id), honoring tombstones.
  const projectMap = new Map(existing.projects.map(p => [p.id, p]))
  for (const project of importedProjects) {
    const deletedAt = deleted?.projects[project.id]
    if (deletedAt != null && deletedAt >= timeOf(project)) continue
    projectMap.set(project.id, project)
  }
  
  return {
    threads: Array.from(threadMap.values()),
    messages: messageMap,
    projects: Array.from(projectMap.values()),
    // Arrangement merges by key, newest edit wins — same rule as sync.
    view: mergeView(loadView(), data.view),
    // Preferences merge by LWW too, so importing an older backup never
    // drags the time zone backwards past a newer local change.
    settings: mergeSettings(loadSettings(), data.settings),
    // Variables merge per key by LWW (deletion tombstones included), so an
    // old backup never drags a variable back over a newer change here.
    variables: mergeVariables(loadVariables(), data.variables)
  }
}
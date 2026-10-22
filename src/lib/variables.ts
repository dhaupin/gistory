// 🧩 Saved variables for `{{placeholder}}` prompts
//
// ThreadView already turns `{{variable}}` placeholders into a fill-in form at
// copy time — but the values were typed once and forgotten. This module gives
// them a home: named values that the fill form pre-populates from, manageable
// in one place. A variable belongs to either the **global** pool (usable by
// every prompt) or a **thread pool** (used when filling prompts in that
// thread — e.g. a per-project "client name").
//
// Sync story: the whole map rides inside the sync payload as `SyncData.variables`
// and merges **per key** by LWW on `updatedAt` with the same deviceId
// tie-break as view-state and settings — mirroring `mergeView` deliberately,
// because a variable edit on one device can never clobber an edit to another
// variable made concurrently on a second device.
//
// Deletion is a tombstone *inside* the entry (`deletedAt`), not the key's
// absence: absent keys carry no information about how fresh they are, so two
// devices would disagree forever about whether a variable exists. A newer
// edit (a newer `updatedAt`) resurrects a deleted variable, same as items.

export interface VarEntry {
  /** Display name as authored (keys are lowered for dedupe). */
  name: string
  value: string
  /** LWW clock — bumped on every save and on delete. */
  updatedAt: number
  /** When the variable was deleted. Absent = alive. */
  deletedAt?: number
}

/** scope is `'global'` or a thread id. */
export type Variables = Record<string, VarEntry>

export const GLOBAL_SCOPE = 'global'

/** Stable map key: scope + case-folded name (dedupes `name`/`Name`/`NAME`). */
export function varKey(scope: string, name: string): string {
  return `${scope}:${name.trim().toLowerCase()}`
}

export function emptyVariables(): Variables {
  return {}
}

/** Only well-formed entries survive; a junk row cannot poison a typed loader. */
export function normalizeVariables(input?: Partial<Variables> | null): Variables {
  const out: Variables = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, raw] of Object.entries(input)) {
    if (!raw || typeof raw !== 'object') continue
    const name = typeof (raw as VarEntry).name === 'string' ? (raw as VarEntry).name : ''
    const value = typeof (raw as VarEntry).value === 'string' ? (raw as VarEntry).value : ''
    const updatedAt = (raw as VarEntry).updatedAt
    if (!name) continue
    out[key] = {
      name,
      value,
      updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0,
      deletedAt:
        typeof (raw as VarEntry).deletedAt === 'number' ? (raw as VarEntry).deletedAt : undefined,
    }
  }
  return out
}

/** Alive entries only, optionally restricted to global + one thread's pool. */
export function liveVariables(vars: Variables, threadId?: string): Variables {
  const out: Variables = {}
  for (const [key, entry] of Object.entries(vars)) {
    if (entry.deletedAt != null) continue
    if (threadId == null) {
      out[key] = entry
      continue
    }
    const scope = key.slice(0, key.indexOf(':'))
    if (scope === GLOBAL_SCOPE || scope === threadId) out[key] = entry
  }
  return out
}

/**
 * The value used when filling `{{name}}` inside a thread: the thread pool
 * wins over the global pool (a per-thread "client name" should override the
 * generic one), case-insensitively to match `templateVars` dedupe rules.
 */
export function lookupVariable(
  vars: Variables,
  scope: string,
  name: string,
): VarEntry | null {
  const key = varKey(scope, name)
  const local = vars[key]
  if (local && local.deletedAt == null && local.value) return local
  const global = vars[varKey(GLOBAL_SCOPE, name)]
  if (global && global.deletedAt == null && global.value) return global
  return null
}

/** Split a map into alive global entries and per-thread groups. */
export function groupVariables(
  vars: Variables,
): { scope: string; entries: VarEntry[]; keys: string[] }[] {
  const groups = new Map<string, { entries: VarEntry[]; keys: string[] }>()
  for (const [key, entry] of Object.entries(vars)) {
    if (entry.deletedAt != null) continue
    const scope = key.slice(0, key.indexOf(':'))
    const group = groups.get(scope) || { entries: [], keys: [] }
    group.entries.push(entry)
    group.keys.push(key)
    groups.set(scope, group)
  }
  return Array.from(groups.entries()).map(([scope, g]) => ({
    scope,
    entries: g.entries.sort((a, b) => a.name.localeCompare(b.name)),
    keys: g.keys,
  }))
}

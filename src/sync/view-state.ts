// 🔀 View state — the synced handler for *arrangement*, not content
// ==================================================================
//
// Threads, messages, and projects each get one entry here that holds the two
// things a user rearranges rather than authors:
//
//   • `rank`     — manual drag order within its board/group (lower is earlier)
//   • `collapsed`— whether the item is folded away
//
// Why a separate map instead of more fields on Thread/Message/Project:
// arrangement is orthogonal to content, it has a different merge story (an
// entry is replaced per *key*, not per item), and it keeps drags from rewriting
// whole content objects — a reorder touches one key, so a concurrent edit to
// that thread's name can never be clobbered by a reorder on another device.
//
// Merge rule: per key, the entry with the newer `updatedAt` wins; equal
// timestamps break on the larger sender deviceId, exactly like content, so both
// devices independently reach the same answer.

export interface ItemView {
  /** Manual drag order. Lower sorts first. Absent = "use the natural sort". */
  rank?: number
  /** Folded away in its list. */
  collapsed?: boolean
  /** Drives last-write-wins for this entry. */
  updatedAt?: number
}

/** Keyed by item id (thread/message/project ids are unique), or by a
 *  section key such as `section:home-projects` for UI-only regions. */
export type ViewState = Record<string, ItemView>

const VIEW_KEY = 'gistory_view'

/** Gap between sequential ranks. Fractional ranks always land inside it. */
export const RANK_STEP = 1024

export function emptyView(): ViewState {
  return {}
}

export function normalizeView(input?: Partial<ViewState> | null): ViewState {
  const out: ViewState = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, raw] of Object.entries(input)) {
    if (!raw || typeof raw !== 'object') continue
    const entry: ItemView = {}
    if (typeof raw.rank === 'number' && Number.isFinite(raw.rank)) entry.rank = raw.rank
    if (typeof raw.collapsed === 'boolean') entry.collapsed = raw.collapsed
    if (typeof raw.updatedAt === 'number') entry.updatedAt = raw.updatedAt
    out[key] = entry
  }
  return out
}

export function loadView(): ViewState {
  // Prerender guard (prestruct runs AppLayout in Node). The smoke test's fake
  // storage defines localStorage WITHOUT window, so key off localStorage.
  if (typeof localStorage === 'undefined') return {}
  try {
    return normalizeView(JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'))
  } catch {
    return {}
  }
}

export function saveView(state: ViewState) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable — arrangement still works in memory */
  }
}

/** Last-write-wins timestamp for an entry. */
export function viewTime(entry?: ItemView): number {
  return entry?.updatedAt ?? 0
}

/**
 * Merge an incoming view map key-by-key. `sender`/`myDeviceId` only matter for
 * the equal-timestamp tie-break, which keeps both devices in agreement.
 */
export function mergeView(
  local: ViewState,
  incoming?: Partial<ViewState> | null,
  sender = '',
  myDeviceId = '',
): ViewState {
  const next: ViewState = { ...local }
  if (!incoming) return next
  for (const [key, raw] of Object.entries(incoming)) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = normalizeView({ [key]: raw })[key]
    if (!candidate) continue
    const current = next[key]
    if (!current) {
      next[key] = candidate
      continue
    }
    const ct = viewTime(current)
    const nt = viewTime(candidate)
    if (nt > ct || (nt === ct && sender > myDeviceId)) next[key] = candidate
  }
  return next
}

/** A rank that sorts strictly between `prev` and `next` (either may be absent). */
export function rankBetween(prev?: number, next?: number): number {
  if (prev == null && next == null) return RANK_STEP
  if (prev == null) return (next as number) - RANK_STEP
  if (next == null) return prev + RANK_STEP
  return (prev + next) / 2
}

/**
 * True when the gap between two neighbours is too small to keep halving — the
 * signal to renumber the whole group instead of splitting forever.
 */
export function needsRebalance(prev?: number, next?: number): boolean {
  if (prev == null || next == null) return false
  return next - prev < 1
}

/** Renumber a group of `count` items evenly. */
export function sequentialRanks(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * RANK_STEP)
}

/** Move one entry of an array, returning a new array (no mutation). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  if (from < 0 || from >= next.length) return next
  const clamped = Math.max(0, Math.min(next.length - 1, to))
  const [moved] = next.splice(from, 1)
  next.splice(clamped, 0, moved)
  return next
}

/**
 * Move an item inside a *visible subset* of a longer list — the case when a
 * search filter hides some rows.
 *
 * Ranking only the visible ids would hand them 1, 2, 3… while the hidden rows
 * kept their old ranks, so the two sets collide and the order degrades. Instead
 * splice the move into the full order so the visible rows come out in exactly
 * the order the user asked for, while every hidden row keeps its position
 * relative to the others.
 *
 * The anchor is the first visible row *after* the moved one in the result, not
 * the row that used to sit at `to`: `to` is an index into the post-move list,
 * so anchoring on the pre-move `visible[to]` lands one place too early.
 */
export function moveWithinSubset(
  full: string[],
  visible: string[],
  from: number,
  to: number,
): string[] {
  const moved = visible[from]
  if (!moved) return [...full]
  const next = full.filter((id) => id !== moved)
  const after = moveItem(visible, from, to)[to + 1]
  if (after === undefined) return [...next, moved]
  const at = next.indexOf(after)
  if (at < 0) return [...next, moved]
  next.splice(at, 0, moved)
  return next
}

/**
 * Renumber every id in an order. Used when hidden rows shift as well, so
 * fractional "touch one entry only" logic would not be safe.
 */
export function applyFullOrder(
  current: ViewState,
  orderedIds: string[],
  now: number,
): ViewState {
  const next: ViewState = { ...current }
  sequentialRanks(orderedIds.length).forEach((rank, i) => {
    const id = orderedIds[i]
    next[id] = { ...next[id], rank, updatedAt: now }
  })
  return next
}

/**
 * Write the arrangement for a freshly reordered group.
 *
 * Once every member of a group has a rank, a drag only rewrites the entry that
 * moved (a fractional rank between its new neighbours), which is what keeps
 * concurrent reorders on two devices from fighting. The first drag in a group —
 * or one that has run out of fractional room — renumbers the group instead.
 *
 * `orderedIds` is the group's id order *after* the move and `movedIndex` is
 * where the dragged item ended up.
 */
export function applyOrder(
  current: ViewState,
  orderedIds: string[],
  movedIndex: number,
  now: number,
): ViewState {
  const next: ViewState = { ...current }
  const fullyRanked = orderedIds.every(id => typeof next[id]?.rank === 'number')
  const renumber = () => {
    sequentialRanks(orderedIds.length).forEach((rank, i) => {
      const id = orderedIds[i]
      next[id] = { ...next[id], rank, updatedAt: now }
    })
  }

  if (!fullyRanked) {
    renumber()
    return next
  }

  const movedId = orderedIds[movedIndex]
  if (!movedId) return next

  const before = movedIndex > 0 ? next[orderedIds[movedIndex - 1]]?.rank : undefined
  const after = movedIndex < orderedIds.length - 1 ? next[orderedIds[movedIndex + 1]]?.rank : undefined

  if (needsRebalance(before, after)) {
    renumber()
    return next
  }

  next[movedId] = { ...next[movedId], rank: rankBetween(before, after), updatedAt: now }
  return next
}

/**
 * Keys are not all bare item ids. A collapsed message is stored as
 * `message:<id>` and a collapsed sidebar group as `project:<id>`, because the
 * same item id can be arranged in several places (a thread appears on the home
 * board and in every project it belongs to). Only `section:*` names no item at
 * all, so it has to be exempt explicitly.
 */
const NAMESPACED_KEY = /^([a-z]+):(.+)$/

/** The item id a view key refers to, or null for `section:*` UI-only keys. */
export function viewKeyItem(key: string): string | null {
  const match = NAMESPACED_KEY.exec(key)
  if (!match) return key
  if (match[1] === 'section') return null
  return match[2]
}

/** Forget arrangement for keys that no longer exist (deleted items). */
export function pruneView(view: ViewState, ids: Iterable<string>): ViewState {
  const alive = new Set(ids)
  const next: ViewState = {}
  let changed = false
  for (const [key, entry] of Object.entries(view)) {
    const item = viewKeyItem(key)
    // `section:*` keys are UI regions, not items, and are never pruned.
    if (item !== null && !alive.has(item)) {
      changed = true
      continue
    }
    next[key] = entry
  }
  return changed ? next : view
}


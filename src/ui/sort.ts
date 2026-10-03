// Global sorting utilities
//
// Every item kind (threads, messages, projects) can be pinned. Rather than
// repeat the "pinned float to the top" rule in each board, it lives once in
// `sortPinnedFirst` and each kind supplies its own comparator.

import type { Message, Project, Thread } from '../lib/models'

export type SortField = 'createdAt' | 'updatedAt' | 'name'
export type SortDir = 'asc' | 'desc'

export interface SortState {
  field: SortField
  dir: SortDir
}

/** Anything that can be pinned: `pinned` floats up, `pinnedAt` breaks ties. */
export interface Pinnable {
  pinned?: boolean
  pinnedAt?: number
}

/** Looks up an item's manual drag rank, or undefined when it has none. */
export type RankOf<T> = (item: T) => number | undefined

/** One <option> in a sort control. */
export interface SortOption {
  value: string
  label: string
}

// Thread boards (home + project detail) sort threads, so name ordering is
// meaningful there. Message lists only sort by time. Keeping the option lists
// here means every board shows the same labels and ordering.
export const THREAD_SORT_OPTIONS: SortOption[] = [
  { value: 'createdAt_desc', label: 'Newest first' },
  { value: 'createdAt_asc', label: 'Oldest first' },
  { value: 'updatedAt_desc', label: 'Recently updated' },
  { value: 'updatedAt_asc', label: 'Least updated' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
]

export const MESSAGE_SORT_OPTIONS: SortOption[] = [
  { value: 'createdAt_desc', label: 'Newest first' },
  { value: 'createdAt_asc', label: 'Oldest first' },
  { value: 'updatedAt_desc', label: 'Recently updated' },
  { value: 'updatedAt_asc', label: 'Least updated' },
]

export function parseSort(str: string | null): SortState {
  if (!str) return { field: 'createdAt', dir: 'desc' }
  const [field, dir] = str.split('_') as [SortField, SortDir]
  if (!field || !dir) return { field: 'createdAt', dir: 'desc' }
  return { field, dir }
}

export function toSortParam(state: SortState): string {
  return `${state.field}_${state.dir}`
}

/**
 * Manual drag order wins when both items carry a rank — once a user has
 * arranged a list by hand, an active sort control must not fight them. Items
 * without a rank fall through to pin-first, then the active sort, so untouched
 * groups behave exactly as before.
 */
export function sortPinnedFirst<T extends Pinnable>(
  items: T[],
  compare: (a: T, b: T) => number,
  rankOf?: RankOf<T>,
): T[] {
  return [...items].sort((a, b) => {
    if (rankOf) {
      const ar = rankOf(a)
      const br = rankOf(b)
      if (ar != null && br != null && ar !== br) return ar - br
    }
    const ap = a.pinned ? 1 : 0
    const bp = b.pinned ? 1 : 0
    if (ap !== bp) return bp - ap
    const ordered = compare(a, b)
    if (ordered !== 0) return ordered
    if (ap === 1) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)
    return 0
  })
}

export function sortThreads(
  threads: Thread[],
  state: SortState,
  rankOf?: RankOf<Thread>,
): Thread[] {
  const { field, dir } = state
  return sortPinnedFirst(threads, (a, b) => {
    let av = a[field] ?? a.createdAt
    let bv = b[field] ?? b.createdAt
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  }, rankOf)
}

export function sortMessages(
  messages: Message[],
  state: SortState,
  rankOf?: RankOf<Message>,
): Message[] {
  // Message lists never sort by name, so fold that field back to time.
  const field = state.field === 'name' ? 'createdAt' : state.field
  const { dir } = state
  return sortPinnedFirst(messages, (a, b) => {
    const av = a[field] ?? a.createdAt
    const bv = b[field] ?? b.createdAt
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  }, rankOf)
}

/** Projects are always ordered by name, with pinned ones floating up. */
export function sortProjects(
  projects: Project[],
  rankOf?: RankOf<Project>,
): Project[] {
  return sortPinnedFirst(projects, (a, b) => a.name.localeCompare(b.name), rankOf)
}

export function toggleSortDir(dir: SortDir): SortDir {
  return dir === 'asc' ? 'desc' : 'asc'
}

/** Parse the `<select>` value back into a SortState. */
export function sortStateFromValue(value: string): SortState {
  const [field, dir] = value.split('_') as [SortField, SortDir]
  return { field, dir }
}

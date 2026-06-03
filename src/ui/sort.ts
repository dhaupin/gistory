// Global sorting utilities

import type { Thread } from '../lib/models'

export type SortField = 'createdAt' | 'updatedAt' | 'name'
export type SortDir = 'asc' | 'desc'

export interface SortState {
  field: SortField
  dir: SortDir
}

export function parseSort(str: string | null): SortState {
  if (!str) return { field: 'createdAt', dir: 'desc' }
  const [field, dir] = str.split('_') as [SortField, SortDir]
  if (!field || !dir) return { field: 'createdAt', dir: 'desc' }
  return { field, dir }
}

export function toSortParam(state: SortState): string {
  return `${state.field}_${state.dir}`
}

export function sortThreads(threads: Thread[], state: SortState): Thread[] {
  const { field, dir } = state
  return [...threads].sort((a, b) => {
    let av = a[field] ?? a.createdAt
    let bv = b[field] ?? b.createdAt
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

export function toggleSortDir(dir: SortDir): SortDir {
  return dir === 'asc' ? 'desc' : 'asc'
}
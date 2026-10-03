// ViewStateContext — the single entry point components use for synced
// arrangement (drag order + collapsed flags).
//
// The state itself lives in App (it is part of the sync payload); this context
// just hands it down without threading three props through every board.

import { createContext, useContext, type ReactNode } from 'react'
import type { ItemView, ViewState } from '../sync/view-state'

export interface ViewStateApi {
  view: ViewState
  /** Fold/unfold anything keyed by `key` (an item id or a section key). */
  isCollapsed: (key: string) => boolean
  toggleCollapse: (key: string) => void
  /**
   * Reorder a group. `ids` is the current *visible* order and `to` is the index
   * the item at `from` should end up at. When a filter hides rows, pass
   * `allIds` (the unfiltered order) so the move can be spliced into the full
   * list instead of ranking a subset and colliding with the hidden rows.
   */
  reorder: (ids: string[], from: number, to: number, allIds?: string[]) => void
}

const ViewStateContext = createContext<ViewStateApi | null>(null)

export function ViewStateProvider({
  value,
  children,
}: {
  value: ViewStateApi
  children: ReactNode
}) {
  return <ViewStateContext.Provider value={value}>{children}</ViewStateContext.Provider>
}

export function useViewState(): ViewStateApi {
  const ctx = useContext(ViewStateContext)
  if (!ctx) {
    throw new Error('useViewState must be used inside <ViewStateProvider>')
  }
  return ctx
}

/** The view entry for one item, or undefined when it has never been arranged. */
export function useItemView(id: string): ItemView | undefined {
  return useViewState().view[id]
}

/** Rank lookup matching what the sorters expect. */
export function useRankOf<T extends { id: string }>(): (item: T) => number | undefined {
  const { view } = useViewState()
  return (item) => view[item.id]?.rank
}
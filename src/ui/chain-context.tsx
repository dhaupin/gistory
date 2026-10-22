// Whether this device is a member of a sync chain.
//
// The only consumer is ConfirmDialog: any destructive change that lands in the
// sync payload (deleting a message/thread/project) removes data on EVERY
// device in the chain, not just this one — so the dialog warns of that, and
// only when there is a chain to warn about. A context (not a prop) because the
// destructive dialogs live behind five different components, and threading a
// flag through all of them to reach the same boolean is the thing it replaces.
//
// Provider lives in App, which already owns `syncEnabled`. Defaults to false,
// so a provider-less usage (tests, prerender) simply reads a solo device.

import { createContext, useContext, useMemo, type ReactNode } from 'react'

export interface ChainContextValue {
  /** True when this device is joined to a sync chain. */
  inChain: boolean
}

const ChainContext = createContext<ChainContextValue>({ inChain: false })

export function ChainProvider({
  inChain,
  children,
}: {
  inChain: boolean
  children: ReactNode
}) {
  const value = useMemo(() => ({ inChain }), [inChain])
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
}

export function useInChain(): boolean {
  return useContext(ChainContext).inChain
}

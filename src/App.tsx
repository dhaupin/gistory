// Gistory App - Main Entry Point

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { loadData, saveThreads, saveMessages, saveProjects, generateId, importData, loadSettings, saveSettings } from './lib/store'
import type { Thread, Project, Message, MessagesByThread } from './lib/models'
import { parseRoute, onRouteChange, initRouter, navigate } from './lib/router'
import {
  SyncAgent,
  newChainId,
  newWriteSecret,
  pairingTokenFromChain,
  chainIdFromToken,
  suggestDeviceName,
  type RemoteDevice,
} from './sync/agent'
import { emptyDeleted, mergePayload, normalizeDeleted, type DeletedRegistry, type SyncData, type SyncPayload, type SyncSettings } from './sync/merge'
import { errorMessage } from './sync/errors'
import { SyncError } from './sync/agent'
import { SyncQos } from './sync/qos'
import type { PromptMetadata, ThreadStatus } from './lib/models'
import { applyFullOrder,
  applyOrder,
  loadView,
  moveItem,
  moveWithinSubset,
  pruneView,
  saveView,
  viewKeyItem,
  type ViewState,
} from './sync/view-state'
import { ViewStateProvider, type ViewStateApi } from './ui/view-state'
import Layout from './components/Layout'
import BurgerMenu from './components/BurgerMenu'
import ThreadView from './components/ThreadView'
import HomeBoard from './components/HomeBoard'
import ProjectsBoard from './components/ProjectsBoard'
import ProjectDetail from './components/ProjectDetail'
import SettingsPage from './components/Settings'
import EmptyState from './components/EmptyState'
import Onboarding from './components/Onboarding'
import CommandPalette from './components/CommandPalette'
import TrashPage from './components/TrashPage'
import { parseSort, toSortParam, type SortState } from './ui/sort'

// Production runs same-origin (Cloudflare Pages Functions at /sync).
// Local dev can point at `wrangler pages dev` via VITE_SYNC_URL.
const SYNC_BASE = (import.meta.env.VITE_SYNC_URL as string | undefined) || ''

const DELETED_KEY = 'gistory_deleted'

/**
 * Turn a sync failure into something the user can act on.
 *
 * The server's own strings are accurate but written for a log. The two that
 * matter most are the write-auth failures, which a user can genuinely fix: a
 * device paired with an older code (no write secret) can read the chain but not
 * write to it, and re-pairing with a current code is the remedy.
 */

function loadDeleted(): DeletedRegistry {
  // Prerender guard (prestruct runs AppLayout in Node). Keyed off localStorage
  // (not window) because the smoke test's fake storage has no window either.
  if (typeof localStorage === 'undefined') return emptyDeleted()
  try {
    return normalizeDeleted(JSON.parse(localStorage.getItem(DELETED_KEY) || 'null'))
  } catch {
    return emptyDeleted()
  }
}

function saveDeleted(registry: DeletedRegistry) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(registry))
  } catch {
    /* storage full / unavailable — sync still works in-memory */
  }
}

/**
 * The app shell. Under the prestruct prerender, AppLayout mounts this for the
 * hash-routed surfaces; the browser entry wraps it in BrowserRouter via
 * AppLayout (src/AppLayout.tsx) so path routes (/, /terms, /privacy) and the
 * app share one page. Keep BrowserRouter OUT of this file: prerendering loads
 * this module in Node, and a router bound to window.location there makes every
 * route prerender as '/' silently.
 */
export default function App() {
  // NOTE: This component is ALSO mounted by AppLayout under react-router's
  // BrowserRouter (see src/AppLayout.tsx). The prestruct prerender renders
  // AppLayout with StaticRouter in Node; nothing in AppLayout's import graph
  // may import BrowserRouter. Keep that split intact.

  // Hydrate synchronously on the first render. Persisting from an effect that
  // fires after an empty first render is not safe: with StrictMode's
  // double-mount the "write the initial empty state" pass can land after
  // hydration and erase stored data. There is no empty first render here.
  const [bootstrap] = useState(() => loadData())
  const [threads, setThreads] = useState<Thread[]>(bootstrap.threads)
  const [messages, setMessages] = useState<MessagesByThread>(bootstrap.messages)
  const [projects, setProjects] = useState<Project[]>(bootstrap.projects)
  const [currentThreadId, setCurrentThreadId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [darkMode, setDarkMode] = useState(() => 
    typeof localStorage !== 'undefined' && localStorage.getItem('gistory_dark') === 'true'
  )
  const [sort, setSort] = useState<SortState>(() => 
    parseSort(typeof localStorage !== 'undefined' ? localStorage.getItem('gistory_sort') : null)
  )
  const [route, setRoute] = useState(parseRoute(typeof window !== 'undefined' ? window.location.hash : ''))
  const [showBurger, setShowBurger] = useState(false)
  
  // Sync state
  const [syncEnabled, setSyncEnabled] = useState(() => 
    typeof localStorage !== 'undefined' && localStorage.getItem('gistory_sync_key') != null
  )
  const [syncKey, setSyncKey] = useState<string | null>(() => 
    typeof localStorage !== 'undefined' ? localStorage.getItem('gistory_sync_key') : null
  )
  const [chainId, setChainId] = useState<string | null>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('gistory_chain_id') : null
  )
  const [devices, setDevices] = useState<RemoteDevice[]>([])
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncReady, setSyncReady] = useState(false)
  const [deleted, setDeleted] = useState<DeletedRegistry>(loadDeleted)
  // Synced arrangement: manual drag order + collapsed flags. Part of the sync
  // payload, so it is saved, pushed, and merged like the rest of the data.
  const [view, setView] = useState<ViewState>(loadView)
  // Synced preferences (currently the stamp time zone). A singleton that rides
  // the payload and merges LWW, so changing it on one device updates all eight.
  const [settings, setSettings] = useState<SyncSettings>(loadSettings)
  const [deviceName, setDeviceName] = useState(() => 
    typeof localStorage !== 'undefined' ? localStorage.getItem('gistory_device_name') || '' : ''
  )
  // Cmd+K palette + the one-time first-run tour. Both are pure UI overlays;
  // the tour flag lives in localStorage so it shows exactly once per browser.
  const [showPalette, setShowPalette] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(
    () => typeof localStorage !== 'undefined' && !localStorage.getItem('gistory_onboarded'),
  )

  // Refs mirror state so async sync code always reads the freshest snapshot.
  const syncAgentRef = React.useRef<SyncAgent | null>(null)
  const threadsRef = React.useRef<Thread[]>(bootstrap.threads)
  const messagesRef = React.useRef<MessagesByThread>(bootstrap.messages)
  const projectsRef = React.useRef<Project[]>(bootstrap.projects)
  const deletedRef = React.useRef<DeletedRegistry>(deleted)
  const viewRef = React.useRef<ViewState>(view)
  const syncBusyRef = React.useRef(false)
  // The push scheduler lives in a ref, not state: it owns a timer that must
  // survive re-renders, and a value in state would be rebuilt every render.
  const qosRef = React.useRef<SyncQos | null>(null)

  useEffect(() => { threadsRef.current = threads }, [threads])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { projectsRef.current = projects }, [projects])
  useEffect(() => { deletedRef.current = deleted }, [deleted])
  useEffect(() => { saveDeleted(deleted) }, [deleted])
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { saveView(view) }, [view])
  const settingsRef = React.useRef<SyncSettings>(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { saveSettings(settings) }, [settings])

  // --- Sync helpers ---------------------------------------------------------

  const snapshot = useCallback((): SyncData => ({
    threads: threadsRef.current,
    messages: messagesRef.current,
    projects: projectsRef.current,
    deleted: deletedRef.current,
    view: viewRef.current,
    settings: settingsRef.current,
  }), [])

  const applyMerged = useCallback((data: SyncData) => {
    // A thread deleted on another device leaves its arrangement entry behind
    // here, so drop entries for items that no longer survive the merge —
    // otherwise the synced view map grows forever. `section:*` keys are kept.
    const alive = new Set<string>([
      ...data.threads.map(t => t.id),
      ...data.projects.map(p => p.id),
      ...Object.values(data.messages).flat().map(m => m.id),
    ])
    const pruned = pruneView(data.view, alive)
    threadsRef.current = data.threads
    messagesRef.current = data.messages
    projectsRef.current = data.projects
    deletedRef.current = data.deleted
    viewRef.current = pruned
    // Settings merge LWW like items: another device's newer preference applies
    // here verbatim, our newer one is already in data.settings after the merge.
    settingsRef.current = data.settings ?? settingsRef.current
    setThreads(data.threads)
    setMessages(data.messages)
    setProjects(data.projects)
    setDeleted(data.deleted)
    setView(pruned)
    setSettings(settingsRef.current)
  }, [])

  /**
   * Push the current snapshot. Throws on failure so the QoS scheduler can
   * decide whether to retry; callers that want a quiet failure use
   * `pushSnapshotQuiet`.
   */
  const pushSnapshot = useCallback(
    async (agent: SyncAgent) => {
      await agent.push(snapshot())
      setLastSync(Date.now())
      setSyncError(null)
      setSyncStatus('idle')
    },
    [snapshot],
  )

  const pushSnapshotQuiet = useCallback(
    async (agent: SyncAgent) => {
      try {
        await pushSnapshot(agent)
        // The push succeeded, so the server is reachable again: drop any
        // backoff we accumulated from earlier failures.
        qosRef.current?.reset()
      } catch (err) {
        // Hand the server's `Retry-After` to the scheduler so its next retry
        // waits exactly as long as the server asked, instead of guessing.
        if (err instanceof SyncError) qosRef.current?.setRetryAfter(err.retryAfterMs)
        setSyncError(errorMessage(err))
        setSyncStatus('error')
        throw err
      }
    },
    [pushSnapshot],
  )

  /**
   * Get the push scheduler, creating it on first use.
   *
   * Deliberately lazy rather than built during render. Creating it in the render
   * body made it a race: `handleEnableSync` calls `setSyncEnabled(true)` and then
   * `syncNow()` in the same task, so whether the scheduler existed by the time
   * `syncNow` reached it depended on whether React had re-rendered in between.
   * When it lost, `flush()` was a no-op and the *first* push after enabling sync
   * was silently dropped — the one carrying the user's existing library to a
   * brand new chain.
   *
   * Creating it on demand also keeps it out of render, which StrictMode
   * double-invokes and where an object allocated in the render body is easy to
   * leak.
   */
  const ensureQos = useCallback((): SyncQos => {
    if (!qosRef.current) {
      qosRef.current = new SyncQos({
        onPush: async () => {
          const agent = syncAgentRef.current
          if (!agent) return
          await pushSnapshotQuiet(agent)
        },
      })
    }
    return qosRef.current
  }, [pushSnapshotQuiet])

  // Pull remote changes, merge them, then push the merged snapshot.
  const syncNow = useCallback(async (opts: { push?: boolean } = {}) => {
    const agent = syncAgentRef.current
    if (!agent || syncBusyRef.current) return
    syncBusyRef.current = true
    setSyncStatus('syncing')
    try {
      const myDeviceId = agent.getDeviceId()
      const { blobs, failures } = await agent.pull()

      if (blobs.length > 0) {
        let data = snapshot()
        for (const blob of blobs) {
          data = mergePayload(data, blob as SyncPayload, myDeviceId)
        }
        applyMerged(data)
      }

      if (opts.push !== false) {
        // Route the push through the scheduler rather than calling the agent
        // directly: this path can fire while a debounced push is in flight
        // (the periodic refresh, or a manual sync right after an edit), and two
        // concurrent pushes would ship two nearly identical snapshots.
        // `flush()` pushes the merged state immediately, ignoring the debounce.
        //
        // `ensureQos()` rather than `qosRef.current?.` — see its comment. An
        // optional chain here would silently skip the push whenever the
        // scheduler did not exist yet, which is exactly the first sync.
        ensureQos().flush()
      }

      const status = await agent.status()
      if (status) setDevices(status.devices || [])

      setLastSync(Date.now())
      // An undecryptable blob is most often a wrong passphrase, but it is also what a
// poisoned chain looks like: anyone who knows the chainId (it travels in the
// pairing QR) can append a blob encrypted with a different key, and the client
// deliberately parks its watermark below it. Say both, so the user is not sent
// round in circles retyping a passphrase that is already correct.
setSyncError(
        failures > 0
          ? `${failures} change(s) could not be decrypted — wrong passphrase, or this chain was tampered with. Sync stays paused until they can be read.`
          : null,
      )
      setSyncStatus(failures > 0 ? 'error' : 'idle')
    } catch (err) {
      setSyncError(errorMessage(err))
      setSyncStatus('error')
    } finally {
      syncBusyRef.current = false
    }
  }, [snapshot, applyMerged, ensureQos])

  const ensureAgent = useCallback(
    async (
      passphrase: string,
      chain: string,
      writeSecret?: string,
    ): Promise<SyncAgent> => {
      const agent = new SyncAgent({
        baseUrl: SYNC_BASE,
        passphrase,
        deviceName: suggestDeviceName(),
        chainId: chain,
        writeSecret,
      })
      await agent.init()
      await agent.handshake()
      syncAgentRef.current = agent
      setDeviceName(agent.getDeviceName())
      return agent
    },
    [],
  )

  const handleEnableSync = async (passphrase: string) => {
    const chain = newChainId()
    localStorage.setItem('gistory_sync_key', passphrase)
    localStorage.setItem('gistory_chain_id', chain)
    // This device creates the chain, so it also mints the write secret that lets
    // it (and every device it later pairs) write to it.
    const writeSecret = newWriteSecret()
    localStorage.setItem('gistory_write_secret', writeSecret)
    setSyncKey(passphrase)
    setChainId(chain)

    await ensureAgent(passphrase, chain, writeSecret)
    setSyncEnabled(true)
    setSyncReady(true)
    // Seeds the chain with this device's local data and registers the device.
    await syncNow()
  }

  const handleJoinSync = async (passphrase: string, token: string) => {
    const parsed = chainIdFromToken(token)
    if (!parsed) throw new Error('That pairing code is not valid')
    const chain = parsed.chainId

    localStorage.setItem('gistory_sync_key', passphrase)
    localStorage.setItem('gistory_chain_id', chain)
    if (parsed.writeSecret) localStorage.setItem('gistory_write_secret', parsed.writeSecret)
    setSyncKey(passphrase)
    setChainId(chain)

    // A token with no write secret is an older pairing code: that device can
    // read the chain but cannot write to it, and the sync panel will say so.
    await ensureAgent(passphrase, chain, parsed.writeSecret)
    setSyncEnabled(true)
    setSyncReady(true)
    // Pulls the chain's data first, merges, then pushes our local additions.
    await syncNow()
  }

  const handleDisableSync = async () => {
    syncAgentRef.current = null
    localStorage.removeItem('gistory_sync_key')
    localStorage.removeItem('gistory_chain_id')
    localStorage.removeItem('gistory_write_secret')
    setSyncKey(null)
    setChainId(null)
    setSyncEnabled(false)
    setSyncReady(false)
    setDevices([])
    setLastSync(null)
    setSyncStatus('idle')
    setSyncError(null)
  }

  // Rename this device and let the chain learn it. The name is persisted
  // locally first so it survives even when the rename push can't go through.
  const handleRenameDevice = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const agent = syncAgentRef.current
    setDeviceName(trimmed)
    if (!agent) return
    agent.setDeviceName(trimmed)
    try {
      await agent.handshake()
      await pushSnapshot(agent)
    } catch {
      /* Offline: the new name is stored locally and syncs on the next push. */
    }
  }, [pushSnapshot])

  const handleGenerateToken = async (): Promise<string> => {
    const chain = chainId || localStorage.getItem('gistory_chain_id')
    if (!chain) throw new Error('Enable sync first to pair a device')
    // The token carries the write secret so the new device can write, not just
    // read. Without it the paired device could only ever pull.
    const secret = localStorage.getItem('gistory_write_secret')
    if (!secret) {
      // Chain predates write auth. Mint one, claim it, and hand it over.
      const fresh = newWriteSecret()
      localStorage.setItem('gistory_write_secret', fresh)
      try {
        await syncAgentRef.current?.claim()
      } catch {
        /* Offline: the claim retries the next time this device syncs. */
      }
      return pairingTokenFromChain(chain, fresh)
    }
    return pairingTokenFromChain(chain, secret)
  }

  // Restore the agent on load when sync was previously enabled.
  useEffect(() => {
    const key = localStorage.getItem('gistory_sync_key')
    const chain = localStorage.getItem('gistory_chain_id')
    if (!key || !chain) return
    // Chains set up before write auth have no secret stored; they still sync,
    // and the owner can secure one from Settings. The secret MUST be handed to
    // the agent here: it lives only in config, the agent never reads storage
    // itself, and a restore that drops it would pass handshake but get 401 on
    // every push (reads work, writes falsely demand re-pairing).
    const writeSecret = localStorage.getItem('gistory_write_secret') ?? undefined

    let cancelled = false
    ;(async () => {
      try {
        await ensureAgent(key, chain, writeSecret)
        if (cancelled) {
          syncAgentRef.current = null
          return
        }
        setSyncReady(true)
        await syncNow()
      } catch (err) {
        if (!cancelled) {
          setSyncError(errorMessage(err))
          setSyncStatus('error')
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One scheduler for the app's lifetime, created on demand by `ensureQos`
  // and stopped when sync is turned off, so a disabled chain stops generating
  // traffic entirely.

  // Debounced + coalesced push whenever local data changes.
  //
  // `schedule()` restarts the debounce on every change and collapses a burst
  // into one push; if a change lands while a push is in flight it remembers
  // only that a push is still owed, and pushes the newest state once that one
  // settles. On failure it retries with backoff rather than dropping the
  // change, which is the invariant that matters most here.
  useEffect(() => {
    if (!syncEnabled || !syncReady) return
    ensureQos().schedule()
  }, [threads, messages, projects, deleted, view, settings, syncEnabled, syncReady, ensureQos])

  // Stop the scheduler when sync is disabled so no timer outlives the setting.
  useEffect(() => {
    if (syncEnabled) return
    qosRef.current?.stop()
    qosRef.current = null
  }, [syncEnabled])

  // Periodic + focus-driven pull so other devices' edits show up.
  useEffect(() => {
    if (!syncEnabled || !syncReady) return
    const interval = window.setInterval(() => { void syncNow({ push: false }) }, 60000)
    const onWake = () => {
      if (document.visibilityState === 'visible') void syncNow({ push: false })
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [syncEnabled, syncReady, syncNow])

  // --- Tombstones -----------------------------------------------------------

  // Merge an imported export file into live state. The persistence effects
  // below write it out, so no page reload is needed to see the result.
  const handleImportData = useCallback((data: Parameters<typeof importData>[0]) => {
    const merged = importData(data, deletedRef.current)
    threadsRef.current = merged.threads
    messagesRef.current = merged.messages
    projectsRef.current = merged.projects
    viewRef.current = merged.view
    settingsRef.current = merged.settings
    setThreads(merged.threads)
    setMessages(merged.messages)
    setProjects(merged.projects)
    setView(merged.view)
    setSettings(merged.settings)
  }, [])

  /** Set the syncable stamp time zone. Bumping updatedAt is what makes the
   *  preference propagate: after a merge, the settings object with the newest
   *  clock wins on every device, same as any item. */
  const setTimeZone = useCallback((tz: string) => {
    setSettings(prev => ({ ...prev, timeZone: tz || undefined, updatedAt: Date.now() }))
  }, [])

  // --- Arrangement (drag order + collapse) ----------------------------------

  const isCollapsed = useCallback((key: string) => !!viewRef.current[key]?.collapsed, [])

  const toggleCollapse = useCallback((key: string) => {
    setView(prev => {
      const next: ViewState = {
        ...prev,
        [key]: { ...prev[key], collapsed: !prev[key]?.collapsed, updatedAt: Date.now() },
      }
      viewRef.current = next
      return next
    })
  }, [])

  /**
   * `ids` is the order the user currently sees. The moved item takes the rank
   * between its new neighbours, so a drag normally rewrites exactly one entry
   * instead of renumbering the whole list — which keeps two devices reordering
   * different rows from overwriting each other.
   *
   * When a search filter is active the visible ids are only a subset, so the
   * move is spliced into the unfiltered order and the whole list is renumbered;
   * ranking the subset alone would collide with the hidden rows.
   */
  const reorder = useCallback((ids: string[], from: number, to: number, allIds?: string[]) => {
    if (from === to || from < 0 || to < 0 || to >= ids.length) return
    setView(prev => {
      const now = Date.now()
      const filtered = !!allIds && allIds.length !== ids.length
      const ordered = filtered
        ? moveWithinSubset(allIds as string[], ids, from, to)
        : moveItem(ids, from, to)
      const next = filtered
        ? applyFullOrder(prev, ordered, now)
        : applyOrder(prev, ordered, to, now)
      viewRef.current = next
      return next
    })
  }, [])

  /** Drop arrangement for items that no longer exist. */
  const forgetView = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setView(prev => {
      const next: ViewState = { ...prev }
      let changed = false
      // Match the bare id *and* any namespaced key for it (`message:<id>`),
      // otherwise deleting a message leaves its collapsed/rank entry behind.
      for (const key of Object.keys(next)) {
        if (ids.includes(viewKeyItem(key) ?? '')) {
          delete next[key]
          changed = true
        }
      }
      if (!changed) return prev
      viewRef.current = next
      return next
    })
  }, [])

  const tombstone = useCallback((kind: keyof DeletedRegistry, ids: string[]) => {
    if (ids.length === 0) return
    const now = Date.now()
    setDeleted(prev => {
      const next: DeletedRegistry = { ...prev, [kind]: { ...prev[kind] } }
      for (const id of ids) next[kind][id] = now
      deletedRef.current = next
      return next
    })
  }, [])

  // Dark mode
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('gistory_dark', String(darkMode))
  }, [darkMode])

  // The tour is for first runs. A browser that already has threads has already
  // onboarded, even if it predates the tour — bake the flag so the condition
  // stays honest, and gate the render on an empty board as well (effects run
  // after first paint, so state alone would flash the modal for them).
  useEffect(() => {
    if (bootstrap.threads.length > 0) localStorage.setItem('gistory_onboarded', '1')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The tour owns the first-run moment. Ctrl+K under it would let the palette
  // navigate away while the modal stays stranded underneath (both overlays
  // share one z-index and the palette sits later in the DOM, so it paints on
  // top). The mirror ref keeps the key handler dependency-free.
  const tourOpenRef = React.useRef(false)
  tourOpenRef.current = showOnboarding && threads.length === 0

  // Cmd/Ctrl+K toggles the command palette from anywhere (never under the tour).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (!tourOpenRef.current) setShowPalette(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const finishOnboarding = useCallback(() => {
    localStorage.setItem('gistory_onboarded', '1')
    setShowOnboarding(false)
  }, [])

  // Router
  useEffect(() => {
    initRouter()
    const unsub = onRouteChange(setRoute)
    return () => unsub()
  }, [])

  // Auto-select first thread (only when no route and no selection)
  useEffect(() => {
    if (!currentThreadId && threads.length > 0 && !route.params.threadId) {
      setCurrentThreadId(threads[0].id)
    }
  }, [threads, currentThreadId, route.params.threadId])

  // Sync currentThreadId from route. Deliberately does NOT list
  // `currentThreadId` in its deps: this effect must react to route changes
  // only, or it would fight the in-app thread selection every time a thread
  // is opened from the board.
  useEffect(() => {
    if (route.params.threadId && route.params.threadId !== currentThreadId) {
      setCurrentThreadId(route.params.threadId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params.threadId])

  // Persist. Safe to run unconditionally because state is hydrated from storage
  // before the first render, so this can never write a placeholder empty value.
  useEffect(() => {
    saveThreads(threads)
  }, [threads])
  useEffect(() => {
    saveMessages(messages)
  }, [messages])
  useEffect(() => {
    saveProjects(projects)
  }, [projects])
  useEffect(() => {
    localStorage.setItem('gistory_sort', toSortParam(sort))
  }, [sort])

  // Actions
  const createThread = useCallback((name: string, projectIds: string[] = []) => {
    const thread: Thread = { id: generateId('t'), name, projectIds, createdAt: Date.now() }
    setThreads(prev => [thread, ...prev])
    setMessages(prev => ({ ...prev, [thread.id]: [] }))
    setCurrentThreadId(thread.id)
    // Open the thread you just made. Setting the id alone did nothing visible:
    // the route is what decides between the board and a thread, so on a first
    // run (or from the board) you stayed on the list with an empty new row and
    // had to click into it yourself.
    navigate('/' + thread.id)
  }, [])

  const addThreadToProject = useCallback((threadId: string, projectId: string) => {
    setThreads(prev => prev.map(t => 
      t.id === threadId ? { ...t, projectIds: [...t.projectIds, projectId], updatedAt: Date.now() } : t
    ))
  }, [])

  const removeThreadFromProject = useCallback((threadId: string, projectId: string) => {
    setThreads(prev => prev.map(t => 
      t.id === threadId ? { ...t, projectIds: t.projectIds.filter(id => id !== projectId), updatedAt: Date.now() } : t
    ))
  }, [])

  const renameThread = useCallback((id: string, name: string) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, name, updatedAt: Date.now() } : t))
  }, [])

  /**
   * Patch a thread's metadata (tags, status, rating). Metadata is content, so
   * this bumps updatedAt: the merged item with the newest metadata wins,
   * exactly like a rename. Copy counting deliberately does NOT go through
   * here (see bumpThreadUsage — a copy is not an edit).
   */
  const patchThreadMetadata = useCallback((id: string, patch: Partial<PromptMetadata>) => {
    setThreads(prev => prev.map(t =>
      t.id === id ? { ...t, metadata: { ...t.metadata, ...patch }, updatedAt: Date.now() } : t
    ))
  }, [])

  /** Replace a thread's tag list: trimmed, deduped case-insensitively. */
  const setThreadTags = useCallback((id: string, tags: string[]) => {
    const seen = new Set<string>()
    const clean = tags
      .map(t => t.trim())
      .filter(t => {
        if (!t) return false
        const k = t.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    patchThreadMetadata(id, { tags: clean })
  }, [patchThreadMetadata])

  const setThreadStatus = useCallback((id: string, status: ThreadStatus) => {
    patchThreadMetadata(id, { status })
  }, [patchThreadMetadata])

  const setThreadRating = useCallback((id: string, rating: number | undefined) => {
    patchThreadMetadata(id, { rating })
  }, [patchThreadMetadata])

  /**
   * Copying a prompt counts as using it. Deliberately does NOT bump updatedAt:
   * a copy is not an edit, and bumping it would shuffle every "Recently
   * updated" list on every copy, and make two devices that copied the same
   * prompt fight the whole-item LWW merge over a counter that only needs to be
   * approximately right. Losing one device's increment to the merge is fine.
   */
  const bumpThreadUsage = useCallback((id: string) => {
    setThreads(prev => prev.map(t =>
      t.id === id
        ? { ...t, metadata: { ...t.metadata, usageCount: (t.metadata?.usageCount ?? 0) + 1 } }
        : t
    ))
  }, [])

  /**
   * Fork a thread: a full copy (thread + messages) marked as a child via
   * `metadata.parentId`, with `version` bumped. The fork gets fresh ids so it
   * syncs as its own item; its messages drop pins/collapse state — a fork is a
   * copy of the words, not of the arrangement.
   */
  const forkThread = useCallback((id: string) => {
    const source = threadsRef.current.find(t => t.id === id)
    if (!source) return
    const now = Date.now()
    const fork: Thread = {
      id: generateId('t'),
      name: `${source.name} (fork)`,
      projectIds: [...source.projectIds],
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...source.metadata,
        parentId: source.id,
        version: (source.metadata?.version ?? 1) + 1,
      },
    }
    const copied: Message[] = (messagesRef.current[id] || []).map(m => ({
      id: generateId('m'),
      threadId: fork.id,
      content: m.content,
      createdAt: now,
    }))
    setThreads(prev => [fork, ...prev])
    setMessages(prev => ({ ...prev, [fork.id]: copied }))
    setCurrentThreadId(fork.id)
    // Open the fork you just made, like createThread does.
    navigate('/' + fork.id)
  }, [])

  // Toggling a pin bumps updatedAt so the flag wins the last-write-wins merge
  // (the merge replaces whole items and compares updatedAt ?? createdAt).
  // Same shape for threads, messages, and projects — only the collection and
  // the item type differ.
  const togglePinThread = useCallback((id: string) => {
    const now = Date.now()
    setThreads(prev => prev.map(t => {
      if (t.id !== id) return t
      const pinned = !t.pinned
      const next: Thread = { ...t, pinned, updatedAt: now }
      if (pinned) next.pinnedAt = now
      else delete next.pinnedAt
      return next
    }))
  }, [])

  const togglePinMessage = useCallback((msgId: string) => {
    const now = Date.now()
    setMessages(prev => {
      const next: MessagesByThread = {}
      for (const [threadId, list] of Object.entries(prev)) {
        next[threadId] = list.map(m => {
          if (m.id !== msgId) return m
          const pinned = !m.pinned
          const updated: Message = { ...m, pinned, updatedAt: now }
          if (pinned) updated.pinnedAt = now
          else delete updated.pinnedAt
          return updated
        })
      }
      return next
    })
  }, [])

  const togglePinProject = useCallback((id: string) => {
    const now = Date.now()
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p
      const pinned = !p.pinned
      const next: Project = { ...p, pinned, updatedAt: now }
      if (pinned) next.pinnedAt = now
      else delete next.pinnedAt
      return next
    }))
  }, [])

  /** Clear every pin in one go — threads and projects together. The control's
   *  count is an aggregate ("3 pinned"), so the action must clear the whole
   *  count or the label lies. Each item is bumped with a shared timestamp
   *  exactly like its individual toggle, so the same LWW merge clears the pin
   *  on every device. Pinning stays per-item afterwards. */
  const unpinAll = useCallback(() => {
    const now = Date.now()
    const clear = <T extends { pinned?: boolean; pinnedAt?: number }>(item: T): T => {
      if (!item.pinned) return item
      const next = { ...item, pinned: false, updatedAt: now }
      delete next.pinnedAt
      return next
    }
    setThreads(prev => prev.map(clear))
    setProjects(prev => prev.map(clear))
  }, [])

  const deleteThread = useCallback((id: string) => {
    const messageIds = (messagesRef.current[id] || []).map(m => m.id)
    tombstone('threads', [id])
    tombstone('messages', messageIds)
    forgetView([id, ...messageIds])
    setThreads(prev => prev.filter(t => t.id !== id))
    setMessages(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (currentThreadId === id) {
      setCurrentThreadId(threads.find(t => t.id !== id)?.id || '')
    }
  }, [currentThreadId, threads, tombstone, forgetView])

  const addMessage = useCallback((threadId: string, content: string) => {
    const msg: Message = { id: generateId('m'), threadId, content, createdAt: Date.now() }
    setMessages(prev => ({
      ...prev,
      [threadId]: [...(prev[threadId] || []), msg]
    }))
  }, [])

  const updateMessage = useCallback((msgId: string, content: string) => {
    setMessages(prev => ({
      ...prev,
      [currentThreadId]: prev[currentThreadId]?.map(m =>
        m.id === msgId ? { ...m, content, updatedAt: Date.now() } : m
      ) || []
    }))
  }, [currentThreadId])

  const deleteMessage = useCallback((msgId: string) => {
    tombstone('messages', [msgId])
    forgetView([msgId])
    setMessages(prev => ({
      ...prev,
      [currentThreadId]: prev[currentThreadId]?.filter(m => m.id !== msgId) || []
    }))
  }, [currentThreadId, tombstone, forgetView])

  const createProject = useCallback((name: string) => {
    const project: Project = { id: generateId('p'), name, createdAt: Date.now() }
    setProjects(prev => [...prev, project])
  }, [])

  const renameProject = useCallback((id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name, updatedAt: Date.now() } : p))
  }, [])

  const deleteProject = useCallback((id: string) => {
    tombstone('projects', [id])
    forgetView([id])
    setProjects(prev => prev.filter(p => p.id !== id))
    setThreads(prev => prev.map(t => ({
      ...t,
      projectIds: t.projectIds.filter(pid => pid !== id),
      updatedAt: t.projectIds.includes(id) ? Date.now() : t.updatedAt
    })))
  }, [tombstone, forgetView])

  const currentThread = threads.find(t => t.id === currentThreadId)
  // Archived threads keep their project membership but leave the working
  // boards; they live in the home board's Archived section until restored.
  const getThreadsInProject = (pid: string) =>
    threads.filter(t => t.projectIds.includes(pid) && t.metadata?.status !== 'archived')

  const renderPage = () => {
    const path = route.path
    
    if (path === '/projects') {
      return (
        <ProjectsBoard 
          projects={projects} 
          threads={threads}
          onProjectClick={id => navigate(`/project/${id}`)}
          onCreate={createProject}
          onTogglePin={togglePinProject}
        />
      )
    }
    
    if (path.startsWith('/project/')) {
      return (
        <ProjectDetail
          project={projects.find(p => p.id === route.params.id)}
          threads={getThreadsInProject(route.params.id)}
          messages={messages}
          sort={sort}
          onSortChange={setSort}
          onSelect={id => { setCurrentThreadId(id); navigate('/') }}
          onDeleteProject={deleteProject}
          onRenameProject={renameProject}
          onTogglePin={togglePinThread}
        />
      )
    }
    
    if (path === '/settings') {
      return (
        <SettingsPage
          syncEnabled={syncEnabled}
          syncKey={syncKey}
          chainId={chainId}
          devices={devices}
          myDeviceId={syncAgentRef.current?.getDeviceId() || null}
          myDeviceName={deviceName}
          onRenameDevice={handleRenameDevice}
          lastSync={lastSync}
          syncStatus={syncStatus}
          syncError={syncError}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(d => !d)}
          onEnableSync={handleEnableSync}
          onJoinSync={handleJoinSync}
          onDisableSync={handleDisableSync}
          onGenerateToken={handleGenerateToken}
          onRefresh={() => syncNow()}
          onImportData={handleImportData}
          timeZone={settings.timeZone || ''}
          onSetTimeZone={setTimeZone}
        />
      )
    }
    
    // Home page - threads list + projects
    if (path === '/') {
      return (
        <HomeBoard
          threads={threads}
          projects={projects}
          searchQuery={searchQuery}
          sort={sort}
          onSortChange={setSort}
          onSelectThread={id => { setCurrentThreadId(id); navigate('/' + id) }}
          onProjectClick={id => navigate(`/project/${id}`)}
          onCreateThread={createThread}
          onCreateProject={createProject}
          onRenameThread={renameThread}
          onDeleteThread={deleteThread}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onTogglePin={togglePinThread}
          onTogglePinProject={togglePinProject}
          onUnpinAll={unpinAll}
          onFork={forkThread}
          onTagClick={tag => setSearchQuery(tag)}
          onSetStatus={setThreadStatus}
          timeZone={settings.timeZone}
        />
      )
    }
    
    // Recently-deleted log
    if (path === '/trash') {
      return <TrashPage deleted={deleted} onBack={() => navigate('/')} />
    }

    // Thread view page
    if (currentThreadId && currentThread) {
      return (
        <ThreadView
          thread={currentThread}
          messages={messages[currentThreadId] || []}
          searchQuery={searchQuery}
          projects={projects}
          sort={sort}
          onSortChange={setSort}
          onAddMessage={content => addMessage(currentThreadId, content)}
          onUpdateMessage={updateMessage}
          onDeleteMessage={deleteMessage}
          onRenameThread={renameThread}
          onDeleteThread={deleteThread}
          onAddToProject={addThreadToProject}
          onRemoveFromProject={removeThreadFromProject}
          onTogglePin={togglePinThread}
          onTogglePinMessage={togglePinMessage}
          onSetTags={setThreadTags}
          onFork={forkThread}
          onUseThread={bumpThreadUsage}
          onSetStatus={setThreadStatus}
          onSetRating={setThreadRating}
          timeZone={settings.timeZone}
        />
      )
    }
    
    // No threads at all - show welcome
    return (
      threads.length === 0 ? (
        <EmptyState onCreate={createThread} />
      ) : (
        <HomeBoard
          threads={threads}
          projects={projects}
          searchQuery={searchQuery}
          sort={sort}
          onSortChange={setSort}
          onSelectThread={setCurrentThreadId}
          onProjectClick={id => navigate(`/project/${id}`)}
          onCreateThread={createThread}
          onCreateProject={createProject}
          onRenameThread={renameThread}
          onDeleteThread={deleteThread}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onTogglePin={togglePinThread}
          onTogglePinProject={togglePinProject}
          onUnpinAll={unpinAll}
          onFork={forkThread}
          onTagClick={tag => setSearchQuery(tag)}
          onSetStatus={setThreadStatus}
          timeZone={settings.timeZone}
        />
      )
    )
  }

  const showBurgerBtn = true

  const viewApi = useMemo<ViewStateApi>(
    () => ({ view, isCollapsed, toggleCollapse, reorder }),
    [view, isCollapsed, toggleCollapse, reorder],
  )

  return (
    <ViewStateProvider value={viewApi}>
      <div className="app">
      {showBurger && <BurgerMenu 
        threads={threads} 
        projects={projects} 
        currentThreadId={currentThreadId} 
        sort={sort}
        onSortChange={setSort}
        onSelect={id => { setCurrentThreadId(id); navigate('/' + id); setShowBurger(false) }} 
        onClose={() => setShowBurger(false)} 
        createThread={createThread} 
        createProject={createProject} 
        onSettings={() => { navigate('/settings'); setShowBurger(false) }}
        onTrash={() => { navigate('/trash'); setShowBurger(false) }}
        onHome={() => { navigate('/'); setShowBurger(false) }}
        onRenameThread={renameThread}
        onDeleteThread={deleteThread}
        onAddToProject={addThreadToProject}
        onRemoveFromProject={removeThreadFromProject}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
        onTogglePin={togglePinThread}
        onTogglePinProject={togglePinProject}
      />}
      <Layout
        title="Gistory"
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onProjectsClick={() => navigate('/projects')}
        // The logo leaves the app for the lander home page — a real path
        // navigation. pushState cannot be used here: the app's hash branch
        // only re-evaluates on hashchange, so a client-side path change
        // would leave the app mounted at "/" with a stale board.
        onHomeClick={() => window.location.assign('/')}
        onMenuClick={showBurgerBtn ? () => setShowBurger(v => !v) : undefined}
        sync={{ enabled: syncEnabled, status: syncStatus, lastSync }}
        onSyncClick={() => navigate('/settings')}
      >
        {renderPage()}
      </Layout>
      {showOnboarding && threads.length === 0 && (
        <Onboarding
          hasThreads={threads.length > 0}
          onCreateFirst={name => { finishOnboarding(); createThread(name) }}
          onOpenSettings={() => { finishOnboarding(); navigate('/settings') }}
          onClose={finishOnboarding}
        />
      )}
      {!tourOpenRef.current && (
        <CommandPalette
          open={showPalette}
          onClose={() => setShowPalette(false)}
          threads={threads}
          projects={projects}
          onSelectThread={id => { setCurrentThreadId(id); navigate('/' + id) }}
          onOpenProject={id => navigate(`/project/${id}`)}
          onCreateThread={createThread}
          onCreateProject={createProject}
          onOpenProjects={() => navigate('/projects')}
          onOpenSettings={() => navigate('/settings')}
          onOpenTrash={() => navigate('/trash')}
        />
      )}
      </div>
    </ViewStateProvider>
  )
}

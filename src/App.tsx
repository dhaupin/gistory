// Gistory App - Main Entry Point

import React, { useState, useEffect, useCallback } from 'react'
import { loadData, saveThreads, saveMessages, saveProjects, generateId, importData } from './lib/store'
import type { Thread, Project, Message, MessagesByThread } from './lib/models'
import { parseRoute, onRouteChange, initRouter, navigate } from './lib/router'
import {
  SyncAgent,
  newChainId,
  pairingTokenFromChain,
  chainIdFromToken,
  suggestDeviceName,
  type RemoteDevice,
} from './sync/agent'
import { emptyDeleted, mergePayload, normalizeDeleted, type DeletedRegistry, type SyncData, type SyncPayload } from './sync/merge'
import Layout from './components/Layout'
import Header from './components/Header'
import BurgerMenu from './components/BurgerMenu'
import ThreadView from './components/ThreadView'
import HomeBoard from './components/HomeBoard'
import ProjectsBoard from './components/ProjectsBoard'
import ProjectDetail from './components/ProjectDetail'
import SettingsPage from './components/Settings'
import EmptyState from './components/EmptyState'
import { parseSort, toSortParam, type SortState } from './ui/sort'

// Production runs same-origin (Cloudflare Pages Functions at /sync).
// Local dev can point at `wrangler pages dev` via VITE_SYNC_URL.
const SYNC_BASE = (import.meta.env.VITE_SYNC_URL as string | undefined) || ''

const DELETED_KEY = 'gistory_deleted'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function loadDeleted(): DeletedRegistry {
  try {
    return normalizeDeleted(JSON.parse(localStorage.getItem(DELETED_KEY) || 'null'))
  } catch {
    return emptyDeleted()
  }
}

function saveDeleted(registry: DeletedRegistry) {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(registry))
  } catch {
    /* storage full / unavailable — sync still works in-memory */
  }
}

export default function App() {
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
    localStorage.getItem('gistory_dark') === 'true'
  )
  const [sort, setSort] = useState<SortState>(() => 
    parseSort(localStorage.getItem('gistory_sort'))
  )
  const [route, setRoute] = useState(parseRoute(window.location.hash))
  const [showBurger, setShowBurger] = useState(false)
  
  // Sync state
  const [syncEnabled, setSyncEnabled] = useState(() => 
    localStorage.getItem('gistory_sync_key') != null
  )
  const [syncKey, setSyncKey] = useState<string | null>(() => 
    localStorage.getItem('gistory_sync_key')
  )
  const [chainId, setChainId] = useState<string | null>(() =>
    localStorage.getItem('gistory_chain_id')
  )
  const [devices, setDevices] = useState<RemoteDevice[]>([])
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncReady, setSyncReady] = useState(false)
  const [deleted, setDeleted] = useState<DeletedRegistry>(loadDeleted)

  // Refs mirror state so async sync code always reads the freshest snapshot.
  const syncAgentRef = React.useRef<SyncAgent | null>(null)
  const threadsRef = React.useRef<Thread[]>(bootstrap.threads)
  const messagesRef = React.useRef<MessagesByThread>(bootstrap.messages)
  const projectsRef = React.useRef<Project[]>(bootstrap.projects)
  const deletedRef = React.useRef<DeletedRegistry>(deleted)
  const syncBusyRef = React.useRef(false)

  useEffect(() => { threadsRef.current = threads }, [threads])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { projectsRef.current = projects }, [projects])
  useEffect(() => { deletedRef.current = deleted }, [deleted])
  useEffect(() => { saveDeleted(deleted) }, [deleted])

  // --- Sync helpers ---------------------------------------------------------

  const snapshot = useCallback((): SyncData => ({
    threads: threadsRef.current,
    messages: messagesRef.current,
    projects: projectsRef.current,
    deleted: deletedRef.current,
  }), [])

  const applyMerged = useCallback((data: SyncData) => {
    threadsRef.current = data.threads
    messagesRef.current = data.messages
    projectsRef.current = data.projects
    deletedRef.current = data.deleted
    setThreads(data.threads)
    setMessages(data.messages)
    setProjects(data.projects)
    setDeleted(data.deleted)
  }, [])

  const pushSnapshot = useCallback(async (agent: SyncAgent) => {
    try {
      await agent.push(snapshot())
      setLastSync(Date.now())
      setSyncError(null)
      setSyncStatus('idle')
    } catch (err) {
      setSyncError(errorMessage(err))
      setSyncStatus('error')
    }
  }, [snapshot])

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

      if (opts.push !== false) await agent.push(snapshot())

      const status = await agent.status()
      if (status) setDevices(status.devices || [])

      setLastSync(Date.now())
      setSyncError(failures > 0 ? `${failures} change(s) could not be decrypted — wrong passphrase?` : null)
      setSyncStatus(failures > 0 ? 'error' : 'idle')
    } catch (err) {
      setSyncError(errorMessage(err))
      setSyncStatus('error')
    } finally {
      syncBusyRef.current = false
    }
  }, [snapshot, applyMerged])

  const ensureAgent = useCallback(async (passphrase: string, chain: string): Promise<SyncAgent> => {
    const agent = new SyncAgent({
      baseUrl: SYNC_BASE,
      passphrase,
      deviceName: suggestDeviceName(),
      chainId: chain,
    })
    await agent.init()
    await agent.handshake()
    syncAgentRef.current = agent
    return agent
  }, [])

  const handleEnableSync = async (passphrase: string) => {
    const chain = newChainId()
    localStorage.setItem('gistory_sync_key', passphrase)
    localStorage.setItem('gistory_chain_id', chain)
    setSyncKey(passphrase)
    setChainId(chain)

    await ensureAgent(passphrase, chain)
    setSyncEnabled(true)
    setSyncReady(true)
    // Seeds the chain with this device's local data and registers the device.
    await syncNow()
  }

  const handleJoinSync = async (passphrase: string, token: string) => {
    const chain = chainIdFromToken(token)
    if (!chain) throw new Error('That pairing code is not valid')

    localStorage.setItem('gistory_sync_key', passphrase)
    localStorage.setItem('gistory_chain_id', chain)
    setSyncKey(passphrase)
    setChainId(chain)

    await ensureAgent(passphrase, chain)
    setSyncEnabled(true)
    setSyncReady(true)
    // Pulls the chain's data first, merges, then pushes our local additions.
    await syncNow()
  }

  const handleDisableSync = async () => {
    syncAgentRef.current = null
    localStorage.removeItem('gistory_sync_key')
    localStorage.removeItem('gistory_chain_id')
    setSyncKey(null)
    setChainId(null)
    setSyncEnabled(false)
    setSyncReady(false)
    setDevices([])
    setLastSync(null)
    setSyncStatus('idle')
    setSyncError(null)
  }

  const handleGenerateToken = async (): Promise<string> => {
    const chain = chainId || localStorage.getItem('gistory_chain_id')
    if (!chain) throw new Error('Enable sync first to pair a device')
    return pairingTokenFromChain(chain)
  }

  // Restore the agent on load when sync was previously enabled.
  useEffect(() => {
    const key = localStorage.getItem('gistory_sync_key')
    const chain = localStorage.getItem('gistory_chain_id')
    if (!key || !chain) return

    let cancelled = false
    ;(async () => {
      try {
        await ensureAgent(key, chain)
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

  // Debounced push whenever local data changes.
  useEffect(() => {
    if (!syncEnabled || !syncReady) return
    const agent = syncAgentRef.current
    if (!agent) return
    const timer = setTimeout(() => { void pushSnapshot(agent) }, 1500)
    return () => clearTimeout(timer)
  }, [threads, messages, projects, deleted, syncEnabled, syncReady, pushSnapshot])

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
    const merged = importData(data)
    threadsRef.current = merged.threads
    messagesRef.current = merged.messages
    projectsRef.current = merged.projects
    setThreads(merged.threads)
    setMessages(merged.messages)
    setProjects(merged.projects)
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

  // Sync currentThreadId from route
  useEffect(() => {
    if (route.params.threadId && route.params.threadId !== currentThreadId) {
      setCurrentThreadId(route.params.threadId)
    }
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

  const deleteThread = useCallback((id: string) => {
    const messageIds = (messagesRef.current[id] || []).map(m => m.id)
    tombstone('threads', [id])
    tombstone('messages', messageIds)
    setThreads(prev => prev.filter(t => t.id !== id))
    setMessages(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (currentThreadId === id) {
      setCurrentThreadId(threads.find(t => t.id !== id)?.id || '')
    }
  }, [currentThreadId, threads, tombstone])

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
        m.id === msgId ? { ...m, content } : m
      ) || []
    }))
  }, [currentThreadId])

  const deleteMessage = useCallback((msgId: string) => {
    tombstone('messages', [msgId])
    setMessages(prev => ({
      ...prev,
      [currentThreadId]: prev[currentThreadId]?.filter(m => m.id !== msgId) || []
    }))
  }, [currentThreadId, tombstone])

  const createProject = useCallback((name: string) => {
    const project: Project = { id: generateId('p'), name, createdAt: Date.now() }
    setProjects(prev => [...prev, project])
  }, [])

  const renameProject = useCallback((id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name, updatedAt: Date.now() } : p))
  }, [])

  const deleteProject = useCallback((id: string) => {
    tombstone('projects', [id])
    setProjects(prev => prev.filter(p => p.id !== id))
    setThreads(prev => prev.map(t => ({
      ...t,
      projectIds: t.projectIds.filter(pid => pid !== id),
      updatedAt: t.projectIds.includes(id) ? Date.now() : t.updatedAt
    })))
  }, [tombstone])

  const currentThread = threads.find(t => t.id === currentThreadId)
  const getThreadsInProject = (pid: string) => threads.filter(t => t.projectIds.includes(pid))

  const renderPage = () => {
    const path = route.path
    
    if (path === '/projects') {
      return (
        <ProjectsBoard 
          projects={projects} 
          threads={threads}
          onSelect={id => { setCurrentThreadId(id); navigate('/') }}
          onProjectClick={id => navigate(`/project/${id}`)}
          onCreate={createProject}
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
        />
      )
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
        />
      )
    )
  }

  const showBurgerBtn = true

  return (
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
        onRenameThread={renameThread}
        onDeleteThread={deleteThread}
        onAddToProject={addThreadToProject}
        onRemoveFromProject={removeThreadFromProject}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
      />}
      <Layout
        title="Gistory"
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onProjectsClick={() => navigate('/projects')}
        onMenuClick={showBurgerBtn ? () => setShowBurger(v => !v) : undefined}
      >
        {renderPage()}
      </Layout>
    </div>
  )
}

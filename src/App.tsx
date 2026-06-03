// Gistory App - Main Entry Point

import React, { useState, useEffect, useCallback } from 'react'
import { loadData, saveThreads, saveMessages, saveProjects, generateId } from './lib/store'
import type { Thread, Project, Message, MessagesByThread } from './lib/models'
import { parseRoute, onRouteChange, initRouter, navigate } from './lib/router'
import { SyncAgent, generatePairingToken } from './sync/agent'
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

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<MessagesByThread>({})
  const [projects, setProjects] = useState<Project[]>([])
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
  const [initialSync, setInitialSync] = useState(false)

  // Handler functions
  const syncAgentRef = React.useRef<SyncAgent | null>(null)
  
  const handleEnableSync = async (key: string) => {
    // Save key locally
    localStorage.setItem('gistory_sync_key', key)
    setSyncKey(key)
    
    // Initialize sync agent
    const agent = new SyncAgent({
      workerUrl: '/sync',  // CF Worker route
      syncKey: key,
      deviceName: 'My Device',
    })
    
    await agent.init()
    await agent.handshake()
    
    // Save agent reference
    syncAgentRef.current = agent
    setChainId(agent.getStatus().chainId || null)
    setSyncEnabled(true)
    setInitialSync(true)  // Flag to trigger initial push
  }
  
  // Handle initial sync push when data loads and sync enabled
  useEffect(() => {
    if (initialSync && syncAgentRef.current && threads.length > 0) {
      syncAgentRef.current.push({ threads, messages, projects })
        .then(() => setInitialSync(false))
        .catch(console.error)
    }
  }, [initialSync, threads.length])
  
  const handleDisableSync = async () => {
    syncAgentRef.current = null
    localStorage.removeItem('gistory_sync_key')
    localStorage.removeItem('gistory_chain_id')
    setSyncKey(null)
    setChainId(null)
    setSyncEnabled(false)
  }
  
  const handleGenerateToken = async () => {
    if (!syncAgentRef.current) {
      // Need to initialize first
      const key = syncKey || localStorage.getItem('gistory_sync_key')
      if (!key) throw new Error('Sync not enabled')
      
      const agent = new SyncAgent({
        workerUrl: '/sync',
        syncKey: key,
        deviceName: 'My Device',
      })
      await agent.init()
      await agent.handshake()
      syncAgentRef.current = agent
    }
    
    // Generate pairing token and wrap for QR
    const token = generatePairingToken()
    return `#join:${token}`
  }
  
  const handleRefresh = async () => {
    if (!syncAgentRef.current) return
    
    const changes = await syncAgentRef.current.pull()
    console.log('Got sync changes:', changes)
    
    const myDeviceId = syncAgentRef.current.getDeviceId()
    
    // Merge changes: last-write-wins based on timestamp + deviceId tie-breaker
    for (const change of changes) {
      const c = change as any
      const senderDeviceId = c.senderDeviceId
      
      if (c.threads) {
        setThreads(prev => {
          const merged = [...prev]
          for (const t of c.threads) {
            const idx = merged.findIndex(x => x.id === t.id)
            if (idx >= 0) {
              // Keep newer version, or use deviceId as tie-breaker
              if (t.updatedAt > merged[idx].updatedAt || 
                  (t.updatedAt === merged[idx].updatedAt && senderDeviceId > myDeviceId)) {
                merged[idx] = t
              }
            } else {
              merged.push(t)
            }
          }
          return merged
        })
      }
      if (c.messages) {
        setMessages(prev => {
          const next = { ...prev }
          for (const [threadId, msgs] of Object.entries(c.messages)) {
            const current = next[threadId] || []
            for (const m of msgs as Message[]) {
              const idx = current.findIndex(x => x.id === m.id)
              if (idx >= 0) {
                if (m.createdAt > current[idx].createdAt ||
                    (m.createdAt === current[idx].createdAt && senderDeviceId > myDeviceId)) {
                  current[idx] = m
                }
              } else {
                current.push(m)
              }
            }
            next[threadId] = current
          }
          return next
        })
      }
      if (c.projects) {
        setProjects(prev => {
          const merged = [...prev]
          for (const p of c.projects) {
            const idx = merged.findIndex(x => x.id === p.id)
            if (idx >= 0) {
              if (p.updatedAt > merged[idx].updatedAt ||
                  (p.updatedAt === merged[idx].updatedAt && senderDeviceId > myDeviceId)) {
                merged[idx] = p
              }
            } else {
              merged.push(p)
            }
          }
          return merged
        })
      }
    }
  }

  // Load initial data
  useEffect(() => {
    const { threads: t, messages: m, projects: p } = loadData()
    setThreads(t)
    setMessages(m)
    setProjects(p)
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

  // Persist
  useEffect(() => {
    if (threads.length > 0) saveThreads(threads)
  }, [threads])
  useEffect(() => {
    if (Object.keys(messages).length > 0) saveMessages(messages)
  }, [messages])
  useEffect(() => {
    if (projects.length > 0) saveProjects(projects)
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
      t.id === threadId ? { ...t, projectIds: [...t.projectIds, projectId] } : t
    ))
  }, [])

  const removeThreadFromProject = useCallback((threadId: string, projectId: string) => {
    setThreads(prev => prev.map(t => 
      t.id === threadId ? { ...t, projectIds: t.projectIds.filter(id => id !== projectId) } : t
    ))
  }, [])

  const renameThread = useCallback((id: string, name: string) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, name, updatedAt: Date.now() } : t))
  }, [])

  const deleteThread = useCallback((id: string) => {
    setThreads(prev => prev.filter(t => t.id !== id))
    setMessages(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (currentThreadId === id) {
      setCurrentThreadId(threads.find(t => t.id !== id)?.id || '')
    }
  }, [currentThreadId, threads])

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
    setMessages(prev => ({
      ...prev,
      [currentThreadId]: prev[currentThreadId]?.filter(m => m.id !== msgId) || []
    }))
  }, [currentThreadId])

  const createProject = useCallback((name: string) => {
    const project: Project = { id: generateId('p'), name, createdAt: Date.now() }
    setProjects(prev => [...prev, project])
  }, [])

  const renameProject = useCallback((id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name, updatedAt: Date.now() } : p))
  }, [])

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id))
    setThreads(prev => prev.map(t => ({
      ...t,
      projectIds: t.projectIds.filter(pid => pid !== id)
    })))
  }, [])

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
          devices={[]}  // TODO: fetch from sync
          lastSync={null}
          onEnableSync={handleEnableSync}
          onDisableSync={handleDisableSync}
          onGenerateToken={handleGenerateToken}
          onRefresh={handleRefresh}
        />
      )
    }
    
    // Home page - threads list + projects
    if (path === '/') {
      return (
        <HomeBoard
          threads={threads}
          projects={projects}
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
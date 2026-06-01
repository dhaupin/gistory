// Gistory App - Main Entry Point

import { useState, useEffect, useCallback } from 'react'
import { loadData, saveThreads, saveMessages, saveProjects, generateId } from './lib/store'
import type { Thread, Project, Message, MessagesByThread } from './lib/models'
import { parseRoute, onRouteChange, initRouter, navigate } from './lib/router'
import Layout from './components/Layout'
import Header from './components/Header'
import BurgerMenu from './components/BurgerMenu'
import ThreadView from './components/ThreadView'
import ProjectsBoard from './components/ProjectsBoard'
import ProjectDetail from './components/ProjectDetail'
import EmptyState from './components/EmptyState'

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<MessagesByThread>({})
  const [projects, setProjects] = useState<Project[]>([])
  const [currentThreadId, setCurrentThreadId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [darkMode, setDarkMode] = useState(() => 
    localStorage.getItem('gistory_dark') === 'true'
  )
  const [route, setRoute] = useState(parseRoute(window.location.hash))
  const [showBurger, setShowBurger] = useState(false)

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

  // Auto-select first thread
  useEffect(() => {
    if (!currentThreadId && threads.length > 0) {
      setCurrentThreadId(threads[0].id)
    }
  }, [threads, currentThreadId])

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
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))
  }, [])

  const deleteProject = useCallback((id: string) => {
    if (!confirm('Delete project?')) return
    setProjects(prev => prev.filter(p => p.id !== id))
    setThreads(prev => prev.map(t => ({
      ...t,
      projectIds: t.projectIds.filter(pid => pid !== id)
    })))
  }, [])

  const currentThread = threads.find(t => t.id === currentThreadId)
  const getThreadsInProject = (pid: string) => threads.filter(t => t.projectIds.includes(pid))

  const renderPage = () => {
    switch (route.path) {
      case '/projects':
        return (
          <ProjectsBoard 
            projects={projects} 
            threads={threads}
            onSelect={id => { setCurrentThreadId(id); navigate('/') }}
            onProjectClick={id => navigate(`/project/${id}`)}
            onCreate={createProject}
          />
        )
      case '/project/:id':
        return (
          <ProjectDetail
            project={projects.find(p => p.id === route.params.id)}
            threads={getThreadsInProject(route.params.id)}
            messages={messages}
            onSelect={id => { setCurrentThreadId(id); navigate('/') }}
            onDeleteProject={deleteProject}
            onRenameProject={renameProject}
          />
        )
      default:
        return currentThread ? (
          <ThreadView
            thread={currentThread}
            messages={messages[currentThreadId] || []}
            searchQuery={searchQuery}
            onAddMessage={content => addMessage(currentThreadId, content)}
            onUpdateMessage={updateMessage}
            onDeleteMessage={deleteMessage}
          />
        ) : (
          <EmptyState onCreate={createThread} />
        )
    }
  }

  return (
    <div className="app">
      {showBurger && <BurgerMenu threads={threads} projects={projects} currentThreadId={currentThreadId} onSelect={id => { setCurrentThreadId(id); navigate('/'); setShowBurger(false) }} onClose={() => setShowBurger(false)} createThread={createThread} createProject={createProject} />}
      <Layout
        title="Gistory"
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onProjectsClick={() => navigate('/projects')}
        onMenuClick={!route.path.startsWith('/project') && !route.path.startsWith('/projects') ? () => setShowBurger(v => !v) : undefined}
      >
        {renderPage()}
      </Layout>
    </div>
  )
}
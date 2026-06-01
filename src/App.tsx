import { useState, useEffect } from 'react'

interface Message {
  id: string
  content: string
  createdAt: number
}

interface Thread {
  id: string
  name: string
  createdAt: number
  projectIds: string[]
}

interface Project {
  id: string
  name: string
}

// Generate unique IDs
const genId = () => Math.random().toString(36).slice(2, 11)

// Storage keys
const THREADS_KEY = 'pk_threads'
const MESSAGES_KEY = 'pk_messages'
const PROJECTS_KEY = 'pk_projects'
const DRAFT_KEY = 'pk_draft'

// Load draft
const loadDraft = (): Record<string, string> => {
  const stored = localStorage.getItem(DRAFT_KEY)
  return stored ? JSON.parse(stored) : {}
}

// Load from localStorage
const loadThreads = (): Thread[] => {
  const stored = localStorage.getItem(THREADS_KEY)
  return stored ? JSON.parse(stored) : []
}

const loadMessages = (): Record<string, Message[]> => {
  const stored = localStorage.getItem(MESSAGES_KEY)
  return stored ? JSON.parse(stored) : {}
}

const loadProjects = (): Project[] => {
  const stored = localStorage.getItem(PROJECTS_KEY)
  return stored ? JSON.parse(stored) : []
}

function App() {
  // State
  const [threads, setThreads] = useState<Thread[]>(loadThreads)
  const [messages, setMessages] = useState<Record<string, Message[]>>(loadMessages)
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  
  const [currentThreadId, setCurrentThreadId] = useState<string>('')
  const [inputText, setInputText] = useState('')
  const [newThreadName, setNewThreadName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showThreadMenu, setShowThreadMenu] = useState(false)
  const [toast, setToast] = useState('')
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('pk_dark')
    return stored ? JSON.parse(stored) : false
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>(loadDraft)

  // Current thread and messages
  const currentThread = threads.find(t => t.id === currentThreadId)
  const currentMessages = currentThreadId ? (messages[currentThreadId] || []) : []

  // Auto-select first thread
  useEffect(() => {
    if (!currentThreadId && threads.length > 0) {
      setCurrentThreadId(threads[0].id)
    }
  }, [threads, currentThreadId])

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads))
  }, [threads])

  useEffect(() => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  }, [projects])

  // Persist dark mode
  useEffect(() => {
    localStorage.setItem('pk_dark', JSON.stringify(darkMode))
    document.body.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Persist drafts
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
  }, [drafts])

  // Restore draft when switching threads (after initial load)
  useEffect(() => {
    if (!currentThreadId) return
    // Use setTimeout to ensure drafts state is initialized
    const timer = setTimeout(() => {
      setInputText(drafts[currentThreadId] || '')
    }, 0)
    return () => clearTimeout(timer)
  }, [currentThreadId, drafts])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S = save message
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (inputText.trim()) saveMessage()
      }
      // Ctrl/Cmd + Shift + N = new thread
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        setShowNewThread(t => !t)
      }
      // Ctrl/Cmd + Shift + P = new project
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setShowNewProject(p => !p)
      }
      // / = toggle dark mode (only when no input focused)
      if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        setDarkMode(prev => !prev)
      }
      // Escape = clear search / close modals
      if (e.key === 'Escape') {
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [inputText])

  // Helper: show toast
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  // Create new thread
  const createThread = () => {
    if (!newThreadName.trim()) return
    
    const thread: Thread = {
      id: genId(),
      name: newThreadName.trim(),
      createdAt: Date.now(),
      projectIds: []
    }
    
    setThreads(prev => [thread, ...prev])
    setMessages(prev => ({ ...prev, [thread.id]: [] }))
    setCurrentThreadId(thread.id)
    setNewThreadName('')
    setShowNewThread(false)
    showToast(`Created thread "${thread.name}"`)
  }

  // Delete thread
  const deleteThread = (threadId: string) => {
    const thread = threads.find(t => t.id === threadId)
    if (!confirm(`Delete thread "${thread?.name}"?`)) return
    
    setThreads(prev => prev.filter(t => t.id !== threadId))
    setMessages(prev => {
      const next = { ...prev }
      delete next[threadId]
      return next
    })
    
    if (currentThreadId === threadId) {
      const remaining = threads.filter(t => t.id !== threadId)
      setCurrentThreadId(remaining[0]?.id || '')
    }
    showToast('Thread deleted')
  }

  // Rename thread
  const renameThread = (threadId: string, newName: string) => {
    if (!newName.trim()) return
    setThreads(prev => prev.map(t => 
      t.id === threadId ? { ...t, name: newName.trim() } : t
    ))
  }

  // Save message
  const saveMessage = () => {
    if (!inputText.trim() || !currentThreadId) return
    
    const message: Message = {
      id: genId(),
      content: inputText.trim(),
      createdAt: Date.now()
    }
    
    setMessages(prev => ({
      ...prev,
      [currentThreadId]: [message, ...(prev[currentThreadId] || [])]
    }))
    setInputText('')
    setDrafts(prev => ({ ...prev, [currentThreadId]: '' }))
    showToast('Saved!')
  }

  // Copy text to clipboard
  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    showToast('Copied!')
  }

  // Delete message
  const deleteMessage = (messageId: string) => {
    if (!confirm('Delete this message?')) return
    
    setMessages(prev => ({
      ...prev,
      [currentThreadId]: prev[currentThreadId].filter(m => m.id !== messageId)
    }))
    showToast('Deleted')
  }

  // Add thread to project
  const addThreadToProject = (projectId: string) => {
    if (!currentThreadId) return
    const thread = threads.find(t => t.id === currentThreadId)
    if (thread?.projectIds.includes(projectId)) return
    
    setThreads(prev => prev.map(t =>
      t.id === currentThreadId
        ? { ...t, projectIds: [...t.projectIds, projectId] }
        : t
    ))
    const proj = projects.find(p => p.id === projectId)
    showToast(`Added to "${proj?.name}"`)
  }

  /* UNUSED - keeping logic inline if needed later
  const _removeFromProject = (threadId: string, projectId: string) => {
    setThreads(prev => prev.map(t =>
      t.id === threadId
        ? { ...t, projectIds: t.projectIds.filter(id => id !== projectId) }
        : t
    ))
  }
*/

  // Remove thread from project
  const removeThreadFromProject = (projectId: string) => {
    if (!currentThreadId) return
    setThreads(prev => prev.map(t =>
      t.id === currentThreadId
        ? { ...t, projectIds: t.projectIds.filter(id => id !== projectId) }
        : t
    ))
    const proj = projects.find(p => p.id === projectId)
    showToast(`Removed from "${proj?.name}"`)
  }

  // Create new project
  const createProject = () => {
    if (!newProjectName.trim()) return
    
    const project: Project = {
      id: genId(),
      name: newProjectName.trim()
    }
    
    setProjects(prev => [...prev, project])
    setNewProjectName('')
    setShowNewProject(false)
    showToast(`Created project "${project.name}"`)
  }

  // Get threads in a project
  const getThreadsInProject = (projectId: string) => {
    return threads.filter(t => t.projectIds.includes(projectId))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  // Get projects for current thread
  const threadProjects = currentThread
    ? projects.filter(p => currentThread.projectIds.includes(p.id))
    : []

  return (
    <div className="container">
      {/* Header: compact with both buttons */}
      <header className="header" style={{ marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Gistory</h1>
        <div className="header-actions">
          <input 
            className="thread-name-input" 
            style={{ width: '100px' }}
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className="btn btn-secondary btn-small" onClick={() => setDarkMode(prev => !prev)} title="Toggle dark (/)">
            {darkMode ? '☀' : '🌙'}
          </button>
          <button className="btn btn-secondary" onClick={() => setShowNewThread(t => !t)}>
            {showNewThread ? '✕' : '+ Thread'}
          </button>
          <button className="btn btn-secondary" onClick={() => setShowNewProject(p => !p)}>
            {showNewProject ? '✕' : '+ Project'}
          </button>
        </div>
      </header>

      {/* New Project Form */}
      {(showNewThread || showNewProject) && (
        <div className="input-card" style={{ marginBottom: '0.5rem', padding: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {showNewThread && (
              <>
                <input className="thread-name-input" placeholder="Thread name..."
                  value={newThreadName} onChange={e => setNewThreadName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createThread()} autoFocus />
                <button className="btn btn-primary btn-small" onClick={createThread}>Create</button>
              </>
            )}
            {showNewProject && (
              <>
                <input className="thread-name-input" placeholder="Project name..."
                  value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createProject()} autoFocus={!showNewThread} />
                <button className="btn btn-primary btn-small" onClick={createProject}>+Proj</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Projects: clickable tags */}
      {projects.length > 0 && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Projects:</span>
          {projects.map(project => {
            const count = getThreadsInProject(project.id).length
            return (
              <button key={project.id} className="project-badge" style={{ cursor: count > 0 ? 'pointer' : 'default' }}
                onClick={() => {
                  const projThreads = threads.filter(t => t.projectIds.includes(project.id))
                  if (projThreads.length > 0) setCurrentThreadId(projThreads[0].id)
                }}
                title={count > 0 ? `Jump to ${project.name}` : 'No threads'}
              >
                {project.name} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Thread selector: compact */}
      <div className="thread-selector" style={{ marginBottom: '0.75rem', position: 'relative' }}>
        <select style={{ flex: '1 1 120px' }} value={currentThreadId} onChange={e => setCurrentThreadId(e.target.value)}>
          <option value="">Select thread...</option>
          {threads.sort((a, b) => b.createdAt - a.createdAt).map(thread => (
            <option key={thread.id} value={thread.id}>{thread.name}</option>
          ))}
        </select>
        {currentThread && projects.length > 0 && (
          <select style={{ marginLeft: '0.5rem' }} value="" onChange={e => {
            if (e.target.value) addThreadToProject(e.target.value)
            e.target.value = ''
          }}>
            <option value="">+ to proj</option>
            {projects.filter(p => !currentThread.projectIds.includes(p.id)).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {showThreadMenu && currentThread && (
          <div className="dropdown-menu" style={{ position: 'absolute', zIndex: 10 }}>
            <button onClick={() => { 
              const name = prompt('Rename thread:', currentThread.name)
              if (name) renameThread(currentThreadId, name)
              setShowThreadMenu(false)
            }}>Rename</button>
            {projects.length > 0 && (
              <>
                <div className="dropdown-divider" />
                {projects.map(p => (
                  <button key={p.id} onClick={() => {
                    if (currentThread.projectIds.includes(p.id)) {
                      removeThreadFromProject(p.id)
                    } else {
                      addThreadToProject(p.id)
                    }
                    setShowThreadMenu(false)
                  }}>
                    {currentThread.projectIds.includes(p.id) ? '✓ ' : '○ '} {p.name}
                  </button>
                ))}
              </>
            )}
            <div className="dropdown-divider" />
            <button onClick={() => { deleteThread(currentThreadId); setShowThreadMenu(false) }} style={{ color: 'var(--danger)' }}>Delete</button>
          </div>
        )}
        {currentThread && (
          <button 
            className="btn btn-secondary btn-small" 
            style={{ padding: '0.25rem 0.5rem', minWidth: 'auto', marginLeft: showThreadMenu ? '0' : '0.5rem' }}
            onClick={() => setShowThreadMenu(!showThreadMenu)}
          >⚙</button>
        )}
      </div>

      {/* Thread Content */}
      {currentThread ? (
        <>
          {/* Edit Thread Name */}
          <div style={{ marginBottom: '1rem' }}>
            <input
              className="thread-name-input"
              style={{ fontWeight: 600, fontSize: '1rem' }}
              value={currentThread.name}
              onChange={e => renameThread(currentThreadId, e.target.value)}
            />
          </div>

          {/* Thread Projects */}
          {threadProjects.length > 0 && (
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>In:</span>
              {threadProjects.map(p => (
                <span key={p.id} className="project-badge">
                  {p.name}
                </span>
              ))}
            </div>
          )}

          {/* Input Card */}
          <div className="input-card">
            <textarea
              placeholder="Write your prompt here..."
              value={inputText}
              onChange={e => {
                setInputText(e.target.value)
                if (currentThreadId) {
                  setDrafts(prev => ({ ...prev, [currentThreadId]: e.target.value }))
                }
              }}
            />
            <div className="input-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setInputText('')
                  if (currentThreadId) setDrafts(prev => ({ ...prev, [currentThreadId]: '' }))
                }}
                disabled={!inputText.trim()}
              >
                Clear
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => copyText(inputText)}
                disabled={!inputText.trim()}
              >
                Copy
              </button>
              <button
                className="btn btn-primary"
                onClick={saveMessage}
                disabled={!inputText.trim()}
              >
                Save
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="messages-header">
            <h2>Saved ({currentMessages.length})</h2>
          </div>
          
          {currentMessages.length > 0 ? (
            <div className="messages-list">
              {currentMessages
                .filter(m => searchQuery ? m.content.toLowerCase().includes(searchQuery.toLowerCase()) : true)
                .map(message => (
                <div key={message.id} className="message-card">
                  <p>{message.content}</p>
                  <div className="message-actions">
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => copyText(message.content)}
                    >
                      Copy
                    </button>
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => deleteMessage(message.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No saved messages yet. Write something above to save it!
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <p>No thread selected.</p>
          <button
            className="btn btn-primary"
            onClick={() => setShowNewThread(true)}
          >
            Create your first thread
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

export default App
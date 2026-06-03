// HomeBoard - main threads + projects list
import { useState } from 'react'
import { Folder, Plus, X } from 'lucide-react'
import type { Thread, Project } from '../lib/models'
import { sortThreads, type SortState } from '../ui/sort'

interface HomeBoardProps {
  threads: Thread[]
  projects: Project[]
  sort: SortState
  onSortChange: (sort: SortState) => void
  onSelectThread: (id: string) => void
  onProjectClick: (projectId: string) => void
  onCreateThread: (name: string, projectIds?: string[]) => void
  onCreateProject: (name: string) => void
  onRenameThread?: (id: string, name: string) => void
  onDeleteThread?: (id: string) => void
  onRenameProject?: (id: string, name: string) => void
  onDeleteProject?: (id: string) => void
}

export default function HomeBoard({
  threads,
  projects,
  sort,
  onSortChange,
  onSelectThread,
  onProjectClick,
  onCreateThread,
  onCreateProject,
  onRenameThread,
  onDeleteThread,
  onRenameProject,
  onDeleteProject
}: HomeBoardProps) {
  const [newThreadName, setNewThreadName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [deleting, setDeleting] = useState<{ type: 'thread' | 'project'; id: string } | null>(null)

  const sortedThreads = sortThreads(threads, sort)
  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name))

  const getThreadsInProject = (pid: string) => 
    threads.filter(t => t.projectIds.includes(pid))

  const handleCreateThread = () => {
    if (!newThreadName.trim()) return
    onCreateThread(newThreadName.trim())
    setNewThreadName('')
    setShowNewThread(false)
  }

  const confirmDelete = (type: 'thread' | 'project', id: string) => {
    if (deleting?.type === type && deleting?.id === id) {
      // Second click confirms
      if (type === 'thread') onDeleteThread?.(id)
      else onDeleteProject?.(id)
      setDeleting(null)
    } else {
      setDeleting({ type, id })
      // Auto-clear after 3s
      setTimeout(() => setDeleting(null), 3000)
    }
  }

  return (
    <div className="container home-board">
      {/* Header with sort + new buttons */}
      <div className="home-header">
        <div className="header-left">
          <h2>Threads</h2>
          <select 
            value={`${sort.field}_${sort.dir}`}
            onChange={e => {
              const [field, dir] = e.target.value.split('_') as [SortState['field'], SortState['dir']]
              onSortChange({ field, dir })
            }}
            className="sort-select"
          >
            <option value="createdAt_desc">Newest</option>
            <option value="createdAt_asc">Oldest</option>
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
          </select>
        </div>
        
        <div className="header-actions">
          <button 
            className="btn btn-ghost btn-small"
            onClick={() => setShowNewThread(!showNewThread)}
          >
            <Plus size={16} /> Thread
          </button>
          <button 
            className="btn btn-ghost btn-small"
            onClick={() => setShowNewProject(!showNewProject)}
          >
            <Plus size={16} /> Project
          </button>
        </div>
      </div>

      {/* New Thread form */}
      {showNewThread && (
        <div className="new-form">
          <input
            autoFocus
            placeholder="Thread name..."
            value={newThreadName}
            onChange={e => setNewThreadName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateThread()}
          />
          <button className="btn btn-primary btn-small" onClick={handleCreateThread}>Create</button>
          <button className="btn btn-ghost btn-small" onClick={() => setShowNewThread(false)}>Cancel</button>
        </div>
      )}

      {/* New Project form */}
      {showNewProject && (
        <div className="new-form">
          <input
            autoFocus
            placeholder="Project name..."
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (onCreateProject(newProjectName.trim()), setNewProjectName(''), setShowNewProject(false))}
          />
          <button className="btn btn-primary btn-small" onClick={() => { if (newProjectName.trim()) { onCreateProject(newProjectName.trim()); setNewProjectName(''); setShowNewProject(false) }}}>Create</button>
          <button className="btn btn-ghost btn-small" onClick={() => setShowNewProject(false)}>Cancel</button>
        </div>
      )}

      {/* Threads list */}
      <div className="threads-section">
        {sortedThreads.length === 0 ? (
          <p className="empty-text">No threads yet. Create one to get started.</p>
        ) : (
          <div className="threads-grid">
            {sortedThreads.map(thread => (
              <div key={thread.id} className="thread-item">
                <button className="thread-link" onClick={() => onSelectThread(thread.id)}>
                  <span className="thread-name">{thread.name}</span>
                  <span className="thread-meta">
                    {thread.projectIds.length > 0 && (
                      <span className="thread-projects">
                        {thread.projectIds.map(id => {
                          const p = projects.find(p => p.id === id)
                          return p ? <span key={id} className="project-tag">{p.name}</span> : null
                        })}
                      </span>
                    )}
                  </span>
                </button>
                {onDeleteThread && (
                  <button 
                    className={`btn-icon ${deleting?.type === 'thread' && deleting?.id === thread.id ? 'danger' : ''}`}
                    onClick={() => confirmDelete('thread', thread.id)}
                    title={deleting?.type === 'thread' && deleting?.id === thread.id ? 'Click again to confirm' : 'Delete thread'}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Projects section */}
      <div className="projects-section">
        <h3>Projects</h3>
        {sortedProjects.length === 0 ? (
          <p className="empty-text">No projects yet.</p>
        ) : (
          <div className="projects-grid">
            {sortedProjects.map(project => (
              <div key={project.id} className="project-item">
                <button className="project-link" onClick={() => onProjectClick(project.id)}>
                  <Folder size={16} />
                  <span className="project-name">{project.name}</span>
                  <span className="project-count">
                    {getThreadsInProject(project.id).length}
                  </span>
                </button>
                {onDeleteProject && (
                  <button 
                    className={`btn-icon ${deleting?.type === 'project' && deleting?.id === project.id ? 'danger' : ''}`}
                    onClick={() => confirmDelete('project', project.id)}
                    title={deleting?.type === 'project' && deleting?.id === project.id ? 'Click again to confirm' : 'Delete project'}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
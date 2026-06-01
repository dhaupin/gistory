// BurgerMenu - sidebar with threads/projects
import { useState } from 'react'
import { X } from 'lucide-react'
import type { Thread, Project } from '../lib/models'

interface BurgerMenuProps {
  threads: Thread[]
  projects: Project[]
  currentThreadId: string
  onSelect: (id: string) => void
  onClose: () => void
  createThread: (name: string, projectIds?: string[]) => void
  createProject: (name: string) => void
}

export default function BurgerMenu({
  threads,
  projects,
  currentThreadId,
  onSelect,
  onClose,
  createThread,
  createProject
}: BurgerMenuProps) {
  const [newThreadName, setNewThreadName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)

  const getThreadsInProject = (pid: string) => threads.filter(t => t.projectIds.includes(pid))
  const unassigned = threads.filter(t => t.projectIds.length === 0)
  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name))

  const handleCreateThread = () => {
    if (!newThreadName.trim()) return
    createThread(newThreadName.trim())
    setNewThreadName('')
    setShowNewThread(false)
  }

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return
    createProject(newProjectName.trim())
    setNewProjectName('')
    setShowNewProject(false)
  }

  return (
    <div className="sidebar-overlay" onClick={onClose}>
      <div className="sidebar" onClick={e => e.stopPropagation()}>
        <div className="sidebar-header">
          <h3>Menu</h3>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Quick create */}
        <div className="quick-create">
          {showNewThread ? (
            <div className="form-inline">
              <input
                className="input-name"
                placeholder="Thread name..."
                value={newThreadName}
                onChange={e => setNewThreadName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateThread()}
                autoFocus
              />
              <button className="btn btn-primary btn-small" onClick={handleCreateThread}>Create</button>
            </div>
          ) : (
            <button className="btn btn-primary btn-small" onClick={() => setShowNewThread(true)}>+ Thread</button>
          )}
          <button className="btn btn-secondary btn-small" onClick={() => setShowNewProject(!showNewProject)}>
            + Project
          </button>
        </div>

        {showNewProject && (
          <div className="form-inline" style={{ marginTop: '0.5rem' }}>
            <input
              className="input-name"
              placeholder="Project name..."
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
            />
            <button className="btn btn-primary btn-small" onClick={handleCreateProject}>Create</button>
          </div>
        )}

        {/* Projects with threads */}
        {sortedProjects.map(project => {
          const projThreads = getThreadsInProject(project.id)
          return (
            <div key={project.id} className="project-group">
              <div className="project-label">{project.name} ({projThreads.length})</div>
              {projThreads.map(thread => (
                <button
                  key={thread.id}
                  className={`thread-link ${currentThreadId === thread.id ? 'active' : ''}`}
                  onClick={() => onSelect(thread.id)}
                >
                  {thread.name}
                </button>
              ))}
            </div>
          )
        })}

        {/* Unassigned threads */}
        {unassigned.length > 0 && (
          <div className="project-group">
            <div className="project-label project-label-dim">Unassigned ({unassigned.length})</div>
            {unassigned.map(thread => (
              <button
                key={thread.id}
                className={`thread-link ${currentThreadId === thread.id ? 'active' : ''}`}
                onClick={() => onSelect(thread.id)}
              >
                {thread.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
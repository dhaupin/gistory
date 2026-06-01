// ProjectsBoard - grid of project cards

import { useState } from 'react'
import type { Project, Thread } from '../lib/models'

interface ProjectsBoardProps {
  projects: Project[]
  threads: Thread[]
  onSelect: (threadId: string) => void
  onProjectClick: (projectId: string) => void
  onCreate: (name: string) => void
}

export default function ProjectsBoard({
  projects,
  threads,
  onSelect,
  onProjectClick,
  onCreate
}: ProjectsBoardProps) {
  const [newName, setNewName] = useState('')
  const [showForm, setShowForm] = useState(false)

  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name))

  const getThreadCount = (pid: string) => 
    threads.filter(t => t.projectIds.includes(pid)).length

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(ts).toLocaleDateString()
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    onCreate(newName.trim())
    setNewName('')
    setShowForm(false)
  }

  return (
    <div className="container">
      <div className="page-header">
        <h2>Projects</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          + New
        </button>
      </div>

      {showForm && (
        <div className="form-inline">
          <input
            className="input-name"
            placeholder="Project name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      )}

      <div className="projects-grid">
        {sorted.map(project => {
          const count = getThreadCount(project.id)
          return (
            <div 
              key={project.id} 
              className="project-card"
              onClick={() => onProjectClick(project.id)}
            >
              <div className="project-card-header">
                <span className="project-icon">📁</span>
                <span className="project-name">{project.name}</span>
              </div>
              <div className="project-stats">
                {count} thread{count !== 1 ? 's' : ''}
              </div>
            </div>
          )
        })}
      </div>

      {projects.length === 0 && (
        <div className="empty-state">
          <p>No projects yet</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            Create first project
          </button>
        </div>
      )}
    </div>
  )
}
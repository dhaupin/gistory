// ProjectsBoard - grid of project cards
import { useState } from 'react'
import { Folder, Plus, Pin, PinOff } from 'lucide-react'
import type { Project, Thread } from '../lib/models'
import { sortProjects } from '../ui/sort'
import { useViewState } from '../ui/view-state'
import { SortableProvider, SortableRow, SortableHandle } from '../ui/sortable'
import { useSubmitLock } from '../ui/hooks'
import ActionMenu from './ActionMenu'

interface ProjectsBoardProps {
  projects: Project[]
  threads: Thread[]
  onProjectClick: (projectId: string) => void
  onCreate: (name: string) => void
  onTogglePin?: (id: string) => void
}

export default function ProjectsBoard({
  projects,
  threads,
  onProjectClick,
  onCreate,
  onTogglePin
}: ProjectsBoardProps) {
  const [newName, setNewName] = useState('')
  const [showForm, setShowForm] = useState(false)

  const { view, reorder } = useViewState()
  const sorted = sortProjects(projects, p => view[p.id]?.rank)

  const getThreadCount = (pid: string) => 
    threads.filter(t => t.projectIds.includes(pid)).length

  const tryCreate = useSubmitLock(showForm)
  const handleCreate = () => {
    if (!newName.trim()) return
    if (!tryCreate()) return
    onCreate(newName.trim())
    setNewName('')
    setShowForm(false)
  }

  return (
    <div className="container">
      <div className="page-header">
        <h2>Projects</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Project
        </button>
      </div>

      {showForm && (
        <div className="form-inline">
          <input
            className="input-name"
            placeholder="Project name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              // Escape closes without creating, matching every other
              // dismissable surface in the app.
              if (e.key === 'Escape') { setShowForm(false); setNewName('') }
            }}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleCreate}>
            Create
          </button>
          <button className="btn btn-secondary" onClick={() => { setShowForm(false); setNewName('') }}>
            Cancel
          </button>
        </div>
      )}

      <SortableProvider ids={sorted.map(p => p.id)} onReorder={reorder} className="projects-grid">
        {sorted.map(project => {
          const count = getThreadCount(project.id)
          return (
            <SortableRow key={project.id} id={project.id} className={`project-card-row${project.pinned ? ' pinned' : ''}`}>
              <SortableHandle label={project.name} />
              <div 
                className="project-card"
                role="button"
                tabIndex={0}
                onClick={() => onProjectClick(project.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onProjectClick(project.id)
                  }
                }}
              >
                <div className="project-card-header">
                  <Folder size={24} />
                  <span className="project-name">{project.name}</span>
                  {project.pinned && <Pin size={12} className="pin-indicator" aria-label="Pinned" />}
                </div>
                <div className="project-stats">
                  {count} thread{count !== 1 ? 's' : ''}
                </div>
              </div>
              {onTogglePin && (
                <ActionMenu
                  items={[{
                    label: project.pinned ? 'Unpin' : 'Pin to top',
                    icon: project.pinned ? <PinOff size={14} /> : <Pin size={14} />,
                    onClick: () => onTogglePin(project.id),
                  }]}
                />
              )}
            </SortableRow>
          )
        })}
      </SortableProvider>

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

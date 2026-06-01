// ProjectDetail - single project view
import { useState } from 'react'
import { Folder, MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import type { Project, Thread, MessagesByThread } from '../lib/models'

interface ProjectDetailProps {
  project: Project | undefined
  threads: Thread[]
  messages: MessagesByThread
  onSelect: (threadId: string) => void
  onDeleteProject: (id: string) => void
  onRenameProject: (id: string, name: string) => void
}

export default function ProjectDetail({
  project,
  threads,
  messages,
  onSelect,
  onDeleteProject,
  onRenameProject
}: ProjectDetailProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(project?.name || '')

  if (!project) {
    return <div className="container"><p>Project not found</p></div>
  }

  const handleRename = () => {
    if (newName.trim() && newName !== project.name) {
      onRenameProject(project.id, newName.trim())
    }
    setRenaming(false)
  }

  const sorted = [...threads].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="container">
      <div className="page-header">
        {renaming ? (
          <div className="form-inline">
            <input
              className="input-name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              autoFocus
            />
            <button className="btn btn-primary btn-small" onClick={handleRename}>
              Save
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="page-title-row">
            <h2><Folder size={20} /> {project.name}</h2>
            <button className="btn-gear" onClick={() => setShowMenu(!showMenu)}>
              <MoreHorizontal size={16} />
            </button>
          </div>
        )}
      </div>

      {showMenu && !renaming && (
        <div className="dropdown-menu">
          <button className="dropdown-item" onClick={() => { setRenaming(true); setNewName(project.name); setShowMenu(false) }}>
            <Edit size={14} /> Rename
          </button>
          <button className="dropdown-item danger" onClick={() => { onDeleteProject(project.id); setShowMenu(false) }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      <div className="threads-list">
        <h3>{sorted.length} Thread{sorted.length !== 1 ? 's' : ''}</h3>
        {sorted.map(thread => (
          <button
            key={thread.id}
            className="thread-card"
            onClick={() => onSelect(thread.id)}
          >
            <div className="thread-name">{thread.name}</div>
            <div className="thread-meta">
              {(messages[thread.id] || []).length} message{(messages[thread.id] || []).length !== 1 ? 's' : ''}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
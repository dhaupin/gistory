// ProjectDetail - single project view
import { useState } from 'react'
import { Folder, Edit, Trash2 } from 'lucide-react'
import type { Project, Thread, MessagesByThread } from '../lib/models'
import { sortThreads, type SortState } from '../ui/sort'
import ActionMenu, { ActionItem } from './ActionMenu'
import ConfirmDialog from './ConfirmDialog'

interface ProjectDetailProps {
  project: Project | undefined
  threads: Thread[]
  messages: MessagesByThread
  sort: SortState
  onSortChange: (sort: SortState) => void
  onSelect: (threadId: string) => void
  onDeleteProject: (id: string) => void
  onRenameProject: (id: string, name: string) => void
}

export default function ProjectDetail({
  project,
  threads,
  messages,
  sort,
  onSortChange,
  onSelect,
  onDeleteProject,
  onRenameProject
}: ProjectDetailProps) {
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

  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const handleDelete = () => {
    setDeleteConfirm(true)
  }

  const confirmDelete = () => {
    onDeleteProject(project.id)
    setDeleteConfirm(false)
  }

  const buildMenuItems = (): ActionItem[] => [
    { label: 'Rename', icon: <Edit size={14} />, onClick: () => { setRenaming(true); setNewName(project.name) } },
    { label: 'Delete', icon: <Trash2 size={14} />, onClick: handleDelete, variant: 'danger' },
  ]

  const sorted = sortThreads(threads, sort)

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
            <ActionMenu items={buildMenuItems()} />
          </div>
        )}
      </div>

      <div className="threads-list">
        <div className="threads-header">
          <h3>{sorted.length} Thread{sorted.length !== 1 ? 's' : ''}</h3>
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

      {deleteConfirm && (
        <ConfirmDialog
          open
          title="Delete project?"
          message={`Are you sure you want to delete "${project.name}"? Threads will be kept but unassigned. This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
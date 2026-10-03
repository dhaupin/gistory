// ProjectDetail - single project view
import { useState } from 'react'
import { Folder, Edit, Trash2, Pin, PinOff } from 'lucide-react'
import type { Project, Thread, MessagesByThread } from '../lib/models'
import { sortThreads, sortStateFromValue, THREAD_SORT_OPTIONS, type SortState } from '../ui/sort'
import { useViewState } from '../ui/view-state'
import { SortableProvider, SortableRow, SortableHandle } from '../ui/sortable'
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
  onTogglePin?: (id: string) => void
}

export default function ProjectDetail({
  project,
  threads,
  messages,
  sort,
  onSortChange,
  onSelect,
  onDeleteProject,
  onRenameProject,
  onTogglePin
}: ProjectDetailProps) {
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(project?.name || '')
  // Declared with the other hooks: this used to sit *after* the not-found early
  // return, which made it a conditional hook and blew up when navigating from a
  // real project to a deleted one.
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const { view, reorder } = useViewState()

  if (!project) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>Project not found</h2>
          <p>It may have been deleted on another device.</p>
          <a className="btn btn-primary" href="#/projects">Back to projects</a>
        </div>
      </div>
    )
  }

  const handleRename = () => {
    if (newName.trim() && newName !== project.name) {
      onRenameProject(project.id, newName.trim())
    }
    setRenaming(false)
  }

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

  const sorted = sortThreads(threads, sort, t => view[t.id]?.rank)

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
            onChange={e => onSortChange(sortStateFromValue(e.target.value))}
            className="sort-select"
            aria-label="Sort threads"
          >
            {THREAD_SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <SortableProvider ids={sorted.map(t => t.id)} onReorder={reorder}>
        {sorted.map(thread => (
          <SortableRow key={thread.id} id={thread.id} className={`thread-card-row${thread.pinned ? ' pinned' : ''}`}>
            <SortableHandle label={thread.name} />
            <button
              className="thread-card"
              onClick={() => onSelect(thread.id)}
            >
              {thread.pinned && <Pin size={12} className="pin-indicator" aria-hidden="true" />}
              <div className="thread-name">{thread.name}</div>
              <div className="thread-meta">
                {(messages[thread.id] || []).length} message{(messages[thread.id] || []).length !== 1 ? 's' : ''}
              </div>
            </button>
            {onTogglePin && (
              <ActionMenu
                items={[{
                  label: thread.pinned ? 'Unpin' : 'Pin to top',
                  icon: thread.pinned ? <PinOff size={14} /> : <Pin size={14} />,
                  onClick: () => onTogglePin(thread.id),
                }]}
              />
            )}
          </SortableRow>
        ))}
        </SortableProvider>
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
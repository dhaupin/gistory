// BurgerMenu - sidebar with threads/projects
import { useState } from 'react'
import { X, Edit, Trash2, Pin, PinOff, ChevronDown, ChevronRight } from 'lucide-react'
import type { Thread, Project } from '../lib/models'
import { sortThreads, sortProjects, sortStateFromValue, THREAD_SORT_OPTIONS, type SortState } from '../ui/sort'
import { useViewState } from '../ui/view-state'
import { SortableProvider, SortableRow, SortableHandle } from '../ui/sortable'
import { useSubmitLock } from '../ui/hooks'
import ActionMenu, { ActionItem } from './ActionMenu'
import ConfirmDialog from './ConfirmDialog'

interface BurgerMenuProps {
  threads: Thread[]
  projects: Project[]
  currentThreadId: string
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  onSelect: (id: string) => void
  onClose: () => void
  createThread: (name: string, projectIds?: string[]) => void
  createProject: (name: string) => void
  onSettings?: () => void
  onRenameThread?: (id: string, name: string) => void
  onDeleteThread?: (id: string) => void
  onAddToProject?: (threadId: string, projectId: string) => void
  onRemoveFromProject?: (threadId: string, projectId: string) => void
  onRenameProject?: (id: string, name: string) => void
  onDeleteProject?: (id: string) => void
  onTogglePin?: (id: string) => void
  onTogglePinProject?: (id: string) => void
  onTrash?: () => void
}

const UNASSIGNED = 'group:unassigned'

export default function BurgerMenu({
  threads,
  projects,
  currentThreadId,
  sort,
  onSortChange,
  onSelect,
  onClose,
  createThread,
  createProject,
  onSettings,
  onRenameThread,
  onDeleteThread,
  onAddToProject,
  onRemoveFromProject,
  onRenameProject,
  onDeleteProject,
  onTogglePin,
  onTogglePinProject,
  onTrash
}: BurgerMenuProps) {
  const [newThreadName, setNewThreadName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [editingThread, setEditingThread] = useState<{id: string, name: string} | null>(null)
  const [editingProject, setEditingProject] = useState<{id: string, name: string} | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'thread' | 'project'; id: string; name: string } | null>(null)
  const { view, isCollapsed, toggleCollapse, reorder } = useViewState()

  // Sort threads globally (must declare before getThreadsInProject usage)
  const sortedThreads = sortThreads(
    threads,
    sort || { field: 'createdAt', dir: 'desc' },
    t => view[t.id]?.rank,
  )
  const sortedProjectsList = sortProjects(projects, p => view[p.id]?.rank)
  // Archived threads are navigation noise in the sidebar; the home board's
  // Archived section is where they live until restored.
  const activeThreads = sortedThreads.filter(t => t.metadata?.status !== 'archived')
  const getThreadsInProject = (pid: string) => activeThreads.filter(t => t.projectIds.includes(pid))
  const unassigned = activeThreads.filter(t => t.projectIds.length === 0)

  const tryCreateThread = useSubmitLock(showNewThread)
  const tryCreateProject = useSubmitLock(showNewProject)

  const handleCreateThread = () => {
    if (!newThreadName.trim()) return
    if (!tryCreateThread()) return
    createThread(newThreadName.trim())
    setNewThreadName('')
    setShowNewThread(false)
  }

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return
    if (!tryCreateProject()) return
    createProject(newProjectName.trim())
    setNewProjectName('')
    setShowNewProject(false)
  }

  const handleRenameThread = (id: string) => {
    const thread = threads.find(t => t.id === id)
    if (thread) {
      setEditingThread({ id, name: thread.name })
    }
  }

  const handleSaveRename = () => {
    if (editingThread && editingThread.name.trim()) {
      onRenameThread?.(editingThread.id, editingThread.name.trim())
    }
    setEditingThread(null)
  }

  const handleDeleteThread = (id: string) => {
    const thread = threads.find(t => t.id === id)
    if (thread) {
      setDeleteConfirm({ type: 'thread', id, name: thread.name })
    }
  }

  const handleDeleteProject = (id: string) => {
    const project = projects.find(p => p.id === id)
    if (project) {
      setDeleteConfirm({ type: 'project', id, name: project.name })
    }
  }

  const confirmDelete = () => {
    if (!deleteConfirm) return
    if (deleteConfirm.type === 'thread') {
      onDeleteThread?.(deleteConfirm.id)
    } else {
      onDeleteProject?.(deleteConfirm.id)
    }
    setDeleteConfirm(null)
  }

  const buildThreadMenuItems = (thread: Thread): ActionItem[] => {
    const items: ActionItem[] = []
    if (onTogglePin) {
      items.push({
        label: thread.pinned ? 'Unpin' : 'Pin to top',
        icon: thread.pinned ? <PinOff size={14} /> : <Pin size={14} />,
        onClick: () => onTogglePin(thread.id),
      })
    }
    items.push({ label: 'Rename', icon: <Edit size={14} />, onClick: () => handleRenameThread(thread.id) })
    // Project toggle options - show all projects with checkbox
    projects.forEach(p => {
      const isInProject = thread.projectIds.includes(p.id)
      items.push({
        label: p.name,
        checked: isInProject,
        onClick: () => isInProject
          ? onRemoveFromProject?.(thread.id, p.id)
          : onAddToProject?.(thread.id, p.id)
      })
    })
    items.push({
      label: 'Delete',
      icon: <Trash2 size={14} />,
      onClick: () => handleDeleteThread(thread.id),
      variant: 'danger'
    })
    return items
  }

  const handleRenameProject = (id: string) => {
    const proj = projects.find(p => p.id === id)
    if (proj) {
      setEditingProject({ id, name: proj.name })
    }
  }

  const handleSaveProjectRename = () => {
    if (editingProject && editingProject.name.trim()) {
      onRenameProject?.(editingProject.id, editingProject.name.trim())
    }
    setEditingProject(null)
  }

  const buildProjectMenuItems = (project: Project): ActionItem[] => {
    const items: ActionItem[] = []
    if (onTogglePinProject) {
      items.push({
        label: project.pinned ? 'Unpin' : 'Pin to top',
        icon: project.pinned ? <PinOff size={14} /> : <Pin size={14} />,
        onClick: () => onTogglePinProject(project.id),
      })
    }
    items.push(
      { label: 'Rename', icon: <Edit size={14} />, onClick: () => handleRenameProject(project.id) },
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => handleDeleteProject(project.id), variant: 'danger' },
    )
    return items
  }

  const renderThreadRow = (thread: Thread) => (
    <SortableRow
      key={thread.id}
      id={thread.id}
      className={editingThread?.id === thread.id ? 'form-inline' : `thread-link-row${thread.pinned ? ' pinned' : ''}`}
    >
      {editingThread?.id === thread.id ? (
        <>
          <input
            className="input-name"
            value={editingThread.name}
            onChange={e => setEditingThread({ ...editingThread, name: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && handleSaveRename()}
            autoFocus
          />
          <button className="btn btn-primary btn-small" onClick={handleSaveRename}>Save</button>
          <button className="btn btn-secondary btn-small" onClick={() => setEditingThread(null)}>Cancel</button>
        </>
      ) : (
        <>
          <SortableHandle label={thread.name} />
          <button
            className={`thread-link ${currentThreadId === thread.id ? 'active' : ''}`}
            onClick={() => onSelect(thread.id)}
          >
            {thread.pinned && <Pin size={12} className="pin-indicator" aria-hidden="true" />}
            {thread.name}
          </button>
          {(onRenameThread || onDeleteThread || onTogglePin) && (
            <ActionMenu items={buildThreadMenuItems(thread)} />
          )}
        </>
      )}
    </SortableRow>
  )

  return (
    <div className="sidebar-overlay" onClick={onClose}>
      <div className="sidebar" onClick={e => e.stopPropagation()}>
        <div className="sidebar-header">
          <h3>Menu</h3>
          <div className="header-actions">
            {onSettings && (
              <button className="btn-icon" onClick={onSettings} title="Settings" aria-label="Open settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              </button>
            )}
            <button className="btn-icon" onClick={onClose} aria-label="Close menu"><X size={16} /></button>
          </div>
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
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateThread()
                  // This form has no Cancel button, so Escape is the only way
                  // out without creating anything.
                  if (e.key === 'Escape') { setShowNewThread(false); setNewThreadName('') }
                }}
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
          <div className="form-inline form-inline-stacked">
            <input
              className="input-name"
              placeholder="Project name..."
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateProject()
                if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName('') }
              }}
              autoFocus
            />
            <button className="btn btn-primary btn-small" onClick={handleCreateProject}>Create</button>
          </div>
        )}

        {/* Sort control — mirrors the board so the sidebar is not a dead end */}
        {onSortChange && (
          <div className="sidebar-sort">
            <select
              value={`${(sort?.field) || 'createdAt'}_${(sort?.dir) || 'desc'}`}
              onChange={e => onSortChange(sortStateFromValue(e.target.value))}
              className="sort-select"
              aria-label="Sort threads"
            >
              {THREAD_SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Projects with threads */}
        {sortedProjectsList.map(project => {
          const projThreads = getThreadsInProject(project.id)
          const groupCollapsed = isCollapsed('project:' + project.id)
          return (
            <div key={project.id} className="project-group">
              {editingProject?.id === project.id ? (
                <div className="form-inline">
                  <input
                    className="input-name"
                    value={editingProject.name}
                    onChange={e => setEditingProject({ ...editingProject, name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleSaveProjectRename()}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-small" onClick={handleSaveProjectRename}>Save</button>
                  <button className="btn btn-secondary btn-small" onClick={() => setEditingProject(null)}>Cancel</button>
                </div>
              ) : (
                <div className="project-label-row">
                  <button
                    className="collapse-toggle"
                    onClick={() => toggleCollapse('project:' + project.id)}
                    aria-expanded={!groupCollapsed}
                    aria-label={`${groupCollapsed ? 'Expand' : 'Collapse'} ${project.name}`}
                  >
                    {groupCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <div
                    className="project-label"
                    onClick={() => onSelect(projThreads[0]?.id || '')}
                  >
                    {project.pinned && <Pin size={12} className="pin-indicator" aria-hidden="true" />}
                    {project.name} ({projThreads.length})
                    {/* Pinned threads inside this group, so pins stay visible
                        even when the group is sorted away from the top. */}
                    {(() => {
                      const n = projThreads.filter(t => t.pinned).length
                      return n > 0 ? <span className="pin-badge">📌 {n}</span> : null
                    })()}
                  </div>
                  {(onRenameProject || onDeleteProject || onTogglePinProject) && (
                    <ActionMenu items={buildProjectMenuItems(project)} />
                  )}
                </div>
              )}
              {!groupCollapsed && (
                <SortableProvider ids={projThreads.map(t => t.id)} onReorder={reorder}>
                  {projThreads.map(renderThreadRow)}
                </SortableProvider>
              )}
            </div>
          )
        })}

        {/* Unassigned threads */}
        {unassigned.length > 0 && (
          <div className="project-group">
            <div className="project-label-row">
              <button
                className="collapse-toggle"
                onClick={() => toggleCollapse(UNASSIGNED)}
                aria-expanded={!isCollapsed(UNASSIGNED)}
                aria-label={`${isCollapsed(UNASSIGNED) ? 'Expand' : 'Collapse'} unassigned threads`}
              >
                {isCollapsed(UNASSIGNED) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              <div className="project-label project-label-dim">Unassigned ({unassigned.length})
                {(() => {
                  const n = unassigned.filter(t => t.pinned).length
                  return n > 0 ? <span className="pin-badge">📌 {n}</span> : null
                })()}
              </div>
            </div>
            {!isCollapsed(UNASSIGNED) && (
              <SortableProvider ids={unassigned.map(t => t.id)} onReorder={reorder}>
                {unassigned.map(renderThreadRow)}
              </SortableProvider>
            )}
          </div>
        )}

        {onTrash && (
          <div className="sidebar-footer-link">
            <button className="btn btn-ghost btn-small" onClick={onTrash}>
              <Trash2 size={14} /> Recently deleted
            </button>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          open
          title={`Delete ${deleteConfirm.type}?`}
          message={
            deleteConfirm.type === 'thread'
              ? `Are you sure you want to delete "${deleteConfirm.name}" and all its messages? This cannot be undone.`
              : `Are you sure you want to delete "${deleteConfirm.name}"? Threads will be kept but unassigned. This cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

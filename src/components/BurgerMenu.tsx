// BurgerMenu - sidebar with threads/projects
import { useState } from 'react'
import { X, Edit, Trash2, Folder, FolderOpen, Check } from 'lucide-react'
import type { Thread, Project } from '../lib/models'
import ActionMenu, { ActionItem } from './ActionMenu'
import ConfirmDialog from './ConfirmDialog'

interface BurgerMenuProps {
  threads: Thread[]
  projects: Project[]
  currentThreadId: string
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
}

export default function BurgerMenu({
  threads,
  projects,
  currentThreadId,
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
  onDeleteProject
}: BurgerMenuProps) {
  const [newThreadName, setNewThreadName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [showNewProject, setShowNewProject] = useState('')
  const [editingThread, setEditingThread] = useState<{id: string, name: string} | null>(null)
  const [editingProject, setEditingProject] = useState<{id: string, name: string} | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'thread' | 'project'; id: string; name: string } | null>(null)

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
    setShowNewProject('')
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
    const items: ActionItem[] = [
      { label: 'Rename', icon: <Edit size={14} />, onClick: () => handleRenameThread(thread.id) },
    ]
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
    return [
      { label: 'Rename', icon: <Edit size={14} />, onClick: () => handleRenameProject(project.id) },
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => handleDeleteProject(project.id), variant: 'danger' },
    ]
  }

  return (
    <div className="sidebar-overlay" onClick={onClose}>
      <div className="sidebar" onClick={e => e.stopPropagation()}>
        <div className="sidebar-header">
          <h3>Menu</h3>
          <div className="header-actions">
            {onSettings && (
              <button className="btn-icon" onClick={onSettings} title="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              </button>
            )}
            <button className="btn-icon" onClick={onClose}><X size={16} /></button>
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
                onKeyDown={e => e.key === 'Enter' && handleCreateThread()}
                autoFocus
              />
              <button className="btn btn-primary btn-small" onClick={handleCreateThread}>Create</button>
            </div>
          ) : (
            <button className="btn btn-primary btn-small" onClick={() => setShowNewThread(true)}>+ Thread</button>
          )}
          <button className="btn btn-secondary btn-small" onClick={() => setShowNewProject(showNewProject ? '' : 'new')}>
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
                  <div 
                    className="project-label" 
                    onClick={() => onSelect(projThreads[0]?.id || '')}
                  >
                    {project.name} ({projThreads.length})
                  </div>
                  {(onRenameProject || onDeleteProject) && (
                    <ActionMenu items={buildProjectMenuItems(project)} />
                  )}
                </div>
              )}
              {projThreads.map(thread => (
                editingThread?.id === thread.id ? (
                  <div key={thread.id} className="form-inline">
                    <input
                      className="input-name"
                      value={editingThread.name}
                      onChange={e => setEditingThread({ ...editingThread, name: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleSaveRename()}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-small" onClick={handleSaveRename}>Save</button>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingThread(null)}>Cancel</button>
                  </div>
                ) : (
                  <div key={thread.id} className="thread-link-row">
                    <button
                      className={`thread-link ${currentThreadId === thread.id ? 'active' : ''}`}
                      onClick={() => onSelect(thread.id)}
                    >
                      {thread.name}
                    </button>
                    {(onRenameThread || onDeleteThread) && (
                      <ActionMenu items={buildThreadMenuItems(thread)} />
                    )}
                  </div>
                )
              ))}
            </div>
          )
        })}

        {/* Unassigned threads */}
        {unassigned.length > 0 && (
          <div className="project-group">
            <div className="project-label project-label-dim">Unassigned ({unassigned.length})</div>
            {unassigned.map(thread => (
              editingThread?.id === thread.id ? (
                <div key={thread.id} className="form-inline">
                  <input
                    className="input-name"
                    value={editingThread.name}
                    onChange={e => setEditingThread({ ...editingThread, name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleSaveRename()}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-small" onClick={handleSaveRename}>Save</button>
                  <button className="btn btn-secondary btn-small" onClick={() => setEditingThread(null)}>Cancel</button>
                </div>
              ) : (
                <div key={thread.id} className="thread-link-row">
                  <button
                    className={`thread-link ${currentThreadId === thread.id ? 'active' : ''}`}
                    onClick={() => onSelect(thread.id)}
                  >
                    {thread.name}
                  </button>
                  {(onRenameThread || onDeleteThread) && (
                    <ActionMenu items={buildThreadMenuItems(thread)} />
                  )}
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          open
          title={`Delete ${deleteConfirm.type}?`}
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
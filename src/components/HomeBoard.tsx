// HomeBoard - main threads + projects list
import { useState } from 'react'
import { Folder, Plus, Edit, Trash2, Pin, PinOff, ChevronDown, ChevronRight, GitFork } from 'lucide-react'
import type { Thread, Project } from '../lib/models'
import { sortThreads, sortProjects, sortStateFromValue, THREAD_SORT_OPTIONS, type SortState } from '../ui/sort'
import { useViewState } from '../ui/view-state'
import { SortableProvider, SortableRow, SortableHandle } from '../ui/sortable'
import { useSubmitLock } from '../ui/hooks'
import ActionMenu, { ActionItem } from './ActionMenu'
import ConfirmDialog from './ConfirmDialog'

interface HomeBoardProps {
  threads: Thread[]
  projects: Project[]
  /** Header search box. Filters threads and projects by name. */
  searchQuery?: string
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
  onTogglePin?: (id: string) => void
  onTogglePinProject?: (id: string) => void
  /** Fork a thread: full copy marked as a child via metadata.parentId. */
  onFork?: (id: string) => void
  /** A tag chip was clicked — filter the board by it. */
  onTagClick?: (tag: string) => void
}

type Editing = { type: 'thread' | 'project'; id: string; name: string }

const PROJECTS_SECTION = 'section:home-projects'

export default function HomeBoard({
  threads,
  projects,
  searchQuery = '',
  sort,
  onSortChange,
  onSelectThread,
  onProjectClick,
  onCreateThread,
  onCreateProject,
  onRenameThread,
  onDeleteThread,
  onRenameProject,
  onDeleteProject,
  onTogglePin,
  onTogglePinProject,
  onFork,
  onTagClick
}: HomeBoardProps) {
  const [newThreadName, setNewThreadName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<{ type: 'thread' | 'project'; id: string; name: string } | null>(null)

  const { view, isCollapsed, toggleCollapse, reorder } = useViewState()
  const threadRank = (t: Thread) => view[t.id]?.rank
  const projectRank = (p: Project) => view[p.id]?.rank

  const projectsCollapsed = isCollapsed(PROJECTS_SECTION)

  const sortedThreads = sortThreads(threads, sort, threadRank)
  const sortedProjects = sortProjects(projects, projectRank)

  // The header search box is always visible, so it has to do something here
  // too — not only filter messages inside a thread. It matches thread names
  // AND tags, so typing (or clicking) a tag finds every thread carrying it.
  const query = searchQuery.trim().toLowerCase()
  const visibleThreads = query
    ? sortedThreads.filter(t =>
        t.name.toLowerCase().includes(query) ||
        (t.metadata?.tags ?? []).some(tag => tag.toLowerCase().includes(query))
      )
    : sortedThreads
  const visibleProjects = query
    ? sortedProjects.filter(p => p.name.toLowerCase().includes(query))
    : sortedProjects

  const getThreadsInProject = (pid: string) =>
    threads.filter(t => t.projectIds.includes(pid))

  const tryCreateThread = useSubmitLock(showNewThread)
  const tryCreateProject = useSubmitLock(showNewProject)

  const handleCreateThread = () => {
    const name = newThreadName.trim()
    if (!name) return
    if (!tryCreateThread()) return
    onCreateThread(name)
    setNewThreadName('')
    setShowNewThread(false)
  }

  const handleCreateProject = () => {
    const name = newProjectName.trim()
    if (!name) return
    if (!tryCreateProject()) return
    onCreateProject(name)
    setNewProjectName('')
    setShowNewProject(false)
  }

  const startRename = (type: 'thread' | 'project', id: string, name: string) =>
    setEditing({ type, id, name })

  const saveRename = () => {
    if (!editing) return
    const name = editing.name.trim()
    // A blank name is rejected, so keep the field open with what was typed
    // rather than closing it and throwing the edit away silently.
    if (!name) return
    if (editing.type === 'thread') onRenameThread?.(editing.id, name)
    else onRenameProject?.(editing.id, name)
    setEditing(null)
  }

  const confirmDelete = () => {
    if (!deleting) return
    if (deleting.type === 'thread') onDeleteThread?.(deleting.id)
    else onDeleteProject?.(deleting.id)
    setDeleting(null)
  }

  const threadMenuItems = (thread: Thread): ActionItem[] => {
    const items: ActionItem[] = []
    if (onTogglePin) {
      items.push({
        label: thread.pinned ? 'Unpin' : 'Pin to top',
        icon: thread.pinned ? <PinOff size={14} /> : <Pin size={14} />,
        onClick: () => onTogglePin(thread.id),
      })
    }
    items.push(
      { label: 'Rename', icon: <Edit size={14} />, onClick: () => startRename('thread', thread.id, thread.name) },
    )
    if (onFork) {
      items.push({ label: 'Fork', icon: <GitFork size={14} />, onClick: () => onFork(thread.id) })
    }
    items.push(
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => setDeleting({ type: 'thread', id: thread.id, name: thread.name }), variant: 'danger' },
    )
    return items
  }

  const projectMenuItems = (project: Project): ActionItem[] => {
    const items: ActionItem[] = []
    if (onTogglePinProject) {
      items.push({
        label: project.pinned ? 'Unpin' : 'Pin to top',
        icon: project.pinned ? <PinOff size={14} /> : <Pin size={14} />,
        onClick: () => onTogglePinProject(project.id),
      })
    }
    items.push(
      { label: 'Rename', icon: <Edit size={14} />, onClick: () => startRename('project', project.id, project.name) },
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => setDeleting({ type: 'project', id: project.id, name: project.name }), variant: 'danger' },
    )
    return items
  }

  const renderRenameForm = () => (
    <div className="form-inline">
      <input
        className="input-name"
        value={editing?.name || ''}
        onChange={e => editing && setEditing({ ...editing, name: e.target.value })}
        onKeyDown={e => {
          if (e.key === 'Enter') saveRename()
          if (e.key === 'Escape') setEditing(null)
        }}
        autoFocus
      />
      <button className="btn btn-primary btn-small" onClick={saveRename}>Save</button>
      <button className="btn btn-secondary btn-small" onClick={() => setEditing(null)}>Cancel</button>
    </div>
  )

  return (
    <div className="container home-board">
      {/* Header with sort + new buttons */}
      <div className="home-header">
        <div className="header-left">
          <h2>Threads</h2>
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
            className="input"
            autoFocus
            placeholder="Thread name..."
            value={newThreadName}
            onChange={e => setNewThreadName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateThread()
              // Escape closes without creating, matching every other dismissable
              // surface in the app (rename forms, menus, dialogs).
              if (e.key === 'Escape') { setShowNewThread(false); setNewThreadName('') }
            }}
          />
          <button className="btn btn-primary btn-small" onClick={handleCreateThread}>Create</button>
          <button className="btn btn-ghost btn-small" onClick={() => { setShowNewThread(false); setNewThreadName('') }}>Cancel</button>
        </div>
      )}

      {/* New Project form */}
      {showNewProject && (
        <div className="new-form">
          <input
            className="input"
            autoFocus
            placeholder="Project name..."
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateProject()
              if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName('') }
            }}
          />
          <button className="btn btn-primary btn-small" onClick={handleCreateProject}>Create</button>
          <button className="btn btn-ghost btn-small" onClick={() => { setShowNewProject(false); setNewProjectName('') }}>Cancel</button>
        </div>
      )}

      {/* Threads list */}
      <div className="threads-section">
        {query && <p className="empty-text search-summary">Threads matching “{searchQuery.trim()}”: {visibleThreads.length}</p>}
        {visibleThreads.length === 0 ? (
          <p className="empty-text">
            {query ? `No threads match “${searchQuery.trim()}”.` : 'No threads yet. Create one to get started.'}
          </p>
        ) : (
          <SortableProvider
            ids={visibleThreads.map(t => t.id)}
            allIds={sortedThreads.map(t => t.id)}
            onReorder={reorder}
            className="threads-grid"
          >
            {visibleThreads.map(thread => (
              <SortableRow
                key={thread.id}
                id={thread.id}
                className={`thread-item${thread.pinned ? ' pinned' : ''}`}
              >
                <SortableHandle label={thread.name} />
                {editing?.type === 'thread' && editing.id === thread.id ? (
                  renderRenameForm()
                ) : (
                  <>
                    <button className="thread-link" onClick={() => onSelectThread(thread.id)}>
                      {thread.pinned && <Pin size={12} className="pin-indicator" aria-hidden="true" />}
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
                    {/* Tag chips sit outside the link button (no nested
                        interactives): clicking one filters the board by it. */}
                    {(thread.metadata?.tags?.length ?? 0) > 0 && (
                      <span className="thread-tags">
                        {thread.metadata!.tags.map(tag => (
                          <button
                            key={tag}
                            className="tag tag-clickable"
                            onClick={() => onTagClick?.(tag)}
                            aria-label={`Filter by tag ${tag}`}
                            title={`Filter by tag ${tag}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </span>
                    )}
                    {(onRenameThread || onDeleteThread || onTogglePin) && (
                      <ActionMenu items={threadMenuItems(thread)} />
                    )}
                  </>
                )}
              </SortableRow>
            ))}
          </SortableProvider>
        )}
      </div>

      {/* Projects section */}
      <div className="projects-section">
        <div className="collapsible-header">
          <button
            className="collapse-toggle"
            onClick={() => toggleCollapse(PROJECTS_SECTION)}
            aria-expanded={!projectsCollapsed}
            aria-label={projectsCollapsed ? 'Expand projects' : 'Collapse projects'}
          >
            {projectsCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <h3>Projects</h3>
        </div>
        {!projectsCollapsed && (
          visibleProjects.length === 0 ? (
            <p className="empty-text">
              {query ? `No projects match “${searchQuery.trim()}”.` : 'No projects yet.'}
            </p>
          ) : (
            <SortableProvider
              ids={visibleProjects.map(p => p.id)}
              allIds={sortedProjects.map(p => p.id)}
              onReorder={reorder}
              className="projects-grid"
            >
              {visibleProjects.map(project => (
                <SortableRow
                  key={project.id}
                  id={project.id}
                  className={`project-item${project.pinned ? ' pinned' : ''}`}
                >
                  <SortableHandle label={project.name} />
                  {editing?.type === 'project' && editing.id === project.id ? (
                    renderRenameForm()
                  ) : (
                    <>
                      <button className="project-link" onClick={() => onProjectClick(project.id)}>
                        <Folder size={16} />
                        {project.pinned && <Pin size={12} className="pin-indicator" aria-hidden="true" />}
                        <span className="project-name">{project.name}</span>
                        <span className="project-count">
                          {getThreadsInProject(project.id).length}
                        </span>
                      </button>
                      {(onRenameProject || onDeleteProject || onTogglePinProject) && (
                        <ActionMenu items={projectMenuItems(project)} />
                      )}
                    </>
                  )}
                </SortableRow>
              ))}
            </SortableProvider>
          )
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          open
          title={`Delete ${deleting.type}?`}
          message={
            deleting.type === 'thread'
              ? `Are you sure you want to delete "${deleting.name}" and all its messages? This cannot be undone.`
              : `Are you sure you want to delete "${deleting.name}"? Threads will be kept but unassigned. This cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
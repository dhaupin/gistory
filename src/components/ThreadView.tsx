// ThreadView - displays messages in a thread

import { useState, useEffect } from 'react'
import { Copy, Edit, Trash2, Save, MoreHorizontal, Pin, PinOff, ChevronDown, ChevronRight } from 'lucide-react'
import type { Message, Thread, Project } from '../lib/models'
import { loadDraft, saveDraft, clearDraft } from '../lib/store'
import { sortMessages, sortStateFromValue, MESSAGE_SORT_OPTIONS, type SortState } from '../ui/sort'
import { useViewState } from '../ui/view-state'
import { SortableProvider, SortableRow, SortableHandle } from '../ui/sortable'
import ActionMenu, { ActionItem } from './ActionMenu'
import ConfirmDialog from './ConfirmDialog'

interface ThreadViewProps {
  thread: Thread
  messages: Message[]
  searchQuery: string
  projects: Project[]
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  onAddMessage: (content: string) => void
  onUpdateMessage: (msgId: string, content: string) => void
  onDeleteMessage: (msgId: string) => void
  onRenameThread?: (id: string, name: string) => void
  onDeleteThread?: (id: string) => void
  onAddToProject?: (threadId: string, projectId: string) => void
  onRemoveFromProject?: (threadId: string, projectId: string) => void
  onTogglePin?: (id: string) => void
  onTogglePinMessage?: (msgId: string) => void
}

/**
 * One-line summary shown when a message is collapsed: the first few words of
 * its first non-empty line, ellipsised.
 *
 * Truncating by character count alone was not enough — a prompt that fits in
 * one short line previewed as its own complete text, so collapsing it looked
 * like it had done nothing. Bounding by word count as well guarantees the
 * preview is always visibly shorter than the body it stands in for.
 */
const PREVIEW_WORDS = 9

function previewOf(content: string): string {
  const line = content.split('\n').find(l => l.trim())?.trim() ?? content.trim()
  const words = line.split(/\s+/)
  if (words.length <= PREVIEW_WORDS) return line
  return words.slice(0, PREVIEW_WORDS).join(' ') + '…'
}

/**
 * Accessible name for the reorder grip. Deliberately longer than the visible
 * preview: a screen reader has no surrounding context to fill the ellipsis in,
 * so the grip should name more of the message than the eye is shown.
 */
function labelOf(content: string): string {
  const line = content.split('\n').find(l => l.trim())?.trim() ?? content.trim()
  return line.length > 120 ? line.slice(0, 120) + '…' : line
}

export default function ThreadView({
  thread,
  messages,
  searchQuery,
  projects,
  sort,
  onSortChange,
  onAddMessage,
  onUpdateMessage,
  onDeleteMessage,
  onRenameThread,
  onDeleteThread,
  onAddToProject,
  onRemoveFromProject,
  onTogglePin,
  onTogglePinMessage
}: ThreadViewProps) {
  const [input, setInput] = useState('')
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [editingThread, setEditingThread] = useState(false)
  const [threadName, setThreadName] = useState(thread.name)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'message' | 'thread'; id: string } | null>(null)
  const { view, isCollapsed, toggleCollapse, reorder } = useViewState()

  // Sort messages (manual drag order first, then pinned, then the active sort).
  const sortedMessages = sortMessages(
    messages,
    sort ?? { field: 'createdAt', dir: 'desc' },
    m => view[m.id]?.rank,
  )

  // Sync thread name when thread changes
  useEffect(() => {
    setThreadName(thread.name)
  }, [thread.name])

  // Load draft when switching threads
  useEffect(() => {
    setInput(loadDraft(thread.id))
  }, [thread.id])

  // Autosave draft on input change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => saveDraft(thread.id, input), 800)
    return () => clearTimeout(timer)
  }, [input, thread.id])

  const filtered = searchQuery
    ? sortedMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : sortedMessages

  // Clear draft when message is added
  const handleAdd = () => {
    if (!input.trim()) return
    onAddMessage(input.trim())
    setInput('')
    clearDraft(thread.id)
  }

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  const startEdit = (msg: Message) => {
    setEditingMsg(msg)
    setEditText(msg.content)
  }

  const saveEdit = () => {
    if (!editingMsg) return
    onUpdateMessage(editingMsg.id, editText)
    setEditingMsg(null)
    setEditText('')
  }

  const handleSaveThread = () => {
    if (threadName.trim() && threadName !== thread.name) {
      onRenameThread?.(thread.id, threadName.trim())
    }
    setEditingThread(false)
  }

  const handleDeleteThread = () => {
    setDeleteConfirm({ type: 'thread', id: thread.id })
  }

  const handleDeleteMessage = (msgId: string) => {
    setDeleteConfirm({ type: 'message', id: msgId })
  }

  const confirmDelete = () => {
    if (!deleteConfirm) return
    if (deleteConfirm.type === 'message') {
      onDeleteMessage(deleteConfirm.id)
    } else {
      onDeleteThread?.(deleteConfirm.id)
    }
    setDeleteConfirm(null)
  }

  const buildMenuItems = (): ActionItem[] => {
    const items: ActionItem[] = []
    if (onTogglePin) {
      items.push({
        label: thread.pinned ? 'Unpin' : 'Pin to top',
        icon: thread.pinned ? <PinOff size={14} /> : <Pin size={14} />,
        onClick: () => onTogglePin(thread.id),
      })
    }
    items.push(
      { label: 'Rename', icon: <Edit size={14} />, onClick: () => setEditingThread(true) },
    )
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
    items.push({ label: 'Delete', icon: <Trash2 size={14} />, onClick: handleDeleteThread, variant: 'danger' })
    return items
  }

  return (
    <div className="container">
      <div className="thread-header">
        {editingThread ? (
          <div className="form-inline">
            <input
              className="input-name"
              value={threadName}
              onChange={e => setThreadName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveThread()}
              autoFocus
            />
            <button className="btn btn-primary btn-small" onClick={handleSaveThread}>Save</button>
            <button className="btn btn-secondary btn-small" onClick={() => { setEditingThread(false); setThreadName(thread.name) }}>Cancel</button>
          </div>
        ) : (
          <>
            <div className="thread-title-row">
              {thread.pinned && <Pin size={14} className="pin-indicator" role="img" aria-label="Pinned" />}
              <h3 className="thread-title">{thread.name}</h3>
              {onSortChange && (
                <select 
                  value={`${sort?.field || 'createdAt'}_${sort?.dir || 'desc'}`}
                  onChange={e => onSortChange(sortStateFromValue(e.target.value))}
                  className="sort-select"
                  aria-label="Sort messages"
                >
                  {MESSAGE_SORT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
              {(onRenameThread || onDeleteThread || onTogglePin) && (
                <ActionMenu items={buildMenuItems()} />
              )}
            </div>
          </>
        )}
        
        {/* Display metadata - tags, category, rating */}
        {thread.metadata && (
          <div className="thread-meta">
            {thread.metadata.tags?.length > 0 && (
              <div className="meta-tags">
                {thread.metadata.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            )}
            {thread.metadata.category && (
              <span className="meta-category">{thread.metadata.category}</span>
            )}
            {thread.metadata.rating && (
              <span className="meta-rating">{'★'.repeat(thread.metadata.rating)}</span>
            )}
          </div>
        )}
      </div>

      <div className="input-card">
        <textarea
          className="input-area"
          placeholder="Write your prompt here..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && e.ctrlKey && handleAdd()}
        />
        <div className="input-actions">
          <button 
            className="btn btn-ghost btn-small" 
            onClick={() => { setInput(''); clearDraft(thread.id) }}
            title="Clear draft"
          >
            <Trash2 size={14} />
          </button>
          <button 
            className="btn btn-ghost btn-small" 
            onClick={() => handleCopy(input)}
            disabled={!input}
            title="Copy input"
          >
            <Copy size={14} />
          </button>
          <button className="btn btn-primary btn-small" onClick={handleAdd} title="Save (Ctrl+Enter)">
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      <SortableProvider
        ids={filtered.map(m => m.id)}
        allIds={sortedMessages.map(m => m.id)}
        onReorder={reorder}
        className="messages-list"
      >
        {/* The header search keeps filtering after you open a thread, so say so
            rather than silently hiding messages. */}
        {searchQuery.trim() && sortedMessages.length > 0 && (
          <p className="empty-text search-summary">
            {filtered.length} of {sortedMessages.length} messages match “{searchQuery.trim()}”
          </p>
        )}
        {filtered.length === 0 && (
          <p className="empty-text">
            {searchQuery.trim()
              ? `No messages match “${searchQuery.trim()}”.`
              : 'No messages yet.'}
          </p>
        )}
        {filtered.map(msg => {
          const collapsedMsg = isCollapsed(`message:${msg.id}`)
          return (
            <SortableRow key={msg.id} id={msg.id} className={`message-card${msg.pinned ? ' pinned' : ''}`}>
              {editingMsg?.id === msg.id ? (
                <div className="message-edit">
                  <textarea
                    className="input-area"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                  />
                  <div className="message-actions">
                    <button className="btn btn-primary btn-small" onClick={saveEdit}>
                      Save
                    </button>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingMsg(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="message-content">
                  <div className="message-head">
                    <SortableHandle label={labelOf(msg.content)} />
                    <button
                      className="collapse-toggle"
                      onClick={() => toggleCollapse(`message:${msg.id}`)}
                      aria-expanded={!collapsedMsg}
                      aria-label={collapsedMsg ? 'Expand message' : 'Collapse message'}
                    >
                      {collapsedMsg ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {msg.pinned && <Pin size={12} className="pin-indicator" role="img" aria-label="Pinned" />}
                    <div className="message-actions">
                      {onTogglePinMessage && (
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => onTogglePinMessage(msg.id)}
                          aria-label={msg.pinned ? 'Unpin message' : 'Pin message'}
                          title={msg.pinned ? 'Unpin message' : 'Pin message'}
                        >
                          {msg.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                      )}
                      <button 
                        className="btn btn-secondary btn-small" 
                        onClick={() => handleCopy(msg.content)}
                      >
                        <Copy size={14} /> Copy
                      </button>
                      <button 
                        className="btn btn-secondary btn-small" 
                        onClick={() => startEdit(msg)}
                      >
                        <Edit size={14} /> Edit
                      </button>
                      <button 
                        className="btn btn-danger btn-small" 
                        onClick={() => handleDeleteMessage(msg.id)}
                        aria-label="Delete message"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {collapsedMsg ? (
                    <p className="message-preview">{previewOf(msg.content)}</p>
                  ) : (
                    <pre>{msg.content}</pre>
                  )}
                </div>
              )}
            </SortableRow>
          )
        })}
        </SortableProvider>

      {deleteConfirm && (
        <ConfirmDialog
          open
          title={deleteConfirm.type === 'message' ? 'Delete message?' : 'Delete thread?'}
          message={deleteConfirm.type === 'message' 
            ? 'This will permanently delete this message.' 
            : 'This will permanently delete this thread and all its messages.'}
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

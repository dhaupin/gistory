// ThreadView - displays messages in a thread

import { useState, useEffect } from 'react'
import { Copy, Edit, Trash2, Save, Pin, PinOff, ChevronDown, ChevronRight, Tag, X, GitFork, Star, Archive, ArchiveRestore, Check, PencilLine } from 'lucide-react'
import type { Message, Thread, Project, ThreadStatus } from '../lib/models'
import { loadDraft, saveDraft, clearDraft } from '../lib/store'
import { sortMessages, sortStateFromValue, MESSAGE_SORT_OPTIONS, type SortState } from '../ui/sort'
import { createdEditedStamp } from '../ui/relative-time'
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
  /** Replace the thread's tag list (called with the already-updated list). */
  onSetTags?: (id: string, tags: string[]) => void
  /** Set the working status (draft/active/archived) of the thread. */
  onSetStatus?: (id: string, status: ThreadStatus) => void
  /** Set (or clear, with undefined) the 1–5 quality rating. */
  onSetRating?: (id: string, rating: number | undefined) => void
  /** Fork this thread: a full copy marked as a child via metadata.parentId. */
  onFork?: (id: string) => void
  /** A copy of the thread's content just happened (usage counter + 1). */
  onUseThread?: (id: string) => void
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
 * `{{variable}}` placeholders turn a copied prompt into a fill-in form. The
 * regex is deliberately tolerant of whitespace and unicode names; the closing
 * delimiter forbids nesting, so `{{a {{b}} c}}` reads as two placeholders.
 */
const TEMPLATE_VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

/** Unique variable names in a prompt, first-appearance order, deduped case-insensitively. */
function templateVars(content: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of content.matchAll(TEMPLATE_VAR_RE)) {
    const name = m[1].trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/**
 * Substitute filled values for their placeholders. Values are keyed by
 * lowercase variable name; a placeholder with no (or an empty) value is left
 * in the copy as written, so nothing is silently dropped from the prompt.
 */
function fillTemplate(content: string, values: Record<string, string>): string {
  return content.replace(TEMPLATE_VAR_RE, (whole, name: string) => {
    const value = values[name.trim().toLowerCase()]
    return value ? value : whole
  })
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
  onTogglePinMessage,
  onSetTags,
  onSetStatus,
  onSetRating,
  onFork,
  onUseThread
}: ThreadViewProps) {
  const [input, setInput] = useState('')
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [editingThread, setEditingThread] = useState(false)
  const [threadName, setThreadName] = useState(thread.name)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'message' | 'thread'; id: string } | null>(null)
  // Tag editing: one inline input at a time, next to the existing chips.
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')
  // Template fill-in: which placeholders to collect, and what to replace them with.
  const [fillVars, setFillVars] = useState<{ names: string[]; content: string } | null>(null)
  const [fillValues, setFillValues] = useState<Record<string, string>>({})
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
    const names = templateVars(content)
    if (names.length === 0) {
      navigator.clipboard.writeText(content)
      onUseThread?.(thread.id)
      return
    }
    // The prompt is a template: collect values first, then copy the result.
    setFillValues({})
    setFillVars({ names, content })
  }

  const confirmFill = () => {
    if (!fillVars) return
    navigator.clipboard.writeText(fillTemplate(fillVars.content, fillValues))
    setFillVars(null)
    setFillValues({})
    onUseThread?.(thread.id)
  }

  const commitTag = () => {
    const value = tagInput.trim()
    setAddingTag(false)
    setTagInput('')
    if (!value) return
    onSetTags?.(thread.id, [...(thread.metadata?.tags ?? []), value])
  }

  const removeTag = (tag: string) => {
    onSetTags?.(thread.id, (thread.metadata?.tags ?? []).filter(t => t !== tag))
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
    if (onFork) {
      items.push({ label: 'Fork', icon: <GitFork size={14} />, onClick: () => onFork(thread.id) })
    }
    if (onSetStatus) {
      const status = thread.metadata?.status
      if (status === 'archived') {
        items.push({
          label: 'Restore from archive',
          icon: <ArchiveRestore size={14} />,
          onClick: () => onSetStatus(thread.id, 'active'),
        })
      } else {
        if (status === 'draft') {
          items.push({
            label: 'Mark as active',
            icon: <Check size={14} />,
            onClick: () => onSetStatus(thread.id, 'active'),
          })
        } else {
          items.push({
            label: 'Mark as draft',
            icon: <PencilLine size={14} />,
            onClick: () => onSetStatus(thread.id, 'draft'),
          })
        }
        items.push({
          label: 'Archive',
          icon: <Archive size={14} />,
          onClick: () => onSetStatus(thread.id, 'archived'),
        })
      }
    }
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
              <span
                className="stamp"
                title={`Created ${new Date(thread.createdAt).toLocaleString()}${thread.updatedAt ? ` · Edited ${new Date(thread.updatedAt).toLocaleString()}` : ''}`}
              >
                {createdEditedStamp(thread.createdAt, thread.updatedAt)}
              </span>
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
        
        {/* Metadata row: editable tags (when the app passes onSetTags), then
            the read-only category/rating/usage stamps. */}
        {(thread.metadata || onSetTags) && (
          <div className="thread-meta">
            <div className="meta-tags">
              {(thread.metadata?.tags ?? []).map(tag => (
                <span key={tag} className="tag">
                  {tag}
                  {onSetTags && (
                    <button
                      className="tag-remove"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      title={`Remove tag ${tag}`}
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {onSetTags && !addingTag && (
                <button className="tag-add" onClick={() => setAddingTag(true)}>
                  <Tag size={10} /> tag
                </button>
              )}
              {onSetTags && addingTag && (
                <input
                  className="tag-input"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitTag()
                    if (e.key === 'Escape') { setAddingTag(false); setTagInput('') }
                  }}
                  onBlur={commitTag}
                  placeholder="new tag"
                  aria-label="New tag name"
                  autoFocus
                />
              )}
            </div>
            {thread.metadata?.status === 'draft' && (
              <span className="meta-status">draft</span>
            )}
            {thread.metadata?.category && (
              <span className="meta-category">{thread.metadata.category}</span>
            )}
            {onSetRating ? (
              <span className="meta-rating-edit" role="group" aria-label="Thread rating">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    className="star-btn"
                    onClick={() => onSetRating(thread.id, thread.metadata?.rating === n ? undefined : n)}
                    aria-label={`Rate ${n} of 5${thread.metadata?.rating === n ? ' (currently set, click to clear)' : ''}`}
                    title={`Rate ${n} of 5`}
                  >
                    <Star size={13} className={n <= (thread.metadata?.rating ?? 0) ? 'star filled' : 'star'} />
                  </button>
                ))}
              </span>
            ) : (
              thread.metadata?.rating && (
                <span className="meta-rating">{'★'.repeat(thread.metadata.rating)}</span>
              )
            )}
            {!!thread.metadata?.usageCount && (
              <span className="meta-usage">{thread.metadata.usageCount} uses</span>
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
            aria-label="Clear draft"
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
                    <span
                      className="stamp"
                      title={`Created ${new Date(msg.createdAt).toLocaleString()}${msg.updatedAt ? ` · Edited ${new Date(msg.updatedAt).toLocaleString()}` : ''}`}
                    >
                      {createdEditedStamp(msg.createdAt, msg.updatedAt)}
                    </span>
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

      {fillVars && (
        <div
          className="modal-overlay"
          onClick={() => setFillVars(null)}
          onKeyDown={e => { if (e.key === 'Escape') setFillVars(null) }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Fill in template variables"
          >
            <div className="modal-header">
              <h3>Fill in the template</h3>
              <button className="close-btn" onClick={() => setFillVars(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body template-vars">
              {fillVars.names.map((name, i) => (
                <label key={name} className="template-var-row">
                  <span className="template-var-name">{'{{' + name + '}}'}</span>
                  <input
                    className="input"
                    value={fillValues[name.toLowerCase()] ?? ''}
                    onChange={e =>
                      setFillValues(prev => ({ ...prev, [name.toLowerCase()]: e.target.value }))
                    }
                    aria-label={`Value for ${name}`}
                    autoFocus={i === 0}
                  />
                </label>
              ))}
              <p className="empty-text template-hint">
                Placeholders you leave empty are copied exactly as written.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-small" onClick={() => setFillVars(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-small" onClick={confirmFill}>
                <Copy size={14} /> Copy filled
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

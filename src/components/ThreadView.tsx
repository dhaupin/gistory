// ThreadView - displays messages in a thread

import { useState, useEffect, useRef } from 'react'
import { Copy, Edit, Trash2, Save, Pin, PinOff, ChevronDown, ChevronRight, Tag, X, GitFork, Star, Archive, ArchiveRestore, Check, PencilLine, Eraser, Braces, ListChecks, ImagePlus } from 'lucide-react'
import type { Message, MessageAttachment, Thread, Project, ThreadStatus } from '../lib/models'
import { lookupVariable, type Variables } from '../lib/variables'
import { attachmentUrl, buildAttachment } from '../lib/attachments'
import { getAttachmentBytes } from '../sync/idb'
import { loadDraft, saveDraft, clearDraft } from '../lib/store'
import { sortMessages, sortStateFromValue, MESSAGE_SORT_OPTIONS, type SortState } from '../ui/sort'
import { createdEditedStamp, stampTitle } from '../ui/relative-time'
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
  /** Add a message (attachments = built IMAGE metadata; bytes already stored
   *  device-local by the caller via buildAttachment). */
  onAddMessage: (content: string, attachments?: MessageAttachment[]) => void
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
  /** IANA zone for the displayed created/edited stamps (absent = device). */
  timeZone?: string
  /** A copy of the thread's content just happened (usage counter + 1). */
  onUseThread?: (id: string) => void
  /** Saved {{variables}} (global + all thread pools) for fill-in prefill. */
  variables?: Variables
  /** Open the variables manager (App-level modal). */
  onManageVariables?: () => void
  /** Bulk delete a set of messages in one tombstone shot. */
  onDeleteMessages?: (ids: string[]) => void
  /** Bulk pin/unpin a set of messages. */
  onSetMessagesPinned?: (ids: string[], pinned: boolean) => void
}

/**
 * One message's image strip. Bytes are DEVICE-LOCAL (metadata is what syncs),
 * so the render has three honest states per attachment:
 *   pixels  -> the img (object URL revoked on unmount)
 *   missing -> a named, boring line: the image lives on the device that
 *              added it, nothing pretends otherwise
 *   loading -> the byte read is in flight (one read per id, never per paint)
 */
function MessageImages({ attachments }: { attachments: MessageAttachment[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [missing, setMissing] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    const toRevoke: string[] = []
    for (const att of attachments) {
      void getAttachmentBytes(att.id).then(bytes => {
        if (!alive) return
        if (!bytes) {
          setMissing(prev => ({ ...prev, [att.id]: true }))
          return
        }
        const url = attachmentUrl(bytes)
        if (url) {
          toRevoke.push(url)
          setUrls(prev => ({ ...prev, [att.id]: url }))
        } else {
          setMissing(prev => ({ ...prev, [att.id]: true }))
        }
      })
    }
    return () => {
      alive = false
      for (const url of toRevoke) {
        try { URL.revokeObjectURL(url) } catch { /* already gone */ }
      }
    }
  }, [attachments])

  return (
    <div className="att-strip">
      {attachments.map(att =>
        urls[att.id] ? (
          <img key={att.id} className="att-img" src={urls[att.id]} alt={att.name} loading="lazy" />
        ) : missing[att.id] ? (
          <span key={att.id} className="att-missing" role="img" aria-label={`${att.name} - stored on the device that added it`} title={att.name}>
            {att.name} · image is on the device that added it
          </span>
        ) : (
          <span key={att.id} className="att-missing" aria-busy="true">loading…</span>
        ),
      )}
    </div>
  )
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
  onUseThread,
  timeZone,
  variables,
  onManageVariables,
  onDeleteMessages,
  onSetMessagesPinned
}: ThreadViewProps) {
  const [input, setInput] = useState('')
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [editingThread, setEditingThread] = useState(false)
  const [threadName, setThreadName] = useState(thread.name)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'message' | 'thread' | 'draft'; id: string } | null>(null)
  // Tag editing: one inline input at a time, next to the existing chips.
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')
  // Template fill-in: which placeholders to collect, and what to replace them with.
  const [fillVars, setFillVars] = useState<{ names: string[]; content: string } | null>(null)
  const [fillValues, setFillValues] = useState<Record<string, string>>({})
  // Multi-select (bulk delete / pin). Selected ids only matter while the mode
  // is on; leaving the mode clears them.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkConfirm, setBulkConfirm] = useState(false)
  // Composing images: built metadata + one session-live preview URL each.
  // The bytes are ALREADY device-local (buildAttachment stored them); the
  // metadata joins the message on Save, which is what rides the sync payload.
  const [pendingImgs, setPendingImgs] = useState<{ meta: MessageAttachment; url: string }[]>([])
  const [attachNote, setAttachNote] = useState<string | null>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const { view, isCollapsed, toggleCollapse, reorder } = useViewState()

  const toggleSelected = (id: string) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const leaveSelectMode = () => {
    setSelectMode(false)
    setSelected([])
  }

  const confirmBulkDelete = () => {
    onDeleteMessages?.(selected.filter(id => !!messages.find(m => m.id === id)))
    leaveSelectMode()
    setBulkConfirm(false)
  }

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
    if (!input.trim() && pendingImgs.length === 0) return
    onAddMessage(input.trim(), pendingImgs.map(p => p.meta))
    setInput('')
    for (const p of pendingImgs) {
      try { URL.revokeObjectURL(p.url) } catch { /* already gone */ }
    }
    setPendingImgs([])
    clearDraft(thread.id)
  }

  /** Pick + build image attachments (the byte store runs here; the message
   *  edit and its updatedAt bump stay the caller's job, same as pins). */
  const handlePickImages = async (files: FileList | null) => {
    if (!files || !files.length) return
    const opened: { meta: MessageAttachment; url: string }[] = []
    let refused = 0
    for (const file of Array.from(files)) {
      let dims: { width?: number; height?: number } = {}
      try {
        const bitmap = await createImageBitmap(file)
        dims = { width: bitmap.width, height: bitmap.height }
        bitmap.close()
      } catch {
        /* no dims is fine - metadata still records the size */
      }
      const meta = await buildAttachment(
        { name: file.name, mime: file.type || 'image/png', bytes: file, ...dims },
        pendingImgs.map(p => p.meta).concat(opened.map(o => o.meta)),
      )
      if (!meta) {
        refused++
        continue
      }
      const preview = attachmentUrl(file)
      opened.push({ meta, url: preview ?? '' })
    }
    if (opened.length) {
      setAttachNote(null)
      setPendingImgs(prev => [...prev, ...opened])
    }
    if (refused) {
      setAttachNote(refused === files.length && !opened.length
        ? 'This device could not store that image (over 4 MB, over 6 on one message, or no local storage).'
        : `${refused} image${refused === 1 ? '' : 's'} could not be stored here (over 4 MB, over 6 on one message, or no local storage).`)
    }
  }

  const removePendingImg = (id: string) => {
    setPendingImgs(prev => {
      const gone = prev.find(p => p.meta.id === id)
      if (gone) {
        try { URL.revokeObjectURL(gone.url) } catch { /* already gone */ }
        // The bytes were stored when built; a composer removal is a real
        // cancel, so drop them now (deleteAttachmentBytes is idempotent).
        void import('../sync/idb').then(m => m.deleteAttachmentBytes(id))
      }
      return prev.filter(p => p.meta.id !== id)
    })
  }

  const handleCopy = (content: string) => {
    const names = templateVars(content)
    if (names.length === 0) {
      navigator.clipboard.writeText(content)
      onUseThread?.(thread.id)
      return
    }
    // The prompt is a template: collect values first, then copy the result.
    // Saved variables prefill the form — the thread's own pool wins over the
    // global one — so filling is an edit-in-place, not a retype.
    const prefill: Record<string, string> = {}
    for (const name of names) {
      const saved = variables ? lookupVariable(variables, thread.id, name) : null
      if (saved?.value) prefill[name.toLowerCase()] = saved.value
    }
    setFillValues(prefill)
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

  // The edit textarea grows to the height of the text it holds. The composer
  // can stay a fixed box (you type into it), but the editor replaces an
  // existing message whose rendered height is already there to match: it opens
  // at the text's height instead of squashing it into the 60px composer box.
  const editAreaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = editAreaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [editText, editingMsg])

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
    } else if (deleteConfirm.type === 'draft') {
      setInput('')
      clearDraft(thread.id)
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
    if (onDeleteMessages) {
      items.push({
        label: 'Select messages',
        icon: <ListChecks size={14} />,
        onClick: () => { setSelectMode(true); setSelected([]) },
      })
    }
    if (onManageVariables) {
      items.push({
        label: 'Manage {{variables}}',
        icon: <Braces size={14} />,
        onClick: onManageVariables,
      })
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
                title={`Created ${stampTitle(thread.createdAt, timeZone)}${thread.updatedAt ? ` · Edited ${stampTitle(thread.updatedAt, timeZone)}` : ''}`}
              >
                {createdEditedStamp(thread.createdAt, thread.updatedAt, timeZone)}
              </span>
              {onDeleteMessages && (
                <button
                  className={`btn btn-ghost btn-small bulk-toggle${selectMode ? ' on' : ''}`}
                  onClick={() => (selectMode ? leaveSelectMode() : setSelectMode(true))}
                  aria-pressed={selectMode}
                  aria-label="Select messages"
                  title="Select messages"
                >
                  <ListChecks size={14} />
                </button>
              )}
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
        {/* Image picker: bytes are stored device-local ON PICK (buildAttachment),
            the metadata rides the message on Save, and only the metadata syncs. */}
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => { void handlePickImages(e.target.files); e.currentTarget.value = '' }}
        />
        <textarea
          className="input-area"
          placeholder="Write your prompt here..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && e.ctrlKey && handleAdd()}
        />
        {pendingImgs.length > 0 && (
          <div className="att-strip att-strip-composer">
            {pendingImgs.map(p => (
              <figure key={p.meta.id} className="att-thumb">
                <img src={p.url} alt={p.meta.name} title={`${p.meta.name} (${Math.round(p.meta.bytes / 1024)} KB)`} />
                <button
                  className="att-remove"
                  onClick={() => removePendingImg(p.meta.id)}
                  aria-label={`Remove image ${p.meta.name} from this message`}
                  title="Remove image"
                >
                  <X size={12} />
                </button>
              </figure>
            ))}
          </div>
        )}
        <div className="input-actions">
          <button
            className="btn btn-ghost btn-small"
            onClick={() => imgInputRef.current?.click()}
            aria-label="Attach images"
            title="Attach images (stored on this device; the metadata syncs)"
          >
            <ImagePlus size={14} />
          </button>
          {/* Icon-only, ghost, in the same order as every message row:
              Clear · Copy · Save. A message row's fourth slot (Delete) has no
              composer counterpart — the composer's destructive is Clear. */}
          <button 
            className="btn btn-ghost btn-small" 
            onClick={() => { setDeleteConfirm({ type: 'draft', id: thread.id }) }}
            aria-label="Clear draft"
            title="Clear draft"
          >
            <Eraser size={14} />
          </button>
          <button 
            className="btn btn-ghost btn-small" 
            onClick={() => handleCopy(input)}
            disabled={!input}
            aria-label="Copy input"
            title="Copy input"
          >
            <Copy size={14} />
          </button>
          <button className="btn btn-primary btn-small" onClick={handleAdd} title="Save (Ctrl+Enter)">
            <Save size={14} /> Save
          </button>
        </div>
        {attachNote && (
          <p className="composer-hint att-note" role="status">{attachNote}</p>
        )}
        {/* Variables have no dedicated button by design — they are typed inline
            as {{name}} and the fill-in form appears on Copy. That is invisible
            until someone types one, so the empty/blank composer whispers how. */}
        {(input.trim() === '' || (fillVars === null && input.includes('{{'))) && (
          <p className="composer-hint">
            Placeholders like <code>{'{{language}}'}</code> become a fill-in form when you copy the prompt.
          </p>
        )}
      </div>

      {/* Bulk action bar (multi-select mode): picks up only this thread's
          visible messages, so the actions match what the user picked. */}
      {selectMode && (
        <div className="bulk-bar" role="toolbar" aria-label="Bulk message actions">
          <span className="bulk-count">{selected.length} selected</span>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => setSelected(filtered.map(m => m.id))}
            disabled={!filtered.length}
          >
            Select all
          </button>
          {onSetMessagesPinned && (
            <>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => { onSetMessagesPinned(selected, true); leaveSelectMode() }}
                disabled={!selected.length}
              >
                Pin
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => { onSetMessagesPinned(selected, false); leaveSelectMode() }}
                disabled={!selected.length}
              >
                Unpin
              </button>
            </>
          )}
          {onDeleteMessages && (
            <button
              className="btn btn-danger btn-small"
              onClick={() => { if (selected.length) setBulkConfirm(true) }}
              disabled={!selected.length}
            >
              Delete
            </button>
          )}
          <button className="btn btn-secondary btn-small" onClick={leaveSelectMode}>
            Done
          </button>
        </div>
      )}

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
                    className="input-area edit-area"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    ref={editAreaRef}
                    autoFocus
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
                    {selectMode ? (
                      <input
                        type="checkbox"
                        className="msg-select"
                        checked={selected.includes(msg.id)}
                        onChange={() => toggleSelected(msg.id)}
                        aria-label={`Select message starting “${labelOf(msg.content).slice(0, 40)}…”`}
                      />
                    ) : (
                      <SortableHandle label={labelOf(msg.content)} />
                    )}
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
                      title={`Created ${stampTitle(msg.createdAt, timeZone)}${msg.updatedAt ? ` · Edited ${stampTitle(msg.updatedAt, timeZone)}` : ''}`}
                    >
                      {createdEditedStamp(msg.createdAt, msg.updatedAt, timeZone)}
                    </span>
                    <div className="message-actions">
                      {onTogglePinMessage && (
                        <button
                          className="btn btn-ghost btn-small"
                          onClick={() => onTogglePinMessage(msg.id)}
                          aria-label={msg.pinned ? 'Unpin message' : 'Pin message'}
                          title={msg.pinned ? 'Unpin message' : 'Pin message'}
                        >
                          {msg.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                      )}
                      <button 
                        className="btn btn-ghost btn-small" 
                        onClick={() => handleCopy(msg.content)}
                        aria-label="Copy message"
                        title="Copy message"
                      >
                        <Copy size={14} />
                      </button>
                      <button 
                        className="btn btn-ghost btn-small" 
                        onClick={() => startEdit(msg)}
                        aria-label="Edit message"
                        title="Edit message"
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        className="btn btn-danger btn-small" 
                        onClick={() => handleDeleteMessage(msg.id)}
                        aria-label="Delete message"
                        title="Delete message"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {collapsedMsg ? (
                    <p className="message-preview">
                      {previewOf(msg.content)}
                      {!!msg.attachments?.length && ` + ${msg.attachments.length} image${msg.attachments.length === 1 ? '' : 's'}`}
                    </p>
                  ) : (
                    <>
                      {msg.content && <pre>{msg.content}</pre>}
                      {!!msg.attachments?.length && <MessageImages attachments={msg.attachments} />}
                    </>
                  )}
                </div>
              )}
            </SortableRow>
          )
        })}
        </SortableProvider>

      {bulkConfirm && (
        <ConfirmDialog
          open
          title={`Delete ${selected.length} message${selected.length === 1 ? '' : 's'}?`}
          message={`This will permanently delete the ${selected.length} selected message${selected.length === 1 ? '' : 's'}.`}
          confirmLabel="Delete"
          destructive
          onConfirm={confirmBulkDelete}
          onCancel={() => setBulkConfirm(false)}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          open
          title={deleteConfirm.type === 'message' ? 'Delete message?' : deleteConfirm.type === 'draft' ? 'Clear the draft?' : 'Delete thread?'}
          message={deleteConfirm.type === 'message' 
            ? 'This will permanently delete this message.' 
            : deleteConfirm.type === 'draft'
              ? 'This wipes everything written in the composer. It cannot be undone.'
              : 'This will permanently delete this thread and all its messages.'}
          confirmLabel={deleteConfirm.type === 'draft' ? 'Clear draft' : 'Delete'}
          destructive
          // Drafts never sync, so wiping the composer is device-local even
          // though the dialog defaults to the chain-wide note.
          chainWide={deleteConfirm.type !== 'draft'}
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

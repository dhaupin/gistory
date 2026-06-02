// ThreadView - displays messages in a thread

import { useState, useEffect } from 'react'
import { Copy, Edit, Trash2, Save, MoreHorizontal } from 'lucide-react'
import type { Message, Thread, Project } from '../lib/models'
import { loadDraft, saveDraft, clearDraft } from '../lib/store'
import ActionMenu, { ActionItem } from './ActionMenu'

interface ThreadViewProps {
  thread: Thread
  messages: Message[]
  searchQuery: string
  projects: Project[]
  onAddMessage: (content: string) => void
  onUpdateMessage: (msgId: string, content: string) => void
  onDeleteMessage: (msgId: string) => void
  onRenameThread?: (id: string, name: string) => void
  onDeleteThread?: (id: string) => void
  onAddToProject?: (threadId: string, projectId: string) => void
  onRemoveFromProject?: (threadId: string, projectId: string) => void
}

export default function ThreadView({
  thread,
  messages,
  searchQuery,
  projects,
  onAddMessage,
  onUpdateMessage,
  onDeleteMessage,
  onRenameThread,
  onDeleteThread,
  onAddToProject,
  onRemoveFromProject
}: ThreadViewProps) {
  const [input, setInput] = useState(() => loadDraft(thread.id))
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [editingThread, setEditingThread] = useState(false)
  const [threadName, setThreadName] = useState(thread.name)

  // Sync thread name when thread prop changes
  useEffect(() => {
    setThreadName(thread.name)
  }, [thread.name])

  // Autosave draft on input change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => saveDraft(thread.id, input), 800)
    return () => clearTimeout(timer)
  }, [input, thread.id])

  const filtered = searchQuery
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

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
    if (confirm('Delete this thread and all messages?')) {
      onDeleteThread?.(thread.id)
    }
  }

  const buildMenuItems = (): ActionItem[] => {
    const items: ActionItem[] = [
      { label: 'Rename', icon: '✏️', onClick: () => setEditingThread(true) },
    ]
    // Add to project
    const notIn = projects.filter(p => !thread.projectIds.includes(p.id))
    notIn.forEach(p => {
      items.push({ label: `Add to "${p.name}"`, icon: '📁', onClick: () => onAddToProject?.(thread.id, p.id) })
    })
    // Remove from project
    const inProj = projects.filter(p => thread.projectIds.includes(p.id))
    inProj.forEach(p => {
      items.push({ label: `Remove from "${p.name}"`, icon: '📁', onClick: () => onRemoveFromProject?.(thread.id, p.id) })
    })
    items.push({ label: 'Delete', icon: '🗑️', onClick: handleDeleteThread, variant: 'danger' })
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
            <h3 className="thread-title">{thread.name}</h3>
            {(onRenameThread || onDeleteThread) && (
              <ActionMenu items={buildMenuItems()} />
            )}
          </>
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
          <button className="btn btn-primary btn-small" onClick={handleAdd}>
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      <div className="messages-list">
        {filtered.map(msg => (
          <div key={msg.id} className="message-card">
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
                <pre>{msg.content}</pre>
                <div className="message-actions">
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
                    onClick={() => onDeleteMessage(msg.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
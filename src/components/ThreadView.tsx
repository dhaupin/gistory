// ThreadView - displays messages in a thread

import { useState, useEffect } from 'react'
import { Copy, Edit, Trash2, Save } from 'lucide-react'
import type { Message, Thread } from '../lib/models'
import { loadDraft, saveDraft, clearDraft } from '../lib/store'

interface ThreadViewProps {
  thread: Thread
  messages: Message[]
  searchQuery: string
  onAddMessage: (content: string) => void
  onUpdateMessage: (msgId: string, content: string) => void
  onDeleteMessage: (msgId: string) => void
}

export default function ThreadView({
  thread,
  messages,
  searchQuery,
  onAddMessage,
  onUpdateMessage,
  onDeleteMessage
}: ThreadViewProps) {
  const [input, setInput] = useState(() => loadDraft(thread.id))
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')

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

  return (
    <div className="container">
      <div className="thread-header">
        <h3 className="thread-title">{thread.name}</h3>
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
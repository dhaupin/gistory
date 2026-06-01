// ThreadView - displays messages in a thread

import { useState } from 'react'
import type { Message, Thread } from '../lib/models'

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
  const [input, setInput] = useState('')
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')

  const filtered = searchQuery
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  const handleAdd = () => {
    if (!input.trim()) return
    onAddMessage(input.trim())
    setInput('')
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
          <button className="btn btn-primary" onClick={handleAdd}>
            Save
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
                    📋 Copy
                  </button>
                  <button 
                    className="btn btn-secondary btn-small" 
                    onClick={() => startEdit(msg)}
                  >
                    ✏️ Edit
                  </button>
                  <button 
                    className="btn btn-danger btn-small" 
                    onClick={() => onDeleteMessage(msg.id)}
                  >
                    🗑️
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
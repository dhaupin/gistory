// EmptyState Component
import { useState } from 'react'

interface EmptyStateProps {
  onCreate: (name: string) => void
}

export default function EmptyState({ onCreate }: EmptyStateProps) {
  const [name, setName] = useState('')
  const trimmed = name.trim()

  const create = () => {
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
  }

  return (
    <div className="empty-state">
      <h2>Welcome to Gistory</h2>
      <p>Store and organize your prompts</p>
      <input 
        className="input-name"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Thread name..."
        onKeyDown={e => e.key === 'Enter' && create()}
      />
      <button className="btn btn-primary" onClick={create} disabled={!trimmed}>
        Create first thread
      </button>
    </div>
  )
}
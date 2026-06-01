// EmptyState Component
import { useState } from 'react'

interface EmptyStateProps {
  onCreate: (name: string) => void
}

export default function EmptyState({ onCreate }: EmptyStateProps) {
  const [name, setName] = useState('')

  return (
    <div className="empty-state">
      <h2>Welcome to Gistory</h2>
      <p>Store and organize your prompts</p>
      <input 
        className="input-name"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Thread name..."
        onKeyDown={e => e.key === 'Enter' && name && onCreate(name)}
      />
      <button 
        className="btn btn-primary" 
        onClick={() => name && onCreate(name)}
      >
        Create first thread
      </button>
    </div>
  )
}
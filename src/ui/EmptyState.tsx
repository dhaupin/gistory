// Empty state - when there's nothing to show
import { FileX } from 'lucide-react'

interface EmptyStateProps {
  title?: string
  message?: string
  action?: React.ReactNode
}

export function EmptyState({ 
  title = 'Nothing here yet', 
  message,
  action 
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <FileX size={48} className="empty-icon" />
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}
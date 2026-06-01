// Loading spinner
import { Loader2 } from 'lucide-react'

interface LoadingProps {
  size?: number
  text?
}

export function Loading({ size = 24, text }: LoadingProps) {
  return (
    <div className="loading">
      <Loader2 className="loading-spinner" size={size} />
      {text && <span className="loading-text">{text}</span>}
    </div>
  )
}
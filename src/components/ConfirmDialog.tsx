// ConfirmDialog - modal confirmation dialog
import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useInChain } from '../ui/chain-context'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /**
   * Explicit override for the chain-wide note. By default a destructive
   * dialog shows it whenever the device is in a sync chain — deleting a
   * synced item removes it on every device, so the dialog says so. Pass
   * `false` for destructive actions whose reach is only this device (the
   * dialog cannot know, because it was not told which action this is).
   */
  chainWide?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  chainWide,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const inChain = useInChain()
  const showChainNote = destructive && (chainWide ?? inChain)
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    if (open) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-icon">
          <AlertTriangle size={24} />
        </div>
        <h3 className="modal-title" id="confirm-dialog-title">{title}</h3>
        <p className="modal-message">{message}</p>
        {showChainNote && (
          <p className="modal-chain-note">
            <AlertTriangle size={13} /> This applies to all devices in your sync chain.
          </p>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button 
            className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} 
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
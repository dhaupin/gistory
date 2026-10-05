// TrashPage - the recently-deleted log, read straight off the synced tombstone
// registry.
//
// Honest scope: deletions in Gistory are permanent. The tombstone registry is
// what stops a deleted item from being resurrected by an older snapshot on
// another device, so entries can never be safely cleared while an old blob
// might still carry the item — and no device holds the deleted content after
// sync merges the tombstone. This page is therefore a *record*, not a restore:
// it shows what was deleted, of what kind, and when, so an unexpected empty
// board has an explanation.

import { useState } from 'react'
import { ArrowLeft, Trash2, FileText, MessageSquare, Folder, EyeOff } from 'lucide-react'
import type { DeletedRegistry } from '../sync/merge'

interface TrashPageProps {
  deleted: DeletedRegistry
  onBack: () => void
}

const KINDS = [
  { key: 'threads' as const, label: 'Threads', icon: <FileText size={13} /> },
  { key: 'messages' as const, label: 'Messages', icon: <MessageSquare size={13} /> },
  { key: 'projects' as const, label: 'Projects', icon: <Folder size={13} /> },
]

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000

export default function TrashPage({ deleted, onBack }: TrashPageProps) {
  const [recentOnly, setRecentOnly] = useState(true)
  const cutoff = Date.now() - NINETY_DAYS

  const total = KINDS.reduce((n, kind) => n + Object.keys(deleted[kind.key]).length, 0)
  const countOf = (kind: (typeof KINDS)[number]['key'], filter: boolean) =>
    Object.entries(deleted[kind]).filter(([, at]) => !filter || at >= cutoff).length

  return (
    <div className="container trash-page">
      <div className="thread-header">
        <h3 className="thread-title">Recently deleted</h3>
        <button className="btn btn-secondary btn-small" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <p className="empty-text trash-explainer">
        Deleting is permanent: the removal syncs to every device, and no device keeps
        the deleted content. This log — synced with the rest of your data — is the
        record of what went away, so an empty board always has an explanation.
      </p>

      <div className="trash-toolbar">
        <label className="trash-filter">
          <input
            type="checkbox"
            checked={recentOnly}
            onChange={e => setRecentOnly(e.target.checked)}
          />
          <EyeOff size={13} /> Hide entries older than 90 days
        </label>
        <span className="meta-usage">
          {total} entr{total === 1 ? 'y' : 'ies'} on record
        </span>
      </div>

      {total === 0 && <p className="empty-text">Nothing has been deleted on this device.</p>}

      {KINDS.map(({ key, label, icon }) => {
        const entries = Object.entries(deleted[key])
          .filter(([, at]) => !recentOnly || at >= cutoff)
          .sort((a, b) => b[1] - a[1])
        if (entries.length === 0) return null
        return (
          <div key={key} className="trash-section">
            <h4 className="trash-section-title">{icon} {label} ({countOf(key, recentOnly)})</h4>
            <div className="trash-list">
              {entries.map(([id, at]) => (
                <div key={id} className="trash-row">
                  <Trash2 size={12} className="trash-row-icon" aria-hidden="true" />
                  <code className="trash-row-id">{id}</code>
                  <span className="trash-row-time">{new Date(at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

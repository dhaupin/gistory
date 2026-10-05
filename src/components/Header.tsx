import { useState, useEffect } from 'react'
import { Folder, Sun, Moon, Menu, RefreshCw, Check, AlertTriangle } from 'lucide-react'

export interface SyncChipState {
  enabled: boolean
  status: 'idle' | 'syncing' | 'error'
  lastSync: number | null
}

interface HeaderProps {
  title: string
  darkMode: boolean
  onToggleDark: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onProjectsClick: () => void
  onMenuClick?: () => void
  /** Compact, always-visible sync state; rendered only when sync is enabled. */
  sync?: SyncChipState
  onSyncClick?: () => void
}

/** "2m ago" style stamp for the chip's label. */
function formatAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Sync status lives in the header, not just Settings: a user should never have
 * to open a settings page to learn whether their changes reached the chain.
 * The chip is a button into Settings, where the detail (devices, chain id,
 * errors) already lives. Renders nothing until sync is enabled.
 */
function SyncChip({ sync, onClick }: { sync: SyncChipState; onClick: () => void }) {
  // The relative label ("3m ago") needs a periodic re-render to stay honest.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (sync.status !== 'idle' || !sync.lastSync) return
    const timer = window.setInterval(() => setTick(t => t + 1), 30000)
    return () => window.clearInterval(timer)
  }, [sync.status, sync.lastSync])

  const label =
    sync.status === 'syncing' ? 'Syncing…'
    : sync.status === 'error' ? 'Sync issue'
    : sync.lastSync ? formatAgo(sync.lastSync, Date.now())
    : 'Sync on'

  return (
    <button
      className={`sync-chip${sync.status === 'error' ? ' bad' : ''}`}
      onClick={onClick}
      title="Sync status — open settings"
      aria-label={`Sync status: ${label}. Open settings.`}
    >
      {sync.status === 'syncing' ? (
        <RefreshCw size={13} className="spin" />
      ) : sync.status === 'error' ? (
        <AlertTriangle size={13} className="status-bad" />
      ) : (
        <Check size={13} className="status-good" />
      )}
      <span>{label}</span>
    </button>
  )
}

export default function Header({
  title,
  darkMode,
  onToggleDark,
  searchQuery,
  onSearchChange,
  onProjectsClick,
  onMenuClick,
  sync,
  onSyncClick
}: HeaderProps) {
  return (
    <header className="header">
      <h1 className="logo">{title}</h1>
      <div className="header-actions">
        {sync?.enabled && onSyncClick && <SyncChip sync={sync} onClick={onSyncClick} />}
        <button className="btn btn-secondary btn-project" onClick={onProjectsClick} title="Projects">
          <Folder size={16} /> Projects
        </button>
        <input
          className="search-input"
          placeholder="Search..."
          aria-label="Search threads"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        <button
          className="btn-icon"
          onClick={onToggleDark}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {onMenuClick && (
          <button className="btn-burger" onClick={onMenuClick} aria-label="Open menu"><Menu size={16} /></button>
        )}
      </div>
    </header>
  )
}

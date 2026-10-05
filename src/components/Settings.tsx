// Settings Page - user preferences, sync chains, devices

import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Link, Smartphone, RefreshCw, Check, X, Copy, AlertTriangle, Loader2, Eye, EyeOff, Edit } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Badge, Button } from '../ui'
import ConfirmDialog from './ConfirmDialog'
import { exportAll, exportThread, exportProject, getLastExport, setLastExport, type ExportData } from '../lib/store'
import { convertImport } from '../lib/import-adapters'
import type { PromptMetadata } from '../lib/models'
import { TIME_ZONES } from '../ui/relative-time'

// Types
interface SettingsProps {
  // Sync state
  syncEnabled: boolean
  syncKey: string | null
  chainId: string | null
  devices: DeviceInfo[]
  myDeviceId: string | null
  /** Human-friendly name of this device, editable in the Devices tab. */
  myDeviceName: string
  lastSync: number | null
  syncStatus: 'idle' | 'syncing' | 'error'
  syncError: string | null
  darkMode: boolean
  /** IANA zone for displayed stamps; '' = this device's zone. */
  timeZone: string

  // Actions
  onToggleDark: () => void
  onSetTimeZone: (tz: string) => void
  onEnableSync: (passphrase: string) => Promise<void>
  onJoinSync: (passphrase: string, token: string) => Promise<void>
  onDisableSync: () => void
  onRenameDevice: (name: string) => void
  onGenerateToken: () => Promise<string>
  onRefresh: () => Promise<void>
  /** Merge an imported snapshot into app state (no reload needed). */
  onImportData: (data: ExportData) => void
}

interface DeviceInfo {
  id: string
  name: string
  lastSeen: number
}

// Sections
function SettingsPage(props: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'sync' | 'devices' | 'data'>('sync')
  
  return (
    <div className="settings-page">
      <div className="settings-header">
        <SettingsIcon size={24} />
        <h2>Settings</h2>
      </div>
      
      <div className="settings-tabs">
        <button 
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button 
          className={`tab ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          Sync
        </button>
        <button 
          className={`tab ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          Devices
        </button>
        <button 
          className={`tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Snapshot
        </button>
      </div>
      
      <div className="settings-content">
        {activeTab === 'general' && (
          <GeneralSettings
            darkMode={props.darkMode}
            onToggleDark={props.onToggleDark}
            timeZone={props.timeZone}
            onSetTimeZone={props.onSetTimeZone}
          />
        )}
        {activeTab === 'sync' && <SyncSettings {...props} />}
        {activeTab === 'devices' && <DevicesSettings {...props} />}
        {activeTab === 'data' && <DataSettings onImport={props.onImportData} />}
      </div>
    </div>
  )
}

// Appearance lives in App (single source of truth) — this only renders the
// control, so the header toggle and this one can never disagree. The `dark`
// class is applied to <body> by App, which is what the theme variables key off.
function GeneralSettings({
  darkMode,
  onToggleDark,
  timeZone,
  onSetTimeZone,
}: {
  darkMode: boolean
  onToggleDark: () => void
  timeZone: string
  onSetTimeZone: (tz: string) => void
}) {
  return (
    <div className="settings-section">
      <h3>Appearance</h3>
      
      <div className="setting-row">
        <span id="dark-mode-label">Dark Mode</span>
        <button
          className={`toggle ${darkMode ? 'on' : ''}`}
          onClick={onToggleDark}
          role="switch"
          aria-checked={darkMode}
          aria-labelledby="dark-mode-label"
        >
          <span className="toggle-knob" />
        </button>
      </div>

      <div className="setting-row">
        <span id="time-zone-label">Time zone</span>
        <select
          className="sort-select"
          value={timeZone}
          onChange={e => onSetTimeZone(e.target.value)}
          aria-labelledby="time-zone-label"
        >
          <option value="">Device time zone</option>
          {TIME_ZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
      <p className="setting-desc">
        Used for the created/edited times shown on threads and messages, so the
        same prompt reads the same wall-clock time on every device. Syncs with
        the rest of your data.
      </p>
    </div>
  )
}

function SyncSettings(props: SettingsProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [keyInput, setKeyInput] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [pairingToken, setPairingToken] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [copiedChain, setCopiedChain] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      setKeyInput('')
      setTokenInput('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleEnable = () => {
    const passphrase = keyInput.trim()
    if (!passphrase) return
    void run(async () => { await props.onEnableSync(passphrase) })
  }

  const handleJoin = () => {
    const passphrase = keyInput.trim()
    const token = tokenInput.trim()
    if (!passphrase || !token) return
    void run(async () => { await props.onJoinSync(passphrase, token) })
  }

  const handleGenerateToken = async () => {
    try {
      const token = await props.onGenerateToken()
      setPairingToken(token)
      setShowToken(true)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      await props.onRefresh()
    } finally {
      setSyncing(false)
    }
  }

  const copyChainId = () => {
    if (!props.chainId) return
    navigator.clipboard.writeText(props.chainId)
    setCopiedChain(true)
    setTimeout(() => setCopiedChain(false), 2000)
  }

  return (
    <div className="settings-section">
      <h3>Sync Chain</h3>

      {actionError && (
        <p className="sync-error"><AlertTriangle size={14} /> {actionError}</p>
      )}
      
      {!props.syncEnabled ? (
        <div className="sync-setup">
          <p className="setting-desc">
            Sync uses one passphrase plus a pairing code. The passphrase never leaves
            your devices — the server only stores encrypted data.
          </p>

          <div className="sync-mode-tabs">
            <button
              className={`sync-mode ${mode === 'create' ? 'active' : ''}`}
              onClick={() => setMode('create')}
            >
              Create a chain
            </button>
            <button
              className={`sync-mode ${mode === 'join' ? 'active' : ''}`}
              onClick={() => setMode('join')}
            >
              Join with a code
            </button>
          </div>

          {mode === 'join' && (
            <div className="input-group">
              <input
                className="input"
                type="text"
                placeholder="Pairing code (GS1-…)"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
              />
            </div>
          )}

          <div className="input-group">
            <div className="password-field">
              <input
                className="input"
                type={showKey ? 'text' : 'password'}
                placeholder={mode === 'create' ? 'Choose a sync passphrase' : 'Enter the sync passphrase'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  if (mode === 'create') handleEnable()
                  else handleJoin()
                }}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowKey(v => !v)}
                aria-label={showKey ? 'Hide passphrase' : 'Show passphrase'}
                title={showKey ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Button
              onClick={mode === 'create' ? handleEnable : handleJoin}
              disabled={busy || !keyInput.trim() || (mode === 'join' && !tokenInput.trim())}
            >
              {busy && <Loader2 size={14} className="spin" />}
              {mode === 'create' ? 'Create Chain' : 'Join Chain'}
            </Button>
          </div>
          
          <div className="help-text">
            <Link size={14} />
            <span>
              {mode === 'create'
                ? 'Use a memorable phrase — you will need it on every device. Only create a chain on your first device; on every other device choose "Join with a code" so it connects to this one.'
                : 'Scan (or paste) the pairing code shown on a device already in the chain, then enter the same passphrase.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="sync-active">
          <div className="sync-status">
            {props.syncStatus === 'syncing' ? (
              <Loader2 size={16} className="spin" />
            ) : props.syncStatus === 'error' ? (
              <AlertTriangle size={16} className="status-bad" />
            ) : (
              <Check size={16} className="status-good" />
            )}
            <span>
              {props.syncStatus === 'syncing' ? 'Syncing…'
                : props.syncStatus === 'error' ? 'Sync needs attention'
                : 'Sync enabled'}
            </span>
            {props.lastSync && (
              <span className="last-sync">
                Last: {new Date(props.lastSync).toLocaleString()}
              </span>
            )}
          </div>

          {props.syncError && (
            <p className="sync-error"><AlertTriangle size={14} /> {props.syncError}</p>
          )}

          {props.chainId && (
            <div className="chain-row">
              <span className="chain-label">Chain</span>
              <code className="chain-id">{props.chainId}</code>
              <button className="btn-icon" onClick={copyChainId} title="Copy chain ID">
                {copiedChain ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
          
          <div className="sync-actions">
            <Button onClick={handleSyncNow} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? 'spin' : undefined} />
              Sync Now
            </Button>
            
            <Button onClick={handleGenerateToken} variant="secondary">
              <Smartphone size={14} />
              Pair Device
            </Button>
            
            <Button onClick={() => setConfirmDisable(true)} variant="danger">
              <X size={14} />
              Disable
            </Button>
          </div>

          {confirmDisable && (
            <ConfirmDialog
              open
              title="Turn off sync?"
              message="This device will stop syncing and forget the chain. Your prompts stay on this device, and other devices keep syncing. You can re-enable with the same passphrase and pairing code."
              confirmLabel="Turn off sync"
              destructive
              onConfirm={() => { setConfirmDisable(false); props.onDisableSync() }}
              onCancel={() => setConfirmDisable(false)}
            />
          )}
          
          {/* Pairing Modal */}
          {showToken && pairingToken && (
            <PairingModal 
              token={pairingToken}
              onClose={() => setShowToken(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function PairingModal(props: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = () => {
    navigator.clipboard.writeText(props.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Pair New Device</h3>
          <button className="close-btn" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
        
        <div className="modal-body">
          <p>
            On the other device open <strong>Settings → Sync → Join with a code</strong>,
            then enter this code and your sync passphrase.
          </p>
          
          {/* QR Code */}
          <div className="qr-display">
            <QRCodeSVG 
              value={props.token} 
              size={180}
              level="M"
              includeMargin
            />
          </div>
          
          <div className="token-display">
            <code>{props.token}</code>
            <button onClick={handleCopy} title="Copy">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        
        <div className="modal-footer">
          <Button onClick={props.onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}

function DevicesSettings(props: SettingsProps) {
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(props.myDeviceName)

  useEffect(() => {
    setNameInput(props.myDeviceName)
  }, [props.myDeviceName])

  const saveName = () => {
    const name = nameInput.trim()
    if (name && name !== props.myDeviceName) props.onRenameDevice(name)
    setEditing(false)
  }

  if (!props.devices.length) {
    return (
      <div className="settings-section">
        <h3>Devices</h3>
        <p className="empty-text">No devices in your sync chain yet.</p>
      </div>
    )
  }
  
  return (
    <div className="settings-section">
      <h3>Devices ({props.devices.length})</h3>

      <div className="setting-row">
        <span>This device's name</span>
        {editing ? (
          <div className="form-inline">
            <input
              className="input-name"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') { setEditing(false); setNameInput(props.myDeviceName) }
              }}
              autoFocus
            />
            <button className="btn btn-primary btn-small" onClick={saveName}>Save</button>
            <button className="btn btn-secondary btn-small" onClick={() => { setEditing(false); setNameInput(props.myDeviceName) }}>Cancel</button>
          </div>
        ) : (
          <button
            className="btn btn-secondary btn-small"
            onClick={() => setEditing(true)}
            aria-label="Rename this device"
          >
            <Edit size={14} /> {props.myDeviceName || 'Unnamed device'}
          </button>
        )}
      </div>
      
      <div className="devices-list">
        {props.devices.map(device => {
          const isCurrent = device.id === props.myDeviceId
          return (
            <div key={device.id} className="device-row">
              <div className="device-info">
                <span className="device-name">
                  {isCurrent && <span className="you-badge">You</span>}
                  {device.name || 'Unnamed device'}
                </span>
                <span className="device-last-seen">
                  Last seen: {new Date(device.lastSeen).toLocaleString()}
                </span>
              </div>
              
              {isCurrent && <Badge variant="success">this device</Badge>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DataSettings({ onImport }: { onImport: (data: ExportData) => void }) {
  const [importStatus, setImportStatus] = useState<string>('')
  const [selectedThread, setSelectedThread] = useState<string>('')
  const [selectedProject, setSelectedProject] = useState<string>('')
  // Backup nudging: sync retains only the newest 5 snapshots per chain, so a
  // downloaded backup is the real archive. The nudge is one-time dismissible;
  // the last-backup stamp stays visible in this tab regardless.
  const [lastExport, setLastExportState] = useState<number | null>(() => getLastExport())
  const [nudgeDismissed, setNudgeDismissed] = useState(
    () => localStorage.getItem('gistory_backup_nudge_dismissed') === '1',
  )
  
  // Load data from store for dropdowns
  const [threads, setThreads] = useState<{id: string, name: string, metadata?: PromptMetadata}[]>([])
  const [projects, setProjects] = useState<{id: string, name: string}[]>([])
  
  const reloadLists = () => {
    // Load threads/projects for the export dropdowns
    import('../lib/store').then(store => {
      const data = store.loadData()
      setThreads(data.threads.map((t: {id: string, name: string, metadata?: PromptMetadata}) => ({id: t.id, name: t.name, metadata: t.metadata})))
      setProjects(data.projects.map((p: {id: string, name: string}) => ({id: p.id, name: p.name})))
    })
  }

  useEffect(() => {
    reloadLists()
  }, [])
  
  const handleExportAll = () => {
    const data = exportAll()
    downloadJson(data, 'gistory-export-full.json')
    setLastExport()
    setLastExportState(Date.now())
  }

  const BACKUP_STALE_MS = 14 * 24 * 60 * 60 * 1000
  const backupStale = !lastExport || Date.now() - lastExport > BACKUP_STALE_MS
  const showBackupNudge = threads.length > 0 && backupStale && !nudgeDismissed
  
  const handleExportThread = () => {
    if (!selectedThread) return
    const data = exportThread(selectedThread)
    if (data) downloadJson(data, `gistory-thread-${selectedThread}.json`)
  }
  
  const handleExportProject = () => {
    if (!selectedProject) return
    const data = exportProject(selectedProject)
    if (data) downloadJson(data, `gistory-project-${selectedProject}.json`)
  }
  
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const text = await file.text()
      // The same dialog accepts Gistory snapshots, ChatGPT data exports, and
      // Claude data exports — convertImport sniffs the shape.
      const converted = convertImport(JSON.parse(text))
      if (!converted) {
        setImportStatus('Error: Unsupported file format — expected a Gistory, ChatGPT, or Claude export')
        return
      }
      // Hand the snapshot to the app, which owns the state and the
      // persistence effects. Writing localStorage from here would leave the
      // in-memory state stale, forcing a full page reload to see the import.
      onImport(converted.data)
      const label =
        converted.format === 'chatgpt' ? 'ChatGPT export'
        : converted.format === 'claude' ? 'Claude export'
        : 'Gistory snapshot'
      setImportStatus(`Imported ${(converted.data.threads || []).length} thread(s), ${(converted.data.projects || []).length} project(s) — ${label}`)
      // Keep the export dropdowns in step with what was just imported.
      setTimeout(reloadLists, 0)
    } catch {
      setImportStatus('Error: Invalid JSON file')
    }
  }
  
  return (
    <div className="data-settings">
      <h3>Export Data</h3>

      {showBackupNudge && (
        <div className="backup-notice" role="status">
          <AlertTriangle size={14} />
          <span>
            {lastExport
              ? 'Last full backup was over two weeks ago. '
              : 'No full backup yet. '}
            Sync keeps only the newest 5 snapshots per chain — download a backup to be safe.
          </span>
          <button
            className="btn-icon"
            onClick={() => {
              localStorage.setItem('gistory_backup_nudge_dismissed', '1')
              setNudgeDismissed(true)
            }}
            aria-label="Dismiss backup reminder"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <p className="meta-usage backup-stamp">
        Last full backup: {lastExport ? new Date(lastExport).toLocaleString() : 'never'}
      </p>
      
      <div className="export-section">
        <button className="btn btn-primary" onClick={handleExportAll}>
          Export All Data
        </button>
        
        <div className="export-options">
          <select 
            value={selectedThread} 
            onChange={e => setSelectedThread(e.target.value)}
            aria-label="Export a single thread"
          >
            <option value="">Select thread...</option>
            {threads.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button 
            className="btn btn-secondary" 
            onClick={handleExportThread}
            disabled={!selectedThread}
          >
            Export Thread
          </button>
        </div>
        
        <div className="export-options">
          <select 
            value={selectedProject} 
            onChange={e => setSelectedProject(e.target.value)}
            aria-label="Export a single project"
          >
            <option value="">Select project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button 
            className="btn btn-secondary" 
            onClick={handleExportProject}
            disabled={!selectedProject}
          >
            Export Project
          </button>
        </div>
      </div>
      
      <h3>Import Data</h3>
      <div className="import-section">
        <label className="file-input">
          <input 
            type="file" 
            accept=".json" 
            onChange={handleImport}
          />
          Choose JSON file
        </label>
        {importStatus && <p className="import-status">{importStatus}</p>}
      </div>
    </div>
  )
}

function downloadJson(data: ExportData, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default SettingsPage

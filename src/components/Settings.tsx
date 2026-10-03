// Settings Page - user preferences, sync chains, devices

import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Link, Smartphone, RefreshCw, Check, X, Copy, AlertTriangle, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Badge, Button } from '../ui'
import { exportAll, exportThread, exportProject, type ExportData } from '../lib/store'
import type { PromptMetadata } from '../lib/models'

// Types
interface SettingsProps {
  // Sync state
  syncEnabled: boolean
  syncKey: string | null
  chainId: string | null
  devices: DeviceInfo[]
  myDeviceId: string | null
  lastSync: number | null
  syncStatus: 'idle' | 'syncing' | 'error'
  syncError: string | null
  darkMode: boolean

  // Actions
  onToggleDark: () => void
  onEnableSync: (passphrase: string) => Promise<void>
  onJoinSync: (passphrase: string, token: string) => Promise<void>
  onDisableSync: () => void
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
          <GeneralSettings darkMode={props.darkMode} onToggleDark={props.onToggleDark} />
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
function GeneralSettings({ darkMode, onToggleDark }: { darkMode: boolean; onToggleDark: () => void }) {
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
            <input
              className="input"
              type="password"
              placeholder={mode === 'create' ? 'Choose a sync passphrase' : 'Enter the sync passphrase'}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                if (mode === 'create') handleEnable()
                else handleJoin()
              }}
            />
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
                ? 'Use a memorable phrase. You will need it on every device.'
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
            
            <Button onClick={props.onDisableSync} variant="danger">
              <X size={14} />
              Disable
            </Button>
          </div>
          
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
  }
  
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
      const data = JSON.parse(text) as ExportData

      // Hand the snapshot to the app, which owns the state and the 
      // persistence effects. Writing localStorage from here would leave the
      // in-memory state stale, forcing a full page reload to see the import.
      onImport(data)
      setImportStatus(`Imported ${(data.threads || []).length} threads, ${(data.projects || []).length} projects`)
      // Keep the export dropdowns in step with what was just imported.
      setTimeout(reloadLists, 0)
    } catch (err) {
      setImportStatus('Error: Invalid file format')
    }
  }
  
  return (
    <div className="data-settings">
      <h3>Export Data</h3>
      
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

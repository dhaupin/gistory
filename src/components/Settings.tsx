// Settings Page - user preferences, sync chains, devices

import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Link, Smartphone, Trash2, RefreshCw, Check, X, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Badge, Button } from '../ui'
import { exportAll, exportThread, exportProject, importData, type ExportData } from '../lib/store'
import type { PromptMetadata } from '../lib/models'

// Types
interface SettingsProps {
  // Sync state
  syncEnabled: boolean
  syncKey: string | null
  chainId: string | null
  devices: DeviceInfo[]
  lastSync: number | null
  
  // Actions
  onEnableSync: (key: string) => void
  onDisableSync: () => void
  onGenerateToken: () => Promise<string>
  onRefresh: () => Promise<void>
}

interface DeviceInfo {
  id: string
  name: string
  lastSeen: number
  isCurrent: boolean
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
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'sync' && <SyncSettings {...props} />}
        {activeTab === 'devices' && <DevicesSettings {...props} />}
        {activeTab === 'data' && <DataSettings />}
      </div>
    </div>
  )
}

function GeneralSettings() {
  const [darkMode, setDarkMode] = useState(() => 
    localStorage.getItem('gistory_dark') === 'true'
  )
  
  useEffect(() => {
    localStorage.setItem('gistory_dark', String(darkMode))
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])
  
  return (
    <div className="settings-section">
      <h3>Appearance</h3>
      
      <label className="setting-row">
        <span>Dark Mode</span>
        <button 
          className={`toggle ${darkMode ? 'on' : ''}`}
          onClick={() => setDarkMode(!darkMode)}
        >
          <span className="toggle-knob" />
        </button>
      </label>
    </div>
  )
}

function SyncSettings(props: SettingsProps) {
  const [keyInput, setKeyInput] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [pairingToken, setPairingToken] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  
  const handleEnable = () => {
    if (keyInput.trim()) {
      props.onEnableSync(keyInput.trim())
      setKeyInput('')
    }
  }
  
  const handleGenerateToken = async () => {
    const token = await props.onGenerateToken()
    setPairingToken(token)
    setShowToken(true)
  }
  
  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      await props.onRefresh()
    } finally {
      setSyncing(false)
    }
  }
  
  return (
    <div className="settings-section">
      <h3>Sync Chain</h3>
      
      {!props.syncEnabled ? (
        <div className="sync-setup">
          <p className="setting-desc">
            Enable sync to keep your prompts across devices. You'll create or enter 
            a sync key - this never leaves your devices.
          </p>
          
          <div className="input-group">
            <input
              type="password"
              placeholder="Enter sync key or passphrase"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEnable()}
            />
            <Button onClick={handleEnable} disabled={!keyInput.trim()}>
              Enable Sync
            </Button>
          </div>
          
          <div className="help-text">
            <Link size={14} />
            <span>
              Use a memorable phrase. You'll need it on all your devices.
            </span>
          </div>
        </div>
      ) : (
        <div className="sync-active">
          <div className="sync-status">
            <Check size={16} className="status-good" />
            <span>Sync enabled</span>
            {props.lastSync && (
              <span className="last-sync">
                Last: {new Date(props.lastSync).toLocaleString()}
              </span>
            )}
          </div>
          
          <div className="sync-actions">
            <Button onClick={handleSyncNow} disabled={syncing}>
              <RefreshCw size={14} /> 
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
          <p>Scan this QR code on your other device, or enter the code manually:</p>
          
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
        {props.devices.map(device => (
          <div key={device.id} className="device-row">
            <div className="device-info">
              <span className="device-name">
                {device.isCurrent && <span className="you-badge">You</span>}
                {device.name}
              </span>
              <span className="device-last-seen">
                Last seen: {new Date(device.lastSeen).toLocaleString()}
              </span>
            </div>
            
            {!device.isCurrent && (
              <button className="btn-icon danger" title="Remove device">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
function DataSettings() {
  const [importStatus, setImportStatus] = useState<string>('')
  const [selectedThread, setSelectedThread] = useState<string>('')
  const [selectedProject, setSelectedProject] = useState<string>('')
  
  // Metadata editing state
  const [editMode, setEditMode] = useState(false)
  const [metaTags, setMetaTags] = useState('')
  const [metaCategory, setMetaCategory] = useState('')
  const [metaRating, setMetaRating] = useState(0)
  const [metaNotes, setMetaNotes] = useState('')
  
  // Load data from store for dropdowns
  const [threads, setThreads] = useState<{id: string, name: string, metadata?: PromptMetadata}[]>([])
  const [projects, setProjects] = useState<{id: string, name: string}[]>([])
  
  useEffect(() => {
    // Load threads/projects for dropdowns
    import('../lib/store').then(store => {
      const data = store.loadData()
      setThreads(data.threads.map((t: {id: string, name: string, metadata?: PromptMetadata}) => ({id: t.id, name: t.name, metadata: t.metadata})))
      setProjects(data.projects.map((p: {id: string, name: string}) => ({id: p.id, name: p.name})))
    })
  }, [])
  
  // Load selected thread metadata
  useEffect(() => {
    if (!selectedThread) {
      setMetaTags('')
      setMetaCategory('')
      setMetaRating(0)
      setMetaNotes('')
      return
    }
    const thread = threads.find(t => t.id === selectedThread)
    if (thread?.metadata) {
      setMetaTags(thread.metadata.tags?.join(', ') || '')
      setMetaCategory(thread.metadata.category || '')
      setMetaRating(thread.metadata.rating || 0)
      setMetaNotes(thread.metadata.notes || '')
    } else {
      setMetaTags('')
      setMetaCategory('')
      setMetaRating(0)
      setMetaNotes('')
    }
  }, [selectedThread, threads])
  
  const handleSaveMeta = async () => {
    const { saveThreads, loadData } = await import('../lib/store')
    const data = loadData()
    const updated = data.threads.map(t => {
      if (t.id !== selectedThread) return t
      return {
        ...t,
        metadata: {
          tags: metaTags.split(',').map(x => x.trim()).filter(Boolean),
          category: metaCategory as any,
          rating: metaRating || undefined,
          notes: metaNotes || undefined,
        }
      }
    })
    saveThreads(updated)
    setEditMode(false)
    // Reload
    window.location.reload()
  }
  
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
      const merged = importData(data)
      
      // Save merged data
      const { saveThreads, saveMessages, saveProjects } = await import('../lib/store')
      saveThreads(merged.threads)
      saveMessages(merged.messages)
      saveProjects(merged.projects)
      
      setImportStatus(`Imported ${merged.threads.length} threads, ${merged.projects.length} projects`)
      
      // Reload page after short delay
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setImportStatus('Error: Invalid file format')
    }
  }
  
  return (
    <div className="data-settings">
      <h3>Export Data</h3>
      
      <div className="export-section">
        <button className="btn-primary" onClick={handleExportAll}>
          Export All Data
        </button>
        
        <div className="export-options">
          <select 
            value={selectedThread} 
            onChange={e => setSelectedThread(e.target.value)}
          >
            <option value="">Select thread...</option>
            {threads.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button 
            className="btn-secondary" 
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
          >
            <option value="">Select project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button 
            className="btn-secondary" 
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
      
      <h3>Thread Metadata</h3>
      <div className="metadata-section">
        <select 
          value={selectedThread}
          onChange={e => setSelectedThread(e.target.value)}
        >
          <option value="">Select thread to edit...</option>
          {threads.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        
        {selectedThread && (
          <div className="metadata-fields">
            <label>
              Tags (comma-separated)
              <input 
                type="text" 
                value={metaTags}
                onChange={e => setMetaTags(e.target.value)}
                placeholder="coding, summarization, translation"
              />
            </label>
            
            <label>
              Category
              <select value={metaCategory} onChange={e => setMetaCategory(e.target.value)}>
                <option value="">None</option>
                <option value="productivity">Productivity</option>
                <option value="creative">Creative</option>
                <option value="technical">Technical</option>
                <option value="general">General</option>
              </select>
            </label>
            
            <label>
              Rating
              <select value={metaRating} onChange={e => setMetaRating(Number(e.target.value))}>
                <option value={0}>None</option>
                <option value={1}>1 - Poor</option>
                <option value={2}>2 - Fair</option>
                <option value={3}>3 - Good</option>
                <option value={4}>4 - Great</option>
                <option value={5}>5 - Excellent</option>
              </select>
            </label>
            
            <label>
              Notes
              <textarea 
                value={metaNotes}
                onChange={e => setMetaNotes(e.target.value)}
                placeholder="Additional notes..."
              />
            </label>
            
            <button className="btn-primary" onClick={handleSaveMeta}>
              Save Metadata
            </button>
          </div>
        )}
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
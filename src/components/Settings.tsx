// Settings Page - user preferences, sync chains, devices

import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Link, Smartphone, Trash2, RefreshCw, Check, X, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Badge, Button } from '../ui'

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
  const [activeTab, setActiveTab] = useState<'general' | 'sync' | 'devices'>('sync')
  
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
      </div>
      
      <div className="settings-content">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'sync' && <SyncSettings {...props} />}
        {activeTab === 'devices' && <DevicesSettings {...props} />}
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

export default SettingsPage
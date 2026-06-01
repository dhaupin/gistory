// 📋 SyncAgent - Client-Side Encryption & Sync
// Gistory Sync Chain - Browser Side
// ===============================

// Use web crypto - no node imports needed!

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/*
  TYPES (match spec.ts)
  ==================
*/

export interface DeviceIdentity {
  id: string
  name: string
  pubkey: string
  createdAt: number
  lastSeen: number
}

export interface SyncChain {
  id: string
  devices: string[]
  createdAt: number
  version: number
}

export interface SyncBlob {
  key: string
  chain: string
  seq: number
  nonce: string
  data: string
  hash: string
  timestamp: number
}

export interface SyncConfig {
  workerUrl: string
  syncKey: string      // NEVER leaves device!
  deviceName: string
  chainId?: string
}

/*
  CRYPTO - Client Side Only
  ========================
*/

const enc = new TextEncoder()
const dec = new TextDecoder()

function buf2base64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  bytes.forEach(b => binary += String.fromCharCode(b))
  return btoa(binary)
}

function base642buf(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encrypt(data: object, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  )
  
  return buf2base64(iv) + '.' + buf2base64(ciphertext)
}

async function decrypt(payload: string, key: CryptoKey): Promise<object> {
  const [iv64, data64] = payload.split('.')
  const iv = base642buf(iv64)
  const data = base642buf(data64)
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )
  
  return JSON.parse(dec.decode(plaintext))
}

function hash(data: string): string {
  // Simple hash for verification - use SHA-256 in prod
  let h = 0
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h) + data.charCodeAt(i)
    h |= 0
  }
  return String(h)
}

/*
  PAIRING TOKENS (QR)
  =================
*/

export function generatePairingToken(): string {
  // 256-bit random as base64url
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return buf2base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/*
  SYNC AGENT
  =========
*/

export class SyncAgent {
  private config: SyncConfig
  private identity: DeviceIdentity | null = null
  private key: CryptoKey | null = null
  private chain: SyncChain | null = null
  private lastSeq = 0
  
  constructor(config: SyncConfig) {
    this.config = config
  }
  
  // Initialize - derive identity from sync key
  async init(): Promise<DeviceIdentity> {
    // Generate or recover device ID
    const storedId = localStorage.getItem('gistory_device_id')
    const deviceId = storedId || generateUUID()
    if (!storedId) {
      localStorage.setItem('gistory_device_id', deviceId)
    }
    
    // Derive encryption key from sync key + device ID
    this.key = await deriveKey(this.config.syncKey, deviceId)
    
    this.identity = {
      id: deviceId,
      name: this.config.deviceName,
      pubkey: buf2base64((await crypto.subtle.exportKey('raw', this.key!))),
      createdAt: Date.now(),
      lastSeen: Date.now(),
    }
    
    return this.identity
  }
  
  // Handshake - join or create chain
  async handshake(existingChainId?: string): Promise<SyncChain> {
    if (!this.identity) throw new Error('Not initialized')
    
    const chainId = existingChainId || localStorage.getItem('gistory_chain_id') || generateUUID()
    localStorage.setItem('gistory_chain_id', chainId)
    
    const response = await fetch(`${this.config.workerUrl}/sync/handshake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: this.identity.id,
        deviceName: this.identity.name,
        pubkey: this.identity.pubkey,
        chainId,
      }),
    })
    
    const result = await response.json()
    this.chain = { id: chainId, devices: [this.identity.id], createdAt: Date.now(), version: 1 }
    
    return this.chain
  }
  
  // Push - encrypt + upload
  async push(data: object): Promise<void> {
    if (!this.key || !this.identity || !this.chain) {
      throw new Error('Not initialized')
    }
    
    // Increment sequence
    this.lastSeq++
    
    // Encrypt payload
    const payload = await encrypt(data, this.key)
    const payloadHash = hash(JSON.stringify(data))
    
    const blob: SyncBlob = {
      key: this.identity.id,
      chain: this.chain.id,
      seq: this.lastSeq,
      nonce: '',  // embedded in encrypted payload
      data: payload,
      hash: payloadHash,
      timestamp: Date.now(),
    }
    
    await fetch(`${this.config.workerUrl}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blob),
    })
    
    // Save sequence
    localStorage.setItem(`gistory_seq_${this.chain.id}`, String(this.lastSeq))
  }
  
  // Pull - download + decrypt
  async pull(): Promise<object[]> {
    if (!this.key || !this.chain) {
      throw new Error('Not initialized')
    }
    
    // Get last sequence
    const lastSeqStr = localStorage.getItem(`gistory_seq_${this.chain.id}`)
    const sinceSeq = lastSeqStr ? Number(lastSeqStr) : 0
    
    // Fetch blobs
    const response = await fetch(
      `${this.config.workerUrl}/sync/pull?chain=${this.chain.id}&since=${sinceSeq}`,
    )
    
    const blobs: SyncBlob[] = await response.json()
    const results: object[] = []
    
    for (const blob of blobs) {
      try {
        const decrypted = await decrypt(blob.data, this.key!)
        results.push(decrypted)
        
        // Update sequence
        if (blob.seq > this.lastSeq) {
          this.lastSeq = blob.seq
        }
      } catch {
        // Skip decryption failures (wrong key?)
        console.warn('Failed to decrypt blob', blob.seq)
      }
    }
    
    return results
  }
  
  // Get status
  getStatus() {
    return {
      initialized: !!this.identity,
      chainId: this.chain?.id,
      lastSeq: this.lastSeq,
    }
  }
}

/*
  USAGE EXAMPLE
  ==========

const agent = new SyncAgent({
  workerUrl: 'https://gistory-sync.your-subdomain.workers.dev',
  syncKey: 'user-memorable-passphrase-or-token',
  deviceName: 'my-laptop',
})

// Setup (one time)
await agent.init()
await agent.handshake()

// Sync data (anytime)
await agent.push({ threads, messages, projects })

// Receive changes
const changes = await agent.pull()
// Merge changes into local state
*/
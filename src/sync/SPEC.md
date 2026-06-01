// 📋 SYNC CHAIN SYSTEM SPEC
// Gistory v2 - Client-First Encrypted Sync
// ======================================

/*
  ARCHITECTURE OVERVIEW
  
  ┌────────────┐     ┌─────────────┐     ┌──────────────┐
  │  Device A  │────▶│  CF Worker  │◀────│  Device B   │
  │  (agent)  │◀────│  (blind)    │────▶│  (agent)    │
  └────────────┘     └─────────────┘     └──────────────┘
         │                 │                     │
         │  crypt(auth)    │  encrypted blobs   │  crypt(auth)
         ▼                 ▼                   ▼
  ┌─────────────────────────────────────────────────┐
  │        CLIENT-SIDE ENCRYPTION ONLY             │
  │        Worker NEVER sees plaintext            │
  └─────────────────────────────────────────────────┘
*/

/*
  DATA MODEL
  =========
*/

// Device identity - derived from user's sync key
interface DeviceIdentity {
  id: string           // uuid v4
  name: string          // "my macbook", "phone"
  pubkey: string        // generated from sync key
  createdAt: number    // timestamp
  lastSeen: number     // timestamp
}

// Sync chain - links devices together
interface SyncChain {
  id: string           // chain ID
  devices: string[]    // device IDs in chain
  createdAt: number
  version: number      // for conflict resolution
}

// Encrypted blob - stored in CF Worker
interface SyncBlob {
  key: string          // device ID that authored this
  chain: string        // sync chain ID
  seq: number          // sequence number (ordering)
  nonce: string        // AES-GCM nonce
  data: string         // encrypted payload (base64)
  hash: string         // content hash (verification)
  timestamp: number
}

/*
  WORKER API (BLIND STORAGE)
  =======================
*/

// Routes the worker exposes:
const WORKER_ROUTES = {
  // Handshake: register device, join/create chain
  POST   '/sync/handshake': (body) => SyncResponse,
  
  // Push: upload encrypted blob
  POST   '/sync/push': (body) => { success: boolean },
  
  // Pull: get changes since sequence
  GET    '/sync/pull?chain={id}&seq={n}': () => SyncBlob[],
  
  // List: all chains for device
  GET    '/sync/chains': () => SyncChain[],
}

/*
  AGENT CLASS (CLIENT-SIDE)
  ========================
*/

interface AgentConfig {
  workerUrl: string
  syncKey: string      // user's master key (NEVER leaves device)
  deviceName: string
}

class SyncAgent {
  private config: AgentConfig
  private identity: DeviceIdentity
  
  constructor(config: AgentConfig) {
    this.config = config
  }
  
  // 1. Initialize - derive identity from sync key
  async init(): Promise<DeviceIdentity> {
    // PBKDF2(syncKey, deviceName) → device identity
    // Never transmit syncKey - only derived values
  }
  
  // 2. Handshake - join or create sync chain
  async handshake(): Promise<SyncResult> {
    // POST /sync/handshake
    // Returns: chain info, other devices, last seq
  }
  
  // 3. Push - encrypt + upload
  async push(data: object): Promise<void> {
    // encrypt(data, this.identity.key) → blob
    // POST /sync/push
  }
  
  // 4. Pull - download + decrypt
  async pull(sinceSeq?: number): Promise<object[]> {
    // GET /sync/pull?seq={n}
    // decrypt each blob → merge
  }
  
  // 5. Resolve - handle conflicts
  private resolve(blobs: SyncBlob[]): object {
    // Last-write-wins by default
    // Extendable: CRDT, vector clock
  }
}

/*
  CLIENT ENCRYPTION (WEB CRYPTO)
  ============================
*/

// All encryption is client-side only!
const crypto = window.crypto.subtle

async function encrypt(data: object, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  
  const ciphertext = await crypto.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  )
  
  // Return: nonce + ciphertext (both base64)
  return btoa(iv) + '.' + btoa(ciphertext)
}

async function decrypt(payload: string, key: CryptoKey): Promise<object> {
  const [iv64, data64] = payload.split('.')
  const iv = Uint8Array.from(atob(iv64), c => c.charCodeAt(0))
  const data = Uint8Array.from(atob(data64), c => c.charCodeAt(0))
  
  const decrypted = await crypto.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )
  
  return JSON.parse(new TextDecoder().decode(decrypted))
}

async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const keyMaterial = await importKey(passphrase)
  return crypto.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/*
  QR TOKEN FLOW (DEVICE PAIRING)
  =============================
*/

// Generate pairing token for new device
function generatePairingToken(): string {
  // 256-bit random, Base64URL
  return randomBytes(32).base64Url()
}

// Embed in QR for transfer
function tokenToQR(token: string): string {
  // Returns QR code as data URL
}

// Scan + validate token
async function importPairingToken(token: string): Promise<DeviceIdentity> {
  // Validate checksum
  // Derive identity from token
  // Join chain on next sync
}

/*
  CF WORKER CODE
  =============
*/

// worker.ts (simplified)
export default {
  async fetch(req) {
    const url = new URL(req.url)
    
    if (url.pathname === '/sync/handshake' && req.method === 'POST') {
      return handleHandshake(await req.json())
    }
    
    if (url.pathname === '/sync/push' && req.method === 'POST') {
      return handlePush(await req.json())
    }
    
    if (url.pathname === '/sync/pull') {
      return handlePull(url.searchParams)
    }
    
    return new Response('Not Found', { status: 404 })
  }
}

async function handleHandshake(body) {
  // Blind: just store device registration
  // Return: chain data, last sequence
}

async function handlePush(body: SyncBlob) {
  // Blind: bucket.put(key, encrypted)
  // Return: success
}

async function handlePull(params) {
  // Blind: bucket.list + filter by chain/seq
  // Return: blobs array
}

/*
  CONFLICT RESOLUTION
  ===================
*/

type ResolutionStrategy = 'last-write-wins' | 'crdt' | 'vector-clock'

// Default: last-write-wins by sequence
function resolveConflicts(blobs: SyncBlob[]): object[] {
  return blobs.sort((a, b) => b.seq - a.seq).slice(0, 1)
}

/*
  SECURITY NOTES
  ============
  
  1. syncKey NEVER transmitted
  2. Worker stores ONLY ciphertext
  3. Each device has unique derived key
  4. QR/blobs = bearer token (keep secret!)
  5. MIT license = auditable
*/
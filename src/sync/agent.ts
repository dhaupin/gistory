// 📋 SyncAgent - Client-Side Encryption & Sync
// Gistory Sync Chain - Browser Side
// ================================
//
// Key model (Brave-style chain):
//   passphrase + chainId  --PBKDF2-->  AES-GCM master key
//
// The chainId is the *salt* and the chain identifier. It travels in the
// pairing token/QR, never the passphrase. Every device that has the same
// passphrase and the same chainId derives the SAME key, so blobs pushed by
// one device can be decrypted by the others. The server only ever sees
// ciphertext.

// --- Storage keys -----------------------------------------------------------

const DEVICE_ID_KEY = 'gistory_device_id'
const DEVICE_NAME_KEY = 'gistory_device_name'
const seqKey = (chainId: string) => `gistory_seq_${chainId}`

// --- Small helpers ----------------------------------------------------------

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function buf2base64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  bytes.forEach(b => (binary += String.fromCharCode(b)))
  return btoa(binary)
}

function base642buf(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- Crypto (client side only) ---------------------------------------------

export async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptPayload(data: unknown, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data)),
  )
  return buf2base64(iv) + '.' + buf2base64(ciphertext)
}

export async function decryptPayload<T = unknown>(payload: string, key: CryptoKey): Promise<T> {
  const [iv64, data64] = payload.split('.')
  if (!iv64 || !data64) throw new Error('malformed ciphertext')
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base642buf(iv64) },
    key,
    base642buf(data64),
  )
  return JSON.parse(dec.decode(plaintext)) as T
}

// --- Chain / pairing helpers -------------------------------------------------

/** A fresh random chain id (also used as the PBKDF2 salt). */
export function newChainId(): string {
  return generateUUID()
}

/** The code shown in the pairing QR — carries the chain id, not the passphrase. */
export function pairingTokenFromChain(chainId: string): string {
  return `GS1-${chainId}`
}

/**
 * Accepts a pairing token (`GS1-<chainId>`), a legacy `#join:<chainId>` link,
 * or a bare chain id, and returns the chain id (or null when invalid).
 */
export function chainIdFromToken(token: string): string | null {
  const raw = (token || '').trim()
  const candidates = [
    raw,
    raw.replace(/^GS1-/i, ''),
    raw.replace(/^#join:/i, ''),
  ]
  for (const candidate of candidates) {
    if (/^[A-Za-z0-9-]{8,64}$/.test(candidate)) return candidate
  }
  return null
}

/** A human-friendly default device name, e.g. "Chrome · macOS". */
export function suggestDeviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const platform =
    /Mac/i.test(ua) ? 'macOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Linux/i.test(ua) ? 'Linux'
    : 'Device'
  const browser =
    /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Safari\//i.test(ua) ? 'Safari'
    : 'Browser'
  return `${browser} · ${platform}`
}

// --- Types -------------------------------------------------------------------

export interface RemoteDevice {
  id: string
  name: string
  lastSeen: number
}

export interface ChainStatus {
  chainId: string
  serverSeq: number
  version: number
  devices: RemoteDevice[]
}

export interface PullResult {
  blobs: unknown[]
  serverSeq: number
  failures: number
}

export interface SyncConfig {
  /** Base URL of the sync API. Empty string means same-origin (production). */
  baseUrl?: string
  /** The user's passphrase. NEVER leaves the device. */
  passphrase: string
  /** Label shown to other devices in this chain. */
  deviceName: string
  /** Chain id — also the PBKDF2 salt. */
  chainId: string
}

const PULL_LIMIT = 500

// --- SyncAgent ---------------------------------------------------------------

export class SyncAgent {
  private config: SyncConfig
  private baseUrl: string
  private deviceId = ''
  private key: CryptoKey | null = null
  private lastSeq = 0

  constructor(config: SyncConfig) {
    this.config = config
    this.baseUrl = (config.baseUrl ?? '').replace(/\/+$/, '')
  }

  // Initialize/restore identity and derive the chain key.
  async init(): Promise<void> {
    const storedId = localStorage.getItem(DEVICE_ID_KEY)
    const deviceId = storedId || generateUUID()
    if (!storedId) localStorage.setItem(DEVICE_ID_KEY, deviceId)
    this.deviceId = deviceId

    const storedName = localStorage.getItem(DEVICE_NAME_KEY)
    if (storedName) this.config.deviceName = storedName

    // Salt = chainId, so every device in the chain derives the same key.
    this.key = await deriveKey(this.config.passphrase, this.config.chainId)

    const since = Number(localStorage.getItem(seqKey(this.config.chainId)) || 0)
    this.lastSeq = Number.isFinite(since) ? since : 0
  }

  // Register this device with the chain and learn the current server head.
  async handshake(): Promise<ChainStatus> {
    this.assertReady()
    const status = await this.request<ChainStatus>('/sync/handshake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: this.config.chainId,
        deviceId: this.deviceId,
        deviceName: this.config.deviceName,
      }),
    })
    // NOTE: we deliberately do not advance the pull watermark here — any blobs
    // already on the server still need to be pulled by the caller.
    this.persistDeviceName()
    return status
  }

  // Update the label other devices see for this device.
  setDeviceName(name: string) {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    this.config.deviceName = trimmed
    this.persistDeviceName()
  }

  private persistDeviceName() {
    localStorage.setItem(DEVICE_NAME_KEY, this.config.deviceName)
  }

  // Encrypt the full snapshot and store it. Returns the server-assigned seq.
  async push(data: object): Promise<number> {
    this.assertReady()
    const payload = await encryptPayload(
      { ...data, senderDeviceId: this.deviceId, sentAt: Date.now() },
      this.key!,
    )

    const result = await this.request<{ seq: number; serverSeq: number }>('/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: this.config.chainId,
        deviceId: this.deviceId,
        data: payload,
      }),
    })

    // A push must NOT advance the pull watermark: another device may have
    // written blobs below our new seq that we haven't seen yet.
    return result.seq
  }

  // Download and decrypt changes from other devices since our last bookmark.
  async pull(): Promise<PullResult> {
    this.assertReady()
    const out: unknown[] = []
    let since = this.lastSeq
    let serverSeq = this.lastSeq
    let failures = 0
    let retryFrom = Infinity

    for (let i = 0; i < 20; i++) {
      const res = await this.request<{
        blobs: { seq: number; data: string }[]
        serverSeq: number
      }>(
        `/sync/pull?chain=${encodeURIComponent(this.config.chainId)}` +
          `&since=${since}&deviceId=${encodeURIComponent(this.deviceId)}`,
      )

      const blobs = res.blobs || []
      serverSeq = typeof res.serverSeq === 'number' ? res.serverSeq : since
      if (blobs.length === 0) {
        since = Math.max(since, serverSeq)
        break
      }

      for (const blob of blobs) {
        try {
          out.push(await decryptPayload(blob.data, this.key!))
        } catch {
          failures++
          retryFrom = Math.min(retryFrom, blob.seq)
        }
        since = Math.max(since, blob.seq)
      }

      if (since >= serverSeq) break
    }

    // If some blobs could not be decrypted, keep the watermark before the first
    // failure so a later sync (with the right passphrase) can retry them.
    if (failures > 0 && retryFrom !== Infinity) {
      since = Math.min(since, retryFrom - 1)
    }

    this.lastSeq = Math.max(this.lastSeq, since)
    this.persistSeq()
    return { blobs: out, serverSeq, failures }
  }

  // Chain health: head sequence + known devices.
  async status(): Promise<ChainStatus | null> {
    if (!this.deviceId) return null
    try {
      return await this.request<ChainStatus>(
        `/sync/status?chain=${encodeURIComponent(this.config.chainId)}`,
      )
    } catch {
      return null
    }
  }

  getDeviceId(): string {
    return this.deviceId
  }

  getChainId(): string {
    return this.config.chainId
  }

  getDeviceName(): string {
    return this.config.deviceName
  }

  getLastSeq(): number {
    return this.lastSeq
  }

  // --- internals ------------------------------------------------------------

  private persistSeq() {
    localStorage.setItem(seqKey(this.config.chainId), String(this.lastSeq))
  }

  private assertReady() {
    if (!this.key || !this.deviceId) {
      throw new Error('Sync agent is not initialized')
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, init)
    } catch (err) {
      throw new Error('Cannot reach the sync server — are you offline?')
    }

    const text = await response.text()
    let body: any = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = null
      }
    }

    if (!response.ok) {
      const message =
        (body && (body.error || body.message)) ||
        `Sync request failed (${response.status})`
      throw new Error(message)
    }
    if (body === null) throw new Error('Sync server returned an invalid response')
    return body as T
  }
}

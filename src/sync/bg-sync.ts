// Client plumbing for background sync (rollout step 3, labs/prd-sync.md).
//
// Step 3 wires the CLIENT side of wake targets: the Settings toggle asks the
// relay whether push wiring exists yet (GET /sync/subscribe), and if it does,
// requests notification permission, creates a PushSubscription (which NEEDS a
// service worker — that is step 2's registration), and stores the wake target
// on the relay under this chain + deviceId. Fan-out is step 4, so a
// subscription stored now wakes nobody; the row sits ready for it.
//
// This module deliberately does NOT touch permissions beyond asking once:
// permission state needs a user gesture and re-checks render the toggle's
// state rather than spam the browser. Every awkward browser (iOS without
// install) falls back to capability detection and the row simply does not
// render there — keeping the old catch-up behavior untouched is the
// requirement, not a compromise.

import { SYNC_BASE } from './identity'
import { stGetString, stSetString } from './idb'

const ENDPOINT_KEY = 'gistory_push_endpoint'

/** Endpoint for the wake target we set on the relay; null = never subscribed. */
export function getStoredEndpoint(): string | null {
  return stGetString(ENDPOINT_KEY)
}

/**
 * The persisted device id, straight from storage. Deliberately not read off
 * the live agent: this device's registration may be mid-handshake (offline,
 * relay restarting) while the row still needs an identity to store the wake
 * target under — the id is written by `agent.init()` during that same boot,
 * so it is current whenever the app is.
 */
export function getStoredDeviceId(): string | null {
  return stGetString('gistory_device_id')
}

function setStoredEndpoint(endpoint: string | null): void {
  stSetString(ENDPOINT_KEY, endpoint)
}

/** Whether this device could ever use background sync at all. */
export function backgroundSyncSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    window.isSecureContext === true
  )
}

/**
 * Ask the relay whether push wiring is on (VAPID configured + fan-out).
 * Returns the whole config object, or null when the relay is unreachable or
 * outdated — callers must treat null as "cannot subscribe now".
 */
export async function fetchSyncConfig(): Promise<{ enabled: boolean; publicKey: string | null } | null> {
  try {
    const res = await fetch(`${SYNC_BASE}/sync/subscribe`, { method: 'GET' })
    if (!res.ok) return null
    const body = (await res.json()) as { enabled?: unknown; publicKey?: unknown }
    return {
      enabled: body.enabled === true,
      publicKey: typeof body.publicKey === 'string' ? body.publicKey : null,
    }
  } catch {
    return null
  }
}

/**
 * Subscribe this device: user prompt -> PushSubscription -> store on relay.
 * Throws Error with a SHORT user-facing message; the Settings row displays
 * everything it says.
 */
export async function enableAndSubscribe(chainId: string, deviceId: string): Promise<void> {
  if (!backgroundSyncSupported()) throw new Error('Background sync unsupported on this device')

  const config = await fetchSyncConfig()
  if (!config || !config.enabled || !config.publicKey) {
    throw new Error('This Gistory server does not have background sync configured yet')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications permission was denied')

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) throw new Error('Service worker is not available yet')

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, // Chrome hard-requires the flag; it is not a promise to show anything
    applicationServerKey: urlBase64ToUint8Array(config.publicKey),
  })

  const json = subscription.toJSON() as {
    endpoint?: string
    keys?: Record<string, string>
  }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('The browser issued an unusable push subscription')
  }

  const res = await fetch(`${SYNC_BASE}/sync/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId,
      deviceId,
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  })
  if (!res.ok) {
    // Surface the relay's own words — they are already user-shaped strings.
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `Could not store the wake target (${res.status})`)
  }
  setStoredEndpoint(json.endpoint)
}

/**
 * Unsubscribe both sides: on the relay (needs the stored endpoint + this
 * device id), then in the browser. Best-effort — a device leaving a chain
 * should stop being woken, but a failed DELETE never blocks the flow.
 */
export async function unsubscribeBackground(deviceId: string): Promise<void> {
  const endpoint = getStoredEndpoint()
  const registration = typeof navigator !== 'undefined'
    ? await navigator.serviceWorker?.getRegistration()
    : null

  if (endpoint && deviceId) {
    try {
      await fetch(`${SYNC_BASE}/sync/subscribe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, deviceId }),
      })
    } catch {
      /* relay unreachable: the browser-side unsubscribe below still runs */
    }
  }

  try {
    const sub = await registration?.pushManager.getSubscription()
    await sub?.unsubscribe()
  } catch {
    /* the row ages out via the relay's own failure pruning */
  }
  setStoredEndpoint(null)
}

// Wire-format helper: the browser wants an ArrayBuffer for VAPID keys.
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

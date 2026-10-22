// Gistory service worker — the real one, built via esbuild (scripts/build-sw.mjs)
// so it shares the EXACT agent crypto, merge logic, and IndexedDB layer with
// the page. `public/sw.js` stays the dev-time passive placeholder: in a dev
// preview without a build there is no fan-out to handle, and a placeholder
// registration keeps the workflow honest. After `bun run build`, dist/sw.js
// overwrites the placeholder at the same path.
//
// Wake contract (labs/prd-sync.md):
//   ping {chainId, n} → ensure IndexedDB hydration → passphrase from the
//   same store → pull (decrypt) → merge into the shared stores → notify any
//   open-page BroadcastChannel listeners → push the merged snapshot so
//   catch-up converges even with nobody watching.
//
// Everything here is best-effort: the watermark guarantees no device ever
// loses a blob, so a failed or skipped wake costs pacing, never data. An
// unhandled rejection inside a 'push' listener is counted against the
// subscription by browsers — swallow at every boundary.

/// <reference lib="webworker" />

import { ensureStorageReady, stGetString, stSetString } from '../sync/idb'
import { SyncAgent } from '../sync/agent'
import { emptyDeleted, mergePayload, normalizeDeleted, type SyncData } from '../sync/merge'
import { loadView, saveView } from '../sync/view-state'

const KEY_THREADS = 'gistory_threads'
const KEY_MESSAGES = 'gistory_messages'
const KEY_PROJECTS = 'gistory_projects'
const KEY_DELETED = 'gistory_deleted'
const KEY_SETTINGS = 'gistory_settings'
const KEY_SYNC_KEY = 'gistory_sync_key'
const KEY_CHAIN = 'gistory_chain_id'
const KEY_DEVICE_NAME = 'gistory_device_name'
const KEY_WRITE_SECRET = 'gistory_write_secret'
const CHANNEL_NAME = 'gistory-sync'

/** The same snapshot read the page's App.snapshot() performs, from IDB. */
function loadSnapshot(): SyncData {
  const parse = <T>(key: string, fallback: T): T => {
    try {
      const raw = stGetString(key)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      return parsed && typeof parsed === 'object' ? (parsed as T) : fallback
    } catch {
      return fallback
    }
  }
  return {
    threads: parse(KEY_THREADS, [] as SyncData['threads']),
    messages: parse(KEY_MESSAGES, {} as SyncData['messages']),
    projects: parse(KEY_PROJECTS, [] as SyncData['projects']),
    deleted: normalizeDeleted(parse(KEY_DELETED, emptyDeleted())),
    view: loadView(),
    settings: parse(KEY_SETTINGS, {} as SyncData['settings']),
  }
}

function saveSnapshot(data: SyncData): void {
  const put = (key: string, value: unknown) => stSetString(key, JSON.stringify(value))
  put(KEY_THREADS, data.threads)
  put(KEY_MESSAGES, data.messages)
  put(KEY_PROJECTS, data.projects)
  put(KEY_DELETED, data.deleted)
  saveView(data.view)
  put(KEY_SETTINGS, data.settings)
}

/** Nudge any open tab so it re-renders the merged state without waiting for
 *  its own 60s timer. Broadcasts are fire-and-forget; a closed listener is
 *  a no-op. */
function notifyOpenPages(count: number): void {
  try {
    // BroadcastChannel exists in every strict-mode service worker context.
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage({ type: 'sync', count })
    channel.close()
  } catch {
    /* an open page was presumably on screen; it will pull on its own timer */
  }
}

/**
 * Is a LIVE app tab open for this origin? Only the app (hash-routed) pages
 * pull on their own; a prerendered landing page counts as a controlled client
 * but has no sync loop, so it can never carry the redirect. A frozen
 * background page (Chrome suspends it after minutes) is also a poor redirect
 * target — but its unfreeze path has its own visibilitychange handler that
 * catches up on focus, so correctness is never lost, only paced.
 */
const swGlobal = self as unknown as {
  clients: {
    matchAll: (opts?: {
      type?: string
      includeUncontrolled?: boolean
    }) => Promise<{ url: string }[]>
  }
}

async function hasLiveAppPage(): Promise<boolean> {
  try {
    const clients = await swGlobal.clients.matchAll({ type: 'window', includeUncontrolled: true })
    return clients.some((c) => {
      try {
        return new URL(c.url).hash.startsWith('#/')
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

/** One wake at a time: two pushes a second apart would otherwise run two
 *  concurrent pull→merge→push rounds with the SAME watermark — duplicate
 *  blobs and interleaved idb writes for nothing. A skip is free: the skipped
 *  ping's data is still above the watermark, and browsers keep delivering
 *  pings (budget-bounded, budget skips, catch-up covers skips). */
let waking = false

async function handleWake(chainId: string): Promise<void> {
  if (waking) return
  waking = true
  try {
    await runWake(chainId)
  } finally {
    waking = false
  }
}

async function runWake(chainId: string): Promise<void> {
  // An OPEN page owns this wake: it does its own pull → merge → render (that
  // is exactly what the BroadcastChannel ping below triggers), and letting
  // the SW do the same work would make two processes write the shared
  // IndexedDB stores — the page's next local save then overwrites the SW's
  // merge with its stale snapshot, bouncing the same data around the chain.
  // With no live app page this branch is skipped and the SW does the work.
  if (await hasLiveAppPage()) {
    notifyOpenPages(0)
    return
  }

  await ensureStorageReady()

  // A device runs exactly one configured chain; a wake for anything else
  // targets a subscription from an earlier life. Also guards a device that
  // turned sync off: no key material, nothing to pull, nothing to write.
  const passphrase = stGetString(KEY_SYNC_KEY)
  const storedChain = stGetString(KEY_CHAIN)
  if (!passphrase || !storedChain) return
  if (chainId && chainId !== storedChain) return

  const agent = new SyncAgent({
    // Same-origin: a service worker's fetches carry the origin automatically.
    baseUrl: '',
    passphrase,
    deviceName: stGetString(KEY_DEVICE_NAME) || 'Gistory Worker',
    chainId: storedChain,
    writeSecret: stGetString(KEY_WRITE_SECRET) ?? undefined,
  })
  await agent.init()

  const { blobs, failures } = await agent.pull()

  if (blobs.length > 0) {
    let data = loadSnapshot()
    for (const blob of blobs) {
      data = mergePayload(data, blob as Parameters<typeof mergePayload>[1], agent.getDeviceId())
    }
    saveSnapshot(data)
  }

  // An undecryptable blob parked the watermark this pull (poisoned chain or
  // wrong passphrase); the next open page re-reports it. Push only a clean
  // merge — a poisoned pull's snapshot is identical to other devices'
  // anyway, and that push would buy the chain another wake round for it.
  if (blobs.length > 0 && failures === 0) {
    try {
      await agent.push(loadSnapshot())
    } catch {
      /* the periodic page sync retries; the merge already persisted */
    }
    notifyOpenPages(blobs.length)
  }
}

export {}; // esbuild entry: bundle side-effect only, no exports

// --- Events -------------------------------------------------------------------
// Typed loosely: this file is bundled by esbuild (not vite's lib), and the
// web-worker DOM mappings differ between tsconfig runs, so the push event is
// its narrowest honest shape rather than a sweep-in of lib.d.ts.

interface SWPushEvent {
  data?: { json: () => unknown }
  waitUntil: (promise: Promise<unknown>) => void
}

const sw = self as unknown as {
  addEventListener: (type: 'push', listener: (event: SWPushEvent) => void) => void
}

sw.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let chainId = ''
      try {
        // The ping format is always {chainId[, n]}; an unreadable payload is
        // still a valid wake for "the stored chain".
        const body: { chainId?: unknown } | null = event.data ? (event.data.json() as { chainId?: unknown }) : null
        if (body && typeof body.chainId === 'string') chainId = body.chainId
      } catch {
        /* empty body falls through to the stored chain below */
      }
      const target = chainId || stGetString(KEY_CHAIN) || ''
      await handleWake(target)
    })().catch(() => {
      /* a failed wake is pacing, not data — never an unhandled rejection */
    })
  )
})

// IndexedDB-backed persistence for sync state.
//
// Rollout step 1 of labs/prd-sync.md. Nothing here changes what is stored —
// the same keys, the same JSON strings, the same loaders the app already had
// in localStorage — only WHERE the authoritative copy lives and who can read
// it. Motivation: a service worker cannot read localStorage, but CAN read
// IndexedDB, so every key a future background sync needs moves here now,
// while there is no background sync yet to break.
//
// Three layers, in order of what reads what:
//
//   1. In-memory map (`mem`) — every read after hydration, both page and
//      (later) service worker share this module's copy of the truth.
//   2. IndexedDB (`gistory` / `kv` store) — the authoritative home, written
//      first on every save.
//   3. localStorage — demoted to a last-known-good SHADOW: after each
//      SUCCESSFUL IndexedDB write the same JSON is mirrored there. If an
//      IndexedDB write fails, the shadow keeps the last value that actually
//      landed, which is what a reload will read. It is a rollback net for
//      the bake phase; rollout step 4 (push wiring) removes it.
//
// Migration is one-copy-on-first-hydration: if IndexedDB has no rows and
// localStorage still carries sync keys, they are copied INTO IndexedDB (and
// the shadow continues from there). localStorage keys are deliberately NOT
// deleted in this step — deleting them is safe only once the IndexedDB path
// has proven itself on the live chain's devices.
//
// Where `indexedDB` does not exist (bun/node — the smoke test, the prerender)
// the module degrades to exactly today's behavior: reads fall through to
// localStorage and writes go to both. The fake localStorage the smoke test
// injects keeps working untouched, and `agent.init()` remains callable
// without a browser or a boot gate.
//
// All names are deliberately boring: one module, no reactive wrapper — the
// app's React state remains the source of truth during a session; this is
// only where it persists between sessions.

const DB_NAME = 'gistory'
const DB_VERSION = 1
const STORE = 'kv'

// --- The sync keys, and the exception list ----------------------------------

/**
 * Keys that move to IndexedDB. `gistory_seq_` is a prefix: a device keeps its
 * pull watermark of every chain it has ever joined, so the exact list is only
 * known at runtime.
 */
export const SYNC_KEYS = [
  'gistory_threads',
  'gistory_messages',
  'gistory_projects',
  'gistory_deleted',
  'gistory_view',
  'gistory_settings',
  'gistory_device_id',
  'gistory_device_name',
  'gistory_sync_key',
  'gistory_chain_id',
  'gistory_write_secret',
  // Background-sync wake target (rollout step 3): the endpoint this device
  // subscribed with, so it can unsubscribe when sync is disabled.
  'gistory_push_endpoint',
  // Opt-in badge (step 6): the SW reads this one itself on a wake — it is
  // device-local UI state that uses the shared layer only because that is
  // where the worker can see it.
  'gistory_notify_wake',
] as const

/** True for a key the module owns. Used by the migration and by tests. */
export function isSyncKey(key: string): boolean {
  return (SYNC_KEYS as readonly string[]).includes(key) || key.startsWith('gistory_seq_')
}

/** Keys that deliberately stay in localStorage (device-local UI state). */
const RESIDENT_KEYS = [
  'gistory_dark',
  'gistory_sort',
  'gistory_onboarded',
  'gistory_backup_nudge_dismissed',
  'gistory_last_export',
]

// --- Module state ------------------------------------------------------------

let mem = new Map<string, string>()
let ready: Promise<void> | null = null
/**
 * `browser`  — IndexedDB works; kicks off the initial copy and everything
 *              after is authoritative-from-IDB, shadowed to localStorage.
 * `fallback` — no IndexedDB (node/bun/prerender/broken private mode): reads
 *              go to the mem map seeded from localStorage, writes go to both,
 *              seed-from-... i.e. behavior identical to what the app had.
 * `failed`   — IndexedDB exists but could not be opened: reads fall back to
 *              the same pattern as fallback, never blocking.
 */
let mode: 'browser' | 'fallback' | 'failed' = 'fallback'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB blocked by another tab'))
  })
}

function idbReadAll(db: IDBDatabase): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const rows = new Map<string, string>()
    const cursor = store.openCursor()
    cursor.onsuccess = () => {
      const at = cursor.result
      if (at) {
        // Only strings are ever written here; ignore anything else so a
        // hand-written row cannot poison a typed loader.
        if (typeof at.value === 'string') rows.set(String(at.key), at.value)
        cursor.result.continue()
      } else resolve(rows)
    }
    cursor.onerror = () => reject(cursor.error)
  })
}

function idbWrite(db: IDBDatabase, key: string, value: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    if (value === null) store.delete(key)
    else store.put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
  })
}

/**
 * Seed the in-memory map and, on the first ever run, copy the localStorage
 * sync keys into IndexedDB. Idempotent and memoized; every caller shares one
 * in-flight hydration so the boot gate and an early agent init cannot race.
 */
export function ensureStorageReady(): Promise<void> {
  if (ready) return ready

  ready = (async () => {
    // Prerender / smoke: no indexedDB at all. Seed the map from whatever
    // localStorage exists (the prerender guard means "none"; agent paths in
    // tests mean "the injected fake") and keep delegating to it.
    if (typeof indexedDB === 'undefined') {
      mode = 'fallback'
      if (typeof localStorage !== 'undefined') seedFromLocal()
      return
    }

    const db = await openDatabase().catch(() => null)
    if (db) mode = 'browser'
    if (!db) {
      // Could be private mode, a blocked tab, or a corrupt database. Degrade
      // to localStorage — the app has always worked this way.
      mode = 'failed'
      if (typeof localStorage !== 'undefined') seedFromLocal()
      return
    }

    const rows = await idbReadAll(db).catch(() => null)
    if (!rows) {
      mode = 'failed'
      if (typeof localStorage !== 'undefined') seedFromLocal()
      return
    }

    if (rows.size === 0) {
      // First run of this build: copy every sync key (including the per-chain
      // watermarks) from localStorage into IndexedDB. mem gets what we copy;
      // keys resident only to the UI stay where they are.
      if (typeof localStorage !== 'undefined') {
        for (const key of ownedStorageKeys()) {
          const value = localStorage.getItem(key)
          if (value == null) continue
          mem.set(key, value)
          await idbWrite(db, key, value).catch(() => undefined)
        }
      }
    } else {
      // Authoritative boot: whatever IndexedDB holds is the truth, even if a
      // localStorage shadow says otherwise.
      mem = rows
    }

    // Keep Chrome from evicting the store the sync loop depends on. Chrome
    // weighs engagement per origin, so a request must come from real use —
    // best effort, failure is ordinary and harmless.
    try {
      void navigator.storage?.persist?.()
    } catch {
      /* ignored */
    }

    // Close the handle we only needed for boot; each subsequent write opens
    // its own short-lived transaction.
    db.close()
  })().catch(() => {
    mode = 'failed'
  })

  return ready
}

function seedFromLocal() {
  if (typeof localStorage === 'undefined') return
  for (const key of ownedStorageKeys()) {
    const value = localStorage.getItem(key)
    if (value != null) mem.set(key, value)
  }
}

/** The owned keys as they exist right now: the known list plus any watermark. */
function ownedStorageKeys(): string[] {
  const keys: string[] = [...SYNC_KEYS]
  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('gistory_seq_') && !keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

/**
 * Keys the caller can enumerate for cleanup (draft rows, etc.), by prefix,
 * from BOTH stores the module can see: during browser mode the mem map holds
 * the hydrated truth, but keys written ONLY to localStorage (draft rows are
 * deliberately resident) are never in it — and in fallback mode localStorage
 * is the only store. The copy may include duplicates across the two sources
 * (a browser-shadowed key exists in both); callers delete via stSetString,
 * which heals both sides, so a duplicate is at worst a redundant no-op.
 */
export function stKeyList(prefix: string): string[] {
  const found = new Set<string>()
  for (const key of mem.keys()) if (key.startsWith(prefix)) found.add(key)
  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) found.add(key)
    }
  }
  return [...found]
}

// --- The synchronous API the app's loaders use -------------------------------

/**
 * Read a persisted value. Returns null like `localStorage.getItem` would.
 * MUST be called after `ensureStorageReady()` resolved (the boot gate does
 * this; agents re-check internally), otherwise it reads the pre-hydration
 * map — which, when nothing was read yet, is just whatever was already
 * loaded. Tests and the prerender are handled inside `ensureStorageReady`.
 */
export function stGetString(key: string): string | null {
  // Browser mode reads the hydrated mem map. Every other mode — including a
  // browser whose IndexedDB would not open — reads through to localStorage on
  // EVERY call rather than from a cached map. The smoke test swaps whole fake
  // storage objects per simulated device, which a real browser can never do
  // (one origin = one store); read-through keeps that choreography working.
  if (mode === 'browser') return mem.get(key) ?? null
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(key)
}

/**
 * Persist a value. Writes the mem map synchronously, then IndexedDB, then —
 * only after the IndexedDB write succeeded — mirrors to the localStorage
 * shadow. `null` deletes the key everywhere.
 */
export function stSetString(key: string, value: string | null): void {
  // No IndexedDB (fallback/failed/prerender tests): write straight through to
  // localStorage so the session and a page reload behave exactly as before
  // this module existed. No cross-call memory cache here — the caller's view
  // may be swapped wholesale between calls (that is how the smoke test
  // emulates separate devices), so localStorage stays the live truth.
  if (mode !== 'browser') {
    if (typeof localStorage !== 'undefined') {
      try {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      } catch {
        /* storage full — data stays correct in memory */
      }
    }
    return
  }

  // Browser mode: the mem map is written first so a read later in this task
  // sees it even before the IndexedDB transaction commits.
  if (value === null) mem.delete(key)
  else mem.set(key, value)
  void writeThrough(key, value)
}

// One REUSED connection instead of an open+write+close round trip per write.
// The db is version-1-stable (the boot path owns upgrades), so there is no
// versionchange churn to lose connection state over; the only failure mode a
// stale handle has (it was closed underneath us) is handled by the one retry
// with a fresh open in writeThrough. One open per write burst saves the most
// common small churn (draft autosaves) from fetching the database every time.
let cachedDb: IDBDatabase | null = null

async function conn(): Promise<IDBDatabase | null> {
  if (cachedDb) return cachedDb
  const db = await openDatabase().catch(() => null)
  if (db) cachedDb = db
  return cachedDb
}

function dropConn(): void {
  try {
    cachedDb?.close()
  } catch {
    /* already broken; the fresh open below replaces it */
  }
  cachedDb = null
}

async function writeThrough(key: string, value: string | null) {
  let ok = false
  let db = await conn()
  if (db) {
    try {
      await idbWrite(db, key, value)
      ok = true
    } catch {
      // A closed-underneath handle fails its transaction; rebuild once.
      dropConn()
      db = await conn()
      try {
        if (db) {
          await idbWrite(db, key, value)
          ok = true
        }
      } catch {
        /* nothing more to try; the shadow below is the read path then */
      }
    }
  }
  if (ok) {
    // Mirror to localStorage only on SUCCESS, so the shadow is always the
    // last state a reload could actually restore from.
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      /* shadow write failing costs nothing; IndexedDB has the data */
    }
  } else {
    // IndexedDB unavailable now: keep the shadow updated anyway, since a
    // reload will read through it next time the database refuses to open.
    try {
      if (typeof localStorage !== 'undefined') {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      }
    } catch {
      /* nothing persisted; mem still holds the session */
    }
  }
}

/** Test/browser-debug seam: what mode is the storage layer operating in. */
export function storageMode(): 'browser' | 'fallback' | 'failed' {
  return mode
}

/** Test seam: forget the memoized hydration so a suite can start over. */
export function resetStorageSync(): void {
  ready = null
  mem = new Map()
  mode = 'fallback'
}

export { RESIDENT_KEYS }

// Shared helpers for the /sync Pages Functions.
//
// The server is deliberately "blind": it stores opaque encrypted blobs and
// hands out monotonically increasing sequence numbers. It never sees plaintext
// and never needs the passphrase.
//
// Files/directories prefixed with "_" are ignored by the Pages router, so this
// module is not exposed as an endpoint.

// --- Minimal D1 surface (avoids requiring @cloudflare/workers-types) --------

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean; changes?: number }>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
}

export interface SyncEnv {
  GISTRY_DB?: D1Database
}

// --- HTTP helpers ------------------------------------------------------------

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

export function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status)
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function getDb(env: SyncEnv | undefined): D1Database | null {
  return env?.GISTRY_DB ?? null
}

// --- Validation --------------------------------------------------------------

// chainId doubles as the PBKDF2 salt, so keep it URL-safe and bounded.
export function isValidChainId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id)
}

export function isValidDeviceId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{4,128}$/.test(id)
}

// --- Write capability --------------------------------------------------------
//
// A chain is only writable by a device holding the random write secret that was
// generated when the chain was created. The server keeps SHA-256 of it and
// never the secret itself, and never anything derived from the passphrase, so
// the relay stays blind to key material.

/** base64url, 43 chars for 32 bytes. URL-safe so it survives a QR / copy-paste. */
export function isValidWriteSecret(secret: unknown): secret is string {
  return typeof secret === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(secret)
}

/** SHA-256 of the write secret, hex encoded. */
export async function hashWriteSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Compare two hex digests without leaking their contents through timing.
 *
 * A naive `a === b` returns as soon as it finds a difference, which leaks how
 * many leading characters were correct. Hashes are compared in full either way.
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function readJson(request: Request): Promise<any | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

// --- Storage operations ------------------------------------------------------

export const MAX_PAYLOAD_BYTES = 5_000_000

export async function ensureChain(db: D1Database, chainId: string): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO chains (id, created_at, version) VALUES (?, ?, 1)')
    .bind(chainId, Date.now())
    .run()
}

/** The stored write-secret hash for a chain, or null when it is not secured yet. */
export async function getChainPushHash(db: D1Database, chainId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT push_hash FROM chains WHERE id = ?')
    .bind(chainId)
    .first<{ push_hash: string | null }>()
  const value = row?.push_hash
  return value == null || value === '' ? null : String(value)
}

/** True when this chain was created by this very call (so we may set its secret). */
export async function chainIsNew(db: D1Database, chainId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT push_hash FROM chains WHERE id = ?')
    .bind(chainId)
    .first<{ push_hash: string | null }>()
  return row == null
}

/**
 * Set the chain's write-secret hash. Only ever called when the hash is still
 * NULL, so a race between two claimants resolves to the first writer and the
 * loser is rejected rather than silently overwriting an existing capability.
 */
export async function setChainPushHash(
  db: D1Database,
  chainId: string,
  pushHash: string,
): Promise<boolean> {
  const row = await db
    .prepare('UPDATE chains SET push_hash = ? WHERE id = ? AND push_hash IS NULL')
    .bind(pushHash, chainId)
    .run()
  // D1 reports affected rows via meta; absent that, re-read to be certain.
  if (typeof row.changes === 'number') return row.changes > 0
  return (await getChainPushHash(db, chainId)) === pushHash
}

export async function chainExists(db: D1Database, chainId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM chains WHERE id = ?')
    .bind(chainId)
    .first<{ id: string }>()
  return row != null
}

export async function getChainVersion(db: D1Database, chainId: string): Promise<number> {
  const row = await db
    .prepare('SELECT version FROM chains WHERE id = ?')
    .bind(chainId)
    .first<{ version: number }>()
  return row ? Number(row.version) : 1
}

export async function registerDevice(
  db: D1Database,
  chainId: string,
  deviceId: string,
  deviceName: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO devices (id, chain_id, name, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         chain_id = excluded.chain_id,
         name = excluded.name,
         last_seen = excluded.last_seen`,
    )
    .bind(deviceId, chainId, deviceName, Date.now())
    .run()
}

export async function touchDevice(
  db: D1Database,
  chainId: string,
  deviceId: string,
): Promise<void> {
  await db
    .prepare('UPDATE devices SET last_seen = ? WHERE id = ? AND chain_id = ?')
    .bind(Date.now(), deviceId, chainId)
    .run()
}

export async function serverSeq(db: D1Database, chainId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM blobs WHERE chain_id = ?')
    .bind(chainId)
    .first<{ seq: number }>()
  return row ? Number(row.seq) || 0 : 0
}

export interface DeviceRow {
  id: string
  name: string
  last_seen: number
}

export interface DeviceInfo {
  id: string
  name: string
  lastSeen: number
}

export async function listDevices(db: D1Database, chainId: string): Promise<DeviceInfo[]> {
  const { results } = await db
    .prepare(
      'SELECT id, name, last_seen FROM devices WHERE chain_id = ? ORDER BY last_seen DESC LIMIT 50',
    )
    .bind(chainId)
    .all<DeviceRow>()
  return (results || []).map(row => ({
    id: row.id,
    name: row.name,
    lastSeen: Number(row.last_seen) || 0,
  }))
}

/**
 * Append an encrypted blob with the next sequence number for the chain.
 * MAX(seq)+1 is computed inside the INSERT so it is a single atomic statement;
 * D1 serializes writes, and we retry once in a blue moon on a PK collision.
 */
export async function appendBlob(
  db: D1Database,
  chainId: string,
  deviceId: string,
  data: string,
): Promise<number> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await db
        .prepare(
          `INSERT INTO blobs (chain_id, seq, device_id, data, created_at)
           SELECT ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?
           FROM blobs WHERE chain_id = ?
           RETURNING seq`,
        )
        .bind(chainId, deviceId, data, Date.now(), chainId)
        .first<{ seq: number }>()
      if (row) return Number(row.seq)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError ?? new Error('Could not allocate a sequence number')
}

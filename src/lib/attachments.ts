// 🖼 Attachment plumbing for message images - the app-facing half.
//
// The GROUNDWORK for image support on thread messages (2026-10-25): the
// data model and the seams exist, the UI and rendering come after the
// method settles (see labs/TASKS.md pass receipt). The contract this file
// enforces, so the future UI cannot break the chain by accident:
//
//   1. Metadata rides the sync payload; BYTES NEVER DO. A message carries
//      `attachments: MessageAttachment[]` (models.ts), merged whole-item by
//      LWW with the rest of the message - no new merge rules. The blob
//      bytes live in the device-local IndexedDB `attachments` store
//      (src/sync/idb.ts, `put/get/deleteAttachmentBytes`).
//   2. Every device sees the metadata through the normal sync; the pixels
//      are device-local (rendered where uploaded). Replicating bytes
//      between devices is a LATER transport decision - deliberately out of
//      this groundwork, because full-state sync replaying blobs is the
//      cost class that filled the chain budget twice.
//   3. Trash hygiene mirrors sync hygiene: when a message that referenced
//      an attachment disappears (delete, edit-away, import conflict), the
//      sweepAttachmentBytes pass deletes the orphaned bytes. Nothing
//      self-heals silently in the other direction: a metadata row without
//      bytes renders as its own honest "missing" state later.
//
// Why stored bytes must never enter SyncData: the relay stores opaque
// ciphertext blobs and charges per-chain bytes per day; a base64 snapshot
// riding every full-state push would spend the chain's daily budget on
// replaying pixels nobody asked for. The `gistory_draft_*` sweep habit
// (sweepDrafts) is the pattern this follows.

'use strict'

import type { MessageAttachment, MessagesByThread } from './models'
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_BYTES } from './models'
import {
  allAttachmentIds,
  deleteAttachmentBytes,
  getAttachmentBytes,
  putAttachmentBytes,
} from '../sync/idb'

/**
 * Attach one image to a message. Persists the bytes device-locally and
 * returns the metadata record that goes on the message (which rides the
 * sync payload). Returns null when the caller's constraints were refused:
 *   - storage unavailable  -> refusals are named in the reasons below
 *   - over MAX_ATTACHMENT_BYTES
 *   - over MAX_ATTACHMENTS_PER_MESSAGE
 * Bumping the message's `updatedAt` is the CALLER's job (the same invariant
 * every other message edit obeys: a toggle that forgets to bump loses the
 * merge) - the store keeps its hands off message timestamps.
 */
export async function buildAttachment(
  file: { name: string; mime: string; bytes: ArrayBuffer | Blob; width?: number; height?: number },
  existing: MessageAttachment[],
  opts: { store?: (id: string, bytes: ArrayBuffer | Blob) => Promise<boolean> } = {},
): Promise<MessageAttachment | null> {
  if (existing.length >= MAX_ATTACHMENTS_PER_MESSAGE) return null
  const size =
    file.bytes instanceof Blob
      ? file.bytes.size
      : file.bytes.byteLength
  if (!(size > 0) || size > MAX_ATTACHMENT_BYTES) return null
  // The crashtest upload-family law, applied client-side: the verdict reads
  // what the handler DERIVES and STORES. Gistory derives the storage key
  // itself (a fresh `att_*` id) and NEVER trusts the client filename for
  // anything but display - so hostile names ('../../etc/passwd',
  // 'shell.php.jpg') are inert metadata by construction, proven in smoke
  // section 14.
  if (!isAllowedImageMime(file.mime)) return null
  const id = newAttachmentId()
  const stored = await (opts.store || putAttachmentBytes)(id, file.bytes)
  if (!stored) return null
  return {
    id,
    name: sanitizeName(file.name),
    mime: sanitizeMime(file.mime),
    bytes: size,
    ...(file.width ? { width: file.width } : {}),
    ...(file.height ? { height: file.height } : {}),
    addedAt: Date.now(),
  }
}

/** Every attachment id any message still references (the sweep keep-set). */
export function collectAttachmentIds(messages: MessagesByThread): Set<string> {
  const keep = new Set<string>()
  for (const list of Object.values(messages)) {
    for (const msg of list || []) {
      for (const att of msg.attachments || []) keep.add(att.id)
    }
  }
  return keep
}

/**
 * Delete byte rows no live message references. Call wherever sweepDrafts is
 * called (boot, after merges-with-changes, after deletes): the same moments
 * the visible-state garbage can be orphaned. Returns how many rows went.
 */
export async function sweepAttachmentBytes(messages: MessagesByThread): Promise<number> {
  const keep = collectAttachmentIds(messages)
  const all = await allAttachmentIds()
  let removed = 0
  for (const id of all) {
    if (!keep.has(id)) {
      await deleteAttachmentBytes(id)
      removed++
    }
  }
  return removed
}

/** The object URL helper a future renderer calls per image element. */
export function attachmentUrl(bytes: Blob | ArrayBuffer): string | null {
  try {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes])
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

// --- Cross-device byte replication (the payload-external channel) ----------
//
// The ground receipts named the trap: full-state sync replaying blobs is the
// cost class that filled the chain budget twice, so bytes never ride the
// payload. The deliberate shape instead: metadata merges like every other
// message field, and each device PULLS the byte rows it lacks through
// /sync/attach (write-auth'd, byte-budgeted, blind-relay) with the same AES
// key. Push happens at save time (uploadAttachmentBytes below), fetch happens
// wherever this file's harness runs - always behind a seam so the
// browserless battery can run the whole pipeline.

/**
 * The metadata every message carries, keyed by attachment id: what a
 * replication pass needs to fetch against (and what the size-integrity gate
 * checks the decrypt against).
 */
export function collectAttachmentInfo(messages: MessagesByThread): Map<string, { bytes: number; name: string }> {
  const map = new Map<string, { bytes: number; name: string }>()
  for (const list of Object.values(messages)) {
    for (const msg of list || []) {
      for (const att of msg.attachments || []) {
        if (!att || typeof att.id !== 'string') continue
        map.set(att.id, { bytes: att.bytes || 0, name: att.name || 'image' })
      }
    }
  }
  return map
}

/** Named outcome of one replication pass - a UI badge or a smoke check can
 *  count it; failures are named per id, never a silent chunk of dots. */
export interface ReplicationStats {
  referenced: number
  restored: number
  failed: { id: string; reason: string }[]
}

/**
 * Fetch every referenced-but-missing attachment's bytes. Called by the app
 * after ANY merge that landed metadata (pull path) - the same catch-up-on-open
 * correctness net prd-sync names for the wake path. Bounded: at most
 * MAX_REPLICATE_PER_PASS ids per call, so one pathological merge cannot spend
 * an afternoon of round-trips - the next pass picks up the rest.
 */
export const MAX_REPLICATE_PER_PASS = 64

export async function replicateMissingAttachments(
  messages: MessagesByThread,
  fetcher: { getAttachment(id: string, expectedBytes: number): Promise<Blob | ArrayBuffer> },
  opts: {
    bytesOf?: (id: string) => Promise<Blob | ArrayBuffer | null>
    storeOne?: (id: string, bytes: Blob | ArrayBuffer) => Promise<boolean>
  } = {},
): Promise<ReplicationStats> {
  const have = opts.bytesOf || getAttachmentBytes
  const storeOne = opts.storeOne || putAttachmentBytes
  const metas = collectAttachmentInfo(messages)

  const stats: ReplicationStats = { referenced: metas.size, restored: 0, failed: [] }
  if (metas.size === 0) return stats

  let budget = MAX_REPLICATE_PER_PASS
  for (const [id, meta] of metas) {
    if (await have(id)) continue
    if (budget <= 0) {
      stats.failed.push({ id, reason: 'budget exceeded — picked up on a later pass' })
      continue
    }
    budget--
    try {
      const bytes = await fetcher.getAttachment(id, meta.bytes)
      if (!(await storeOne(id, bytes))) {
        stats.failed.push({ id, reason: 'device-local store refused the bytes' })
        continue
      }
      stats.restored++
    } catch (err) {
      stats.failed.push({ id, reason: String((err as Error)?.message || err).slice(0, 100) })
    }
  }
  return stats
}

/**
 * Upload-side half: at save time, an attachment's local bytes ride to
 * /sync/attach once. Fire-and-forget by contract - the honest-missing UI
 * fallback already exists for the device that never got the row.
 * Returns false with a NAMED empty result when there are no local bytes
 * (a caller passed metadata for bytes it never stored).
 */
export async function uploadAttachmentBytes(
  uploader: { putAttachment(id: string, bytes: Blob | ArrayBuffer): Promise<boolean> },
  attId: string,
  opts: { bytesOf?: (id: string) => Promise<Blob | ArrayBuffer | null> } = {},
): Promise<boolean> {
  const bytesOf = opts.bytesOf || getAttachmentBytes
  const bytes = await bytesOf(attId)
  if (!bytes) return false
  await uploader.putAttachment(attId, bytes)
  return true
}

// --- Backup attachments (the opt-in byte payload) ----------------------------
//
// Backups stay metadata-only by default (the old payloads stay mergeable, and
// a multi-MB backup accident should not be possible with one click). When a
// user opts in, the backup embeds the image bytes as base64; importing
// restores them through the device-local byte store - with the same caps as
// an upload, refusing oversized rows rather than trusting the file.

export interface BackupAttachmentRow {
  raw: string
  size: number
  name?: string
  mime?: string
}

function buf2base64(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < view.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base642buf(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const copy = new ArrayBuffer(binary.length)
  const out = new Uint8Array(copy)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return copy
}

/**
 * The export-side half: a Map for every referenced attachment this device
 * still has bytes for. Missing rows are simply absent (the metadata-only
 * export already names what was dropped through skills elsewhere), and a
 * byte row that does not decode is skipped, not crashed on.
 */
export async function collectBackupAttachments(
  messages: MessagesByThread,
  opts: { bytesOf?: (id: string) => Promise<Blob | ArrayBuffer | null> } = {},
): Promise<Record<string, BackupAttachmentRow>> {
  const bytesOf = opts.bytesOf || getAttachmentBytes
  const out: Record<string, BackupAttachmentRow> = {}
  for (const [id, meta] of collectAttachmentInfo(messages)) {
    const bytes = await bytesOf(id)
    if (!bytes) continue
    try {
      const ab = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes
      if (!(ab.byteLength > 0) || ab.byteLength > MAX_ATTACHMENT_BYTES) continue
      out[id] = { raw: buf2base64(ab), size: ab.byteLength, name: meta.name }
    } catch {
      /* a row that cannot decode is skipped, not fatal */
    }
  }
  return out
}

/**
 * The import-side half: write every sane row into the device-local byte
 * store. Same caps the picker enforces (size), same id grammar, and a wrong
 * builtin never resurrects a filename from the raw key. Returns the count of
 * restored ids so import feedback can name what happened.
 */
export const RESTORE_TO_BUDGET = 256

export async function restoreBackupAttachments(
  attachments: Record<string, BackupAttachmentRow> | undefined,
  opts: { storeOne?: (id: string, bytes: Blob | ArrayBuffer) => Promise<boolean> } = {},
): Promise<number> {
  if (!attachments || typeof attachments !== 'object') return 0
  const storeOne = opts.storeOne || putAttachmentBytes
  let restored = 0
  let budget = RESTORE_TO_BUDGET
  for (const [id, row] of Object.entries(attachments)) {
    if (budget <= 0) break
    budget--
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) continue
    if (!row || typeof row.raw !== 'string' || !row.raw) continue
    try {
      const ab = base642buf(row.raw)
      if (!(ab.byteLength > 0) || ab.byteLength > MAX_ATTACHMENT_BYTES) continue
      if (typeof row.size === 'number' && row.size > 0 && row.size !== ab.byteLength) continue
      if (await storeOne(id, ab)) restored++
    } catch {
      /* a corrupt row is skipped, not fatal */
    }
  }
  return restored
}

export function isImageMime(mime: string): boolean {
  return typeof mime === 'string' && mime.startsWith('image/')
}

/**
 * The MIME ALLOW-LIST (the crashtest mime-polyglot discipline): an SVG with
 * a script inside is the family's canonical XSS carrier, and text/html is
 * the same class - so `<img>`'s script inertness is NOT the defense; the
 * allow-list is. The raster four cover everything a browser actually
 * photographs; anything else is refused at build time.
 */
export const IMAGE_MIME_ALLOWLIST: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

export function isAllowedImageMime(mime: string): boolean {
  return IMAGE_MIME_ALLOWLIST.includes(String(mime || '').toLowerCase())
}

function sanitizeName(name: string): string {
  // Control chars become spaces (a getline name reads like a name, not a
  // soup), then the display field is clamped. The STORAGE key is never this
  // string - it is the app-derived att_* id. The control-char class is the
  // point here (the text-leg law gistory's WAF enforces the same way), so
  // the no-control-regex guard is deliberately scoped off one line.
  // eslint-disable-next-line no-control-regex
  const safe = String(name || 'image').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 120)
  return safe || 'image'
}

function sanitizeMime(mime: string): string {
  const safe = String(mime || '')
  // The byte store never serves these to a server, but stripping oddities
  // keeps the synced metadata boring and greppable.
  return (/^[\w.+-]+\/[\w.+-]+$/.test(safe) ? safe : 'application/octet-stream')
}

let idCounter = 0

/** Attachment ids: readable prefix + time + counter (thread-safe enough). */
export function newAttachmentId(): string {
  idCounter = (idCounter + 1) % 1e6
  return `att_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

export { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE }

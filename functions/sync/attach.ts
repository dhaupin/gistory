// /sync/attach — the payload-external BYTE channel for message images.
//
// The design contract (labs/TASKS.md "MESSAGE IMAGES - THE GROUNDWORK"):
// message metadata rides the normal sync payload, but bytes NEVER do —
// full-state sync replaying blobs is the cost class that filled the chain
// budget twice. This route is the deliberate, budgeted side-channel: a device
// that adds an image PUTs its encrypted bytes once; any other device that sees
// the (merged) metadata can GET the bytes by id.
//
// Blindness holds end to end: `data` is the same `iv.cipher` AES-GCM envelope
// the push payload uses, keyed by the chain's derived key. The relay stores
// ciphertext, never sees pixels, and never holds key material.
//
// Guard discipline mirrors /sync/push because the cost class is the same:
//   flood (per IP, checked first) → attach (per device) → attachChain (per
//   chain) → write auth (chain write secret; failures charged to the
//   write-fail bucket) → attachChainBytes (per-chain daily byte budget,
//   charged after write auth and only for admitted writes).

import {
  MAX_ATTACHMENT_BLOB_BYTES,
  chainExists,
  constantTimeEqualHex,
  errorResponse,
  getChainPushHash,
  hashWriteSecret,
  isValidAttId,
  isValidChainId,
  isValidDeviceId,
  isValidCiphertextShape,
  isValidWriteSecret,
  json,
  clientIp,
  preflight,
  readJson,
  touchDevice,
} from '../_shared/sync'
import { sendFanOut } from '../_shared/push-fanout'
import {
  POLICIES,
  chargeFailure,
  consumeLimitUnits,
  guardRoute,
  inspectBody,
  throttledResponse,
  withBreaker,
} from '../_shared/guards'

export const onRequestOptions = async () => preflight()

// --- PUT (upload is the primary verb; GET is the mirror below) --------------

export const onRequestPost = withBreaker(async (db, context) => {
  const body = await readJson(context.request)
  if (!body) return errorResponse('Invalid JSON body')

  const chainId = typeof body.chainId === 'string' ? body.chainId.trim() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  const attId = typeof body.attId === 'string' ? body.attId.trim() : ''
  const data = typeof body.data === 'string' ? body.data : ''

  // WAF: shape chaos refused before anything touches D1. The cap is the
  // attachment ceiling (8MB), not the push payload's 5MB — a 4MB image on the
  // wire in base64-in-ciphertext form can legitimately approach 7MB.
  const waf = inspectBody(body, { maxDataBytes: MAX_ATTACHMENT_BLOB_BYTES })
  if (!waf.ok) return errorResponse(waf.reason, 400)

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')
  if (!isValidAttId(attId)) return errorResponse('Invalid attachment id')
  if (!data) return errorResponse('Missing encrypted attachment data')
  if (!isValidCiphertextShape(data)) return errorResponse('Attachment data must be encrypted ciphertext (iv.cipher, base64)')
  if (data.length > MAX_ATTACHMENT_BLOB_BYTES) return errorResponse('Encrypted attachment is too large', 413)

  // Request-rate guards: same double-bucket shape as push — per device stops
  // one runaway client, per chain stops a set of clients (or one holding a
  // stolen secret) filling the shared attachment table.
  for (const [scope, subject, policy] of [
    ['attach', deviceId, POLICIES.attach],
    ['attach-chain', chainId, POLICIES.attachChain],
  ] as const) {
    const verdict = await guardRoute(db, { scope, subject, policy, request: context.request })
    if (!verdict.ok) return verdict.response
  }

  if (!(await chainExists(db, chainId))) {
    return errorResponse('Unknown sync chain — run handshake first', 409)
  }

  // Write auth, byte-for-byte the push discipline (every chain is secured at
  // creation, so a missing hash is a storage-integrity violation, not legacy).
  const storedHash = await getChainPushHash(db, chainId)
  if (!storedHash) return errorResponse('Chain write auth is missing', 500)
  if (!isValidWriteSecret(body.writeSecret)) {
    // Charged like a wrong secret: omitting the field is the cheapest flood
    // and must not be free, same reasoning as push.
    const budget = await chargeFailure(db, 'write-fail', chainId, POLICIES.writeFailures)
    if (!budget.ok) {
      return throttledResponse(
        budget.retryAfterMs,
        'Too many rejected write attempts — slow down and try again shortly.',
      )
    }
    return errorResponse('Missing or malformed write secret', 401)
  }
  if (!constantTimeEqualHex(await hashWriteSecret(body.writeSecret), storedHash)) {
    const budget = await chargeFailure(db, 'write-fail', chainId, POLICIES.writeFailures)
    if (!budget.ok) {
      return throttledResponse(
        budget.retryAfterMs,
        'Too many rejected write attempts — slow down and try again shortly.',
      )
    }
    return errorResponse('Wrong write secret — this device cannot write to the chain', 403)
  }

  // The per-chain daily byte budget, charged after write auth and only for
  // admitted writes (refused requests never advance the counter). Same
  // 429-with-Retry-After pause semantics: over-budget devices stall, changes
  // stay saved locally, the catch-up pull is the correctness net.
  {
    const budget = await consumeLimitUnits(
      db,
      'attach-chain-bytes',
      chainId,
      POLICIES.attachChainBytes,
      data.length,
    )
    if (!budget.ok) {
      return throttledResponse(
        budget.retryAfterMs,
        'This chain has reached its daily attachment budget — images are saved on your device and other devices can fetch them later.',
      )
    }
  }

  try {
    // Idempotent re-upload of the same attId is a REPLACE: a retried PUT after
    // a dropped connection must not 500 on a PK collision.
    await db
      .prepare(
        `INSERT INTO attachments (chain_id, att_id, device_id, data, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(chain_id, att_id) DO UPDATE SET
           data = excluded.data, size = excluded.size`,
      )
      .bind(chainId, attId, deviceId, data, data.length, Date.now())
      .run()
  } catch {
    // Charged as a breaker failure upstream; a broken D1 must not be hammered
    // by image uploads the way pushes would be.
    return errorResponse('Could not store the attachment', 500)
  }

  await touchDevice(db, chainId, deviceId, clientIp(context.request))

  // Same fire-and-break wake as push: other devices' pages pull and run their
  // replication pass, which finds the new attachments by id.
  await sendFanOut(db, chainId, deviceId, 1, context.env)

  return json({ ok: true, attId, size: data.length })
})

// --- GET --------------------------------------------------------------------

interface AttachRow {
  data: string
  size: number
  created_at: number
}

export const onRequestGet = withBreaker(async (db, context) => {
  const url = new URL(context.request.url)
  const chainId = (url.searchParams.get('chain') || '').trim()
  const deviceId = (url.searchParams.get('deviceId') || '').trim()
  const attId = (url.searchParams.get('id') || '').trim()

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')
  if (!isValidAttId(attId)) return errorResponse('Invalid attachment id')

  // Reads share the per-device attach bucket: a GET is as cheap as a PUT and
  // replication passes are bursty by design.
  const verdict = await guardRoute(db, {
    scope: 'attach',
    subject: deviceId,
    policy: POLICIES.attach,
    request: context.request,
  })
  if (!verdict.ok) return verdict.response

  if (!(await chainExists(db, chainId))) return errorResponse('Unknown sync chain', 404)

  // No author filter here, by design: replication is fetching OTHER devices'
  // images, the exact case push's own-blob filter exists to skip.
  const row = await db
    .prepare('SELECT data, size, created_at FROM attachments WHERE chain_id = ? AND att_id = ?')
    .bind(chainId, attId)
    .first<AttachRow>()

  if (!row) return errorResponse('Unknown attachment', 404)

  return json({
    data: row.data,
    size: Number(row.size) || 0,
    createdAt: Number(row.created_at) || 0,
  })
})

// /sync/subscribe — wake targets for background sync (rollout step 3,
// labs/prd-sync.md). Stores where the relay should later send the SILENT
// pings; no fan-out happens in this step, so while the table fills, no
// device is ever woken and nothing changes for any user.
//
//   GET    /sync/subscribe                      → push wiring state (step 4
//                                                 will add the VAPID public
//                                                 key here)
//   POST   /sync/subscribe { chainId, deviceId, endpoint, keys{p256dh,auth} }
//                                              → upsert the wake target
//   DELETE /sync/subscribe { endpoint, deviceId }
//                                              → forget one wake target
//
// What this route deliberately does NOT do:
//   • require the write secret. Subscribing adds no chain data and sends no
//     wake; the worst a chain-id guesser can do is add a target on a path
//     INTO their own device, and the fan budget in step 4 bounds how many
//     wakes any chain can generate. Writes to DATA remain secret-gated.
//   • interpret `endpoint` beyond shape. It is an opaque URL minted by the
//     push service (FCM/autopush); the relay only checks it is https and
//     bounded so a stored junk URL cannot sit in every response.

import {
  errorResponse,
  chainExists,
  isValidChainId,
  isValidDeviceId,
  json,
  preflight,
  readJson,
} from '../_shared/sync'
import { POLICIES, guardRoute, inspectBody, withBreaker } from '../_shared/guards'

const ENDPOINT_MAX_CHARS = 1024
// Key material is bounded by the regex in isValidPushKey (16..256 chars); no
// separate constant is needed, keep the endpoint cap as the only literal.

/** Push endpoints are https URLs handed out by FCM/autopush. */
function isValidEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string') return false
  if (endpoint.length > ENDPOINT_MAX_CHARS || endpoint.length < 12) return false
  if (!endpoint.startsWith('https://')) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Both Web Push client keys arrive base64url and are bounded, never parsed. */
function isValidPushKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,256}$/.test(value)
}

export const onRequestOptions = async () => preflight()

// --- GET: wiring state -------------------------------------------------------
//
// Step 3 ships with fan-out OFF, so the honest answer is "not configured".
// The client's Settings row reads this to decide whether its toggle can
// actually subscribe (step 4 adds `publicKey` and flips `enabled`).

export const onRequestGet = withBreaker(async () => {
  return json({ enabled: false, publicKey: null })
})

// --- POST: store/update a wake target ----------------------------------------

export const onRequestPost = withBreaker(async (db, context) => {
  const body = await readJson(context.request)
  if (!body) return errorResponse('Invalid JSON body')

  const waf = inspectBody(body, { maxDataBytes: 0 })
  if (!waf.ok) return errorResponse(waf.reason, 400)

  const chainId = typeof body.chainId === 'string' ? body.chainId.trim() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''

  const keys = body.keys && typeof body.keys === 'object' ? body.keys : body
  const p256dh = keys && typeof (keys as Record<string, unknown>).p256dh === 'string' ? (keys as Record<string, string>).p256dh : ''
  const auth = keys && typeof (keys as Record<string, unknown>).auth === 'string' ? (keys as Record<string, string>).auth : ''

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')
  if (!isValidEndpoint(endpoint)) return errorResponse('Invalid push endpoint')
  if (!isValidPushKey(p256dh)) return errorResponse('Invalid p256dh key')
  if (!isValidPushKey(auth)) return errorResponse('Invalid auth key')

  const verdict = await guardRoute(db, {
    scope: 'handshake',
    subject: deviceId,
    policy: POLICIES.handshake,
    request: context.request,
  })
  if (!verdict.ok) return verdict.response

  if (!(await chainExists(db, chainId))) {
    return errorResponse('Unknown sync chain — run handshake first', 409)
  }

  // One row per ENDPOINT (the push service's handle): re-subscribing the same
  // browser to a different chain MOVES the row — a device that migrates to a
  // fresh chain must not keep accumulating wake targets. The key pair and
  // last_seen are refreshed either way.
  await db
    .prepare(
      `INSERT INTO push_subscriptions (chain_id, device_id, endpoint, p256dh, auth, created_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         chain_id = excluded.chain_id,
         device_id = excluded.device_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         last_seen = excluded.last_seen`,
    )
    .bind(chainId, deviceId, endpoint, p256dh, auth, Date.now(), Date.now())
    .run()

  return json({ ok: true, chainId, deviceId, endpoint })
})

// --- DELETE: forget a wake target --------------------------------------------

export const onRequestDelete = withBreaker(async (db, context) => {
  const body = await readJson(context.request)
  if (!body) return errorResponse('Invalid JSON body')

  const waf = inspectBody(body, { maxDataBytes: 0 })
  if (!waf.ok) return errorResponse(waf.reason, 400)

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''

  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')
  if (!isValidEndpoint(endpoint)) return errorResponse('Invalid push endpoint')

  const verdict = await guardRoute(db, {
    scope: 'handshake',
    subject: deviceId,
    policy: POLICIES.handshake,
    request: context.request,
  })
  if (!verdict.ok) return verdict.response

  // The caller must own the row: deleting requires matching BOTH the endpoint
  // and the deviceId that created it.
  await db
    .prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND device_id = ?')
    .bind(endpoint, deviceId)
    .run()

  return json({ ok: true })
})

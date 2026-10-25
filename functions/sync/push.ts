// POST /sync/push — store an opaque encrypted snapshot and return the
// server-assigned sequence number. The server never decrypts the payload.
//
// Writing requires the chain's write secret. Without it, anyone knowing the
// chainId could append a blob, and one blob the client cannot decrypt would
// pin its watermark and block every legitimate change behind it.
//
// This route carries three of the four guards, because it is the one that costs
// other people money: the payload is the largest, it writes on every keystroke
// burst, and it is the only one that lets a caller with a valid secret consume
// storage. `handshake` is throttled hardest (it is the enumeration risk).

import {
  MAX_PAYLOAD_BYTES,
  appendBlob,
  chainExists,
  constantTimeEqualHex,
  errorResponse,
  getChainPushHash,
  hashWriteSecret,
  isValidChainId,
  isValidDeviceId,
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

export const onRequestPost = withBreaker(async (db, context) => {
  const body = await readJson(context.request)
  if (!body) return errorResponse('Invalid JSON body')

  const chainId = typeof body.chainId === 'string' ? body.chainId.trim() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  const data = typeof body.data === 'string' ? body.data : ''

  // --- WAF, before anything touches D1 -----------------------------------
  // `data` is opaque ciphertext by design so it is size-checked only; the shape
  // checks (must be an object, no prototype keys, not a field explosion) are
  // what reject a request that is not this protocol at all.
  const waf = inspectBody(body, { maxDataBytes: MAX_PAYLOAD_BYTES })
  if (!waf.ok) return errorResponse(waf.reason, 400)

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')
  if (!data) return errorResponse('Missing encrypted data')
  if (data.length > MAX_PAYLOAD_BYTES) return errorResponse('Encrypted payload is too large', 413)

  // --- Throttle, per device and per chain ---------------------------------
  // Both buckets, because they defend against different things: the device one
  // stops one runaway client, the chain one stops a *set* of clients (or one
  // holding a stolen secret) filling storage that every other device must pull.
  for (const [scope, subject, policy] of [
    ['push', deviceId, POLICIES.push],
    ['push-chain', chainId, POLICIES.pushChain],
  ] as const) {
    const verdict = await guardRoute(db, { scope, subject, policy, request: context.request })
    if (!verdict.ok) return verdict.response
  }

  if (!(await chainExists(db, chainId))) {
    return errorResponse('Unknown sync chain — run handshake first', 409)
  }

  // Write auth. Every chain is secured at creation (handshake REQUIRES the
  // secret; the legacy unsecured state was removed), so a missing hash is a
  // storage-integrity violation rather than a legacy state — refuse it rather
  // than ever write unauthenticated.
  const storedHash = await getChainPushHash(db, chainId)
  if (!storedHash) {
    return errorResponse('Chain write auth is missing', 500)
  }
  if (!isValidWriteSecret(body.writeSecret)) {
    // Charged like a wrong secret. Without this, the CHEAPEST flood — simply
    // omitting the field — would buy unlimited uncharged 401s: each one
    // still burns the push-chain bucket, but rotating that is free.
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
    // A wrong secret is charged to its own per-chain budget, separate from
    // the caller's push allowance, so a third party guessing at this chain
    // cannot use up a legitimate device's push budget.
    const budget = await chargeFailure(db, 'write-fail', chainId, POLICIES.writeFailures)
    if (!budget.ok) {
      return throttledResponse(
        budget.retryAfterMs,
        'Too many rejected write attempts — slow down and try again shortly.',
      )
    }
    return errorResponse('Wrong write secret — this device cannot write to the chain', 403)
  }

  // Byte budget, the storage-cost backstop. The request-rate buckets above
  // count requests; this counts the bytes that would actually be written,
  // which is the resource a runaway full-state echo loop spends while keeping
  // every per-minute counter comfortably green. Charged after write auth so a
  // 401 never spends the chain's budget, and only for admitted writes.
  {
    const budget = await consumeLimitUnits(
      db,
      'push-chain-bytes',
      chainId,
      POLICIES.pushChainBytes,
      data.length,
    )
    if (!budget.ok) {
      return throttledResponse(
        budget.retryAfterMs,
        'This chain has reached its daily sync budget — changes are saved on your device and will upload when the budget resets.',
      )
    }
  }

  let seq: number
  try {
    seq = await appendBlob(db, chainId, deviceId, data)
  } catch {
    // `withBreaker` charges a 5xx to the breaker, so a genuinely broken D1
    // stops this route hammering it on every keystroke burst.
    return errorResponse('Could not allocate a sequence number', 500)
  }

  await touchDevice(db, chainId, deviceId, clientIp(context.request))

  // Background-sync fan-out (labs/prd-sync.md step 4): wake this chain's OTHER
  // subscribed devices so their service workers can pull without any open
  // tab. Entirely fire-and-behind its own budget and error guard: a fan-out
  // problem delays this response by at most its work and can never fail it.
  await sendFanOut(db, chainId, deviceId, 1, context.env)

  return json({ seq, serverSeq: seq })
})
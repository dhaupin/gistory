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
// storage. `handshake` is throttled harder (it is the enumeration risk), and
// `claim` for the same reason.

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
  preflight,
  readJson,
  touchDevice,
} from '../_shared/sync'
import {
  POLICIES,
  chargeFailure,
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
    const verdict = await guardRoute(db, { scope, subject, policy })
    if (!verdict.ok) return verdict.response
  }

  if (!(await chainExists(db, chainId))) {
    return errorResponse('Unknown sync chain — run handshake first', 409)
  }

  // Write auth. A chain created before write auth existed has no stored hash and
  // keeps accepting writes without a secret, so existing installs are not locked
  // out; the owner can secure one later via /sync/claim.
  const storedHash = await getChainPushHash(db, chainId)
  if (storedHash) {
    if (!isValidWriteSecret(body.writeSecret)) {
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
  }

  let seq: number
  try {
    seq = await appendBlob(db, chainId, deviceId, data)
  } catch {
    // `withBreaker` charges a 5xx to the breaker, so a genuinely broken D1
    // stops this route hammering it on every keystroke burst.
    return errorResponse('Could not allocate a sequence number', 500)
  }

  await touchDevice(db, chainId, deviceId)

  return json({ seq, serverSeq: seq })
})
// POST /sync/claim — install a write secret on a chain that predates write auth.
//
// Why this exists: `push` enforces a per-chain write secret, but a chain created
// before that feature has no stored hash. Those chains keep accepting writes
// without a secret so existing installs are not locked out. This endpoint lets
// the owner close that gap.
//
// **This is first-come-wins, and that is a real (bounded) limitation.** The
// server holds no secret for an unclaimed chain, so it cannot tell the owner
// apart from someone who merely knows the chainId — for example a holder of an
// old pairing QR. A chain claimed by someone else stays readable only to those
// with the passphrase, but that party can then deny future writes.
//
// It cannot go worse than that: blobs remain AES-GCM ciphertext, so claiming
// grants no access to anyone's data. New chains are unaffected — they install
// their secret at handshake and can never be claimed.

import {
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
  setChainPushHash,
  touchDevice,
} from '../_shared/sync'
import { POLICIES, guardRoute, inspectBody, withBreaker } from '../_shared/guards'

export const onRequestOptions = async () => preflight()

export const onRequestPost = withBreaker(async (db, context) => {
  const body = await readJson(context.request)
  if (!body) return errorResponse('Invalid JSON body')

  const chainId = typeof body.chainId === 'string' ? body.chainId.trim() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  const writeSecret = body.writeSecret

  const waf = inspectBody(body, { maxDataBytes: 0 })
  if (!waf.ok) return errorResponse(waf.reason, 400)

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')
  if (!isValidWriteSecret(writeSecret)) return errorResponse('Invalid write secret')

  // Claiming is a once-ever operation per chain, so this limit is the tightest
  // data limit here. It is what stops a party who knows a legacy chainId from
  // racing many claim attempts to win the capability.
  const verdict = await guardRoute(db, {
    scope: 'claim',
    subject: chainId,
    policy: POLICIES.claim,
  })
  if (!verdict.ok) return verdict.response

  const existing = await getChainPushHash(db, chainId)
  if (existing) {
    // Re-claiming with the same secret is a harmless no-op (a retry); claiming
    // with a different one would silently lock out every other device, so it is
    // refused rather than honoured.
    if (constantTimeEqualHex(await hashWriteSecret(writeSecret), existing)) {
      return json({ chainId, claimed: false, alreadySecured: true })
    }
    return errorResponse('This chain is already secured with a different write secret', 409)
  }

  const ok = await setChainPushHash(db, chainId, await hashWriteSecret(writeSecret))
  if (!ok) {
    // Someone else claimed it between our read and our write.
    return errorResponse('This chain was secured by another device first', 409)
  }

  await touchDevice(db, chainId, deviceId)
  return json({ chainId, claimed: true, alreadySecured: false })
})
// POST /sync/handshake — create the chain if needed, register this device,
// and return the current head so the client knows where to start pulling.
//
// The *creating* device also installs the chain's write secret. Later devices
// learn it from the pairing token instead. See _shared/sync.ts.

import {
  errorResponse,
  ensureChain,
  chainIsNew,
  getChainPushHash,
  getChainVersion,
  hashWriteSecret,
  isValidChainId,
  isValidDeviceId,
  isValidWriteSecret,
  json,
  listDevices,
  preflight,
  readJson,
  registerDevice,
  serverSeq,
  setChainPushHash,
} from '../_shared/sync'
import { POLICIES, breakerRecord, guardRoute, inspectBody, withBreaker } from '../_shared/guards'

export const onRequestOptions = async () => preflight()

export const onRequestPost = withBreaker(async (db, context) => {
  const body = await readJson(context.request)
  if (!body) return errorResponse('Invalid JSON body')

  // A handshake carries no payload, so the WAF here is only about shape.
  const waf = inspectBody(body, { maxDataBytes: 0 })
  if (!waf.ok) return errorResponse(waf.reason, 400)

  const chainId = typeof body.chainId === 'string' ? body.chainId.trim() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  const deviceName =
    (typeof body.deviceName === 'string' ? body.deviceName.trim() : '').slice(0, 64) ||
    'Unnamed device'

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')

  // The tightest throttle in the relay. Handshake answers "does this chain
  // exist?", so throttling it is what makes walking chain ids to enumerate
  // existing chains expensive rather than free.
  const verdict = await guardRoute(db, {
    scope: 'handshake',
    subject: deviceId,
    policy: POLICIES.handshake,
  })
  if (!verdict.ok) return verdict.response

  // `isNew` is read BEFORE ensureChain: only the device that creates a chain may
  // install its write secret. If we inferred it afterwards, anyone who knew the
  // chainId could claim an existing chain by handingaking with their own secret.
  const isNew = await chainIsNew(db, chainId)
  await ensureChain(db, chainId)

  if (isNew && body.writeSecret !== undefined) {
    if (!isValidWriteSecret(body.writeSecret)) return errorResponse('Invalid write secret')
    await setChainPushHash(db, chainId, await hashWriteSecret(body.writeSecret))
  }

  await registerDevice(db, chainId, deviceId, deviceName)
  breakerRecord('success')

  // Report the chain's ACTUAL write-auth state, after any secret this call
  // installed. An earlier version returned `!isNew`, which was backwards on
  // both ends: a brand-new chain that just had its secret set answered
  // `false`, and a legacy chain with no secret at all answered `true`. Nothing
  // in the client read the field, which is why it survived — but any future
  // reader would have been misinformed exactly when it matters (deciding
  // whether to pair with or claim this chain).
  const secured = (await getChainPushHash(db, chainId)) != null

  return json({
    chainId,
    serverSeq: await serverSeq(db, chainId),
    version: await getChainVersion(db, chainId),
    devices: await listDevices(db, chainId),
    writeAuth: secured,
  })
})

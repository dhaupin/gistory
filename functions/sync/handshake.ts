// POST /sync/handshake — create the chain if needed, register this device,
// and return the current head so the client knows where to start pulling.

import {
  errorResponse,
  ensureChain,
  getChainVersion,
  getDb,
  isValidChainId,
  isValidDeviceId,
  json,
  listDevices,
  preflight,
  readJson,
  registerDevice,
  serverSeq,
  type SyncEnv,
} from '../_shared/sync'

export const onRequestOptions = async () => preflight()

export const onRequestPost = async (context: { request: Request; env: SyncEnv }) => {
  const db = getDb(context.env)
  if (!db) return errorResponse('Sync storage is not configured', 500)

  const body = await readJson(context.request)
  if (!body) return errorResponse('Invalid JSON body')

  const chainId = typeof body.chainId === 'string' ? body.chainId.trim() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  const deviceName =
    (typeof body.deviceName === 'string' ? body.deviceName.trim() : '').slice(0, 64) ||
    'Unnamed device'

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')

  await ensureChain(db, chainId)
  await registerDevice(db, chainId, deviceId, deviceName)

  return json({
    chainId,
    serverSeq: await serverSeq(db, chainId),
    version: await getChainVersion(db, chainId),
    devices: await listDevices(db, chainId),
  })
}

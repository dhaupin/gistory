// POST /sync/push — store an opaque encrypted snapshot and return the
// server-assigned sequence number. The server never decrypts the payload.

import {
  MAX_PAYLOAD_BYTES,
  appendBlob,
  chainExists,
  errorResponse,
  getDb,
  isValidChainId,
  isValidDeviceId,
  json,
  preflight,
  readJson,
  touchDevice,
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
  const data = typeof body.data === 'string' ? body.data : ''

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')
  if (!data) return errorResponse('Missing encrypted data')
  if (data.length > MAX_PAYLOAD_BYTES) return errorResponse('Encrypted payload is too large', 413)

  if (!(await chainExists(db, chainId))) {
    return errorResponse('Unknown sync chain — run handshake first', 409)
  }

  let seq: number
  try {
    seq = await appendBlob(db, chainId, deviceId, data)
  } catch {
    return errorResponse('Could not allocate a sequence number', 500)
  }

  await touchDevice(db, chainId, deviceId)

  return json({ seq, serverSeq: seq })
}

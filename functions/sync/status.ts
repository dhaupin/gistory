// GET /sync/status?chain= — chain health: head sequence, version, devices.

import {
  chainExists,
  errorResponse,
  getChainVersion,
  getDb,
  isValidChainId,
  json,
  listDevices,
  preflight,
  serverSeq,
  type SyncEnv,
} from '../_shared/sync'

export const onRequestOptions = async () => preflight()

export const onRequestGet = async (context: { request: Request; env: SyncEnv }) => {
  const db = getDb(context.env)
  if (!db) return errorResponse('Sync storage is not configured', 500)

  const url = new URL(context.request.url)
  const chainId = (url.searchParams.get('chain') || '').trim()

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!(await chainExists(db, chainId))) return errorResponse('Unknown sync chain', 404)

  return json({
    chainId,
    serverSeq: await serverSeq(db, chainId),
    version: await getChainVersion(db, chainId),
    devices: await listDevices(db, chainId),
  })
}

// GET /sync/pull?chain=&since=&deviceId=&limit= — return encrypted blobs
// written after `since` by other devices, plus the current chain head.

import {
  chainExists,
  errorResponse,
  getDb,
  isValidChainId,
  json,
  preflight,
  serverSeq,
  type SyncEnv,
} from '../_shared/sync'

export const onRequestOptions = async () => preflight()

interface BlobRow {
  seq: number
  device_id: string
  data: string
  created_at: number
}

export const onRequestGet = async (context: { request: Request; env: SyncEnv }) => {
  const db = getDb(context.env)
  if (!db) return errorResponse('Sync storage is not configured', 500)

  const url = new URL(context.request.url)
  const chainId = (url.searchParams.get('chain') || '').trim()
  const deviceId = (url.searchParams.get('deviceId') || '').trim()

  const rawSince = Number(url.searchParams.get('since') || '0')
  const since = Number.isFinite(rawSince) && rawSince > 0 ? Math.floor(rawSince) : 0

  const rawLimit = Number(url.searchParams.get('limit') || '500')
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), 1000)
    : 500

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  if (!(await chainExists(db, chainId))) return errorResponse('Unknown sync chain', 404)

  const { results } = await db
    .prepare(
      `SELECT seq, device_id, data, created_at FROM blobs
       WHERE chain_id = ? AND seq > ? AND device_id <> ?
       ORDER BY seq ASC
       LIMIT ?`,
    )
    .bind(chainId, since, deviceId, limit)
    .all<BlobRow>()

  return json({
    blobs: (results || []).map(row => ({
      seq: Number(row.seq),
      deviceId: row.device_id,
      data: row.data,
      createdAt: Number(row.created_at) || 0,
    })),
    serverSeq: await serverSeq(db, chainId),
  })
}

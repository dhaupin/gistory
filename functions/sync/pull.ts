// GET /sync/pull?chain=&since=&deviceId=&limit= — return encrypted blobs
// written after `since` by other devices, plus the current chain head.

import {
  chainExists,
  errorResponse,
  isValidChainId,
  isValidDeviceId,
  json,
  preflight,
  serverSeq,
} from '../_shared/sync'
import { POLICIES, guardRoute, withBreaker } from '../_shared/guards'

export const onRequestOptions = async () => preflight()

interface BlobRow {
  seq: number
  device_id: string
  data: string
  created_at: number
}

export const onRequestGet = withBreaker(async (db, context) => {
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
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')

  // Throttled per device. A pull loop is the easiest thing for a client (or a
  // script) to spin, and it is also what starves pushes of D1 time.
  const verdict = await guardRoute(db, {
    scope: 'pull',
    subject: deviceId,
    policy: POLICIES.pull,
    request: context.request,
  })
  if (!verdict.ok) return verdict.response

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
})

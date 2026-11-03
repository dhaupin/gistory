// GET /sync/status?chain= — chain health: head sequence, version, devices.

import {
  chainExists,
  deviceIsMember,
  errorResponse,
  getChainVersion,
  isValidChainId,
  isValidDeviceId,
  json,
  listDevices,
  preflight,
  serverSeq,
} from '../_shared/sync'
import { POLICIES, guardRoute, withBreaker } from '../_shared/guards'

export const onRequestOptions = async () => preflight()

export const onRequestGet = withBreaker(async (db, context) => {
  const url = new URL(context.request.url)
  const chainId = (url.searchParams.get('chain') || '').trim()
  const deviceId = (url.searchParams.get('deviceId') || '').trim()

  if (!isValidChainId(chainId)) return errorResponse('Invalid chainId')
  // The agent sends its own device id. Validating it matters more here than on
  // the other routes: this is a read that reveals *who else is in the chain*,
  // so an unthrottled caller could walk chain ids and harvest device names.
  if (!isValidDeviceId(deviceId)) return errorResponse('Invalid deviceId')

  const verdict = await guardRoute(db, {
    scope: 'pull',
    subject: deviceId,
    policy: POLICIES.pull,
    request: context.request,
  })
  if (!verdict.ok) return verdict.response

  if (!(await chainExists(db, chainId))) return errorResponse('Unknown sync chain', 404)

  // The device roster is a membership surface, so it is shown only to a
  // member — a caller whose own deviceId registered WITH the chain's write
  // secret. The chain id is public by design, so without this a valid-shaped
  // outsider deviceId could harvest every member's name (the crashtest
  // `status-nonmember-read` bound). Head and version still answer for any
  // caller; only the names are gated.
  const isMember = await deviceIsMember(db, chainId, deviceId)

  return json({
    chainId,
    serverSeq: await serverSeq(db, chainId),
    version: await getChainVersion(db, chainId),
    devices: isMember ? await listDevices(db, chainId) : [],
  })
})
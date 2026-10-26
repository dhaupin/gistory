// Pages Function: GET /api/health - the house "prove the Functions wire works" canary.
export async function onRequestGet(context) {
  return Response.json({
    ok: true,
    name: context.env.SITE_NAME || 'monoforge',
    service: 'landing',
    spec: 'monoforge@1',
    ts: new Date().toISOString(),
  })
}

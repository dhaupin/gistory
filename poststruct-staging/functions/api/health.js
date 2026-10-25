// Pages Function: GET /api/health — the house "prove the Functions wire works" canary.
// Mirrors crashtest's law: refuse/fail loudly, return honest JSON.
export async function onRequestGet(context) {
  return Response.json({
    ok: true,
    name: context.env.SITE_NAME || 'poststruct',
    service: 'landing',
    ts: new Date().toISOString(),
  })
}

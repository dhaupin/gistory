// /sync/index.ts - base route handler

export const onRequestGet = async () => new Response(JSON.stringify({ 
  routes: ['handshake', 'push', 'pull'] 
}), { headers: { 'Content-Type': 'application/json' } })

export const onRequestPost = async ({ request }: { request: Request }) => {
  const body = await request.json() as { action?: string }
  return new Response(JSON.stringify({ action: body.action || 'unknown' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = async () => new Response('', {
  status: 204,
  headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
})
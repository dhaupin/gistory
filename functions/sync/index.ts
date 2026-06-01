// /sync/index.ts - route to nested handlers

export const onRequestGet = async () => new Response(JSON.stringify({ 
  routes: ['/sync/handshake', '/sync/push', '/sync/pull'],
  hint: 'POST to specific action endpoint'
}), { headers: { 'Content-Type': 'application/json' } })

export const onRequestPost = async ({ request }: { request: Request }) => {
  const body = await request.json() as { action?: string }
  // Route to appropriate handler based on action
  if (body.action === 'handshake') {
    return new Response(JSON.stringify({ ok: true, action: 'handshake' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (body.action === 'push') {
    return new Response(JSON.stringify({ ok: true, action: 'push' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (body.action === 'pull') {
    return new Response(JSON.stringify({ ok: true, action: 'pull' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ error: 'invalid action', valid: ['handshake','push','pull'] }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = async () => new Response('', { 
  status: 204,
  headers: { 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
})
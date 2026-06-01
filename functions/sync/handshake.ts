// Pages Function for Sync
// Handles /sync - action passed in body.action

const devStore = new Map<string, string>()
const storage = { 
  get: async (k: string) => devStore.get(k) || null,
  put: async (k: string, v: string) => devStore.set(k, v)
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequestGet = async () => new Response(JSON.stringify({ routes: ['/sync']), { 
  headers: { 'Content-Type': 'application/json' }
})

export const onRequestPost = async (context) => {
  const url = new URL(context.request.url)
  const body = await context.request.json() as { action?: string }
  const action = body.action || 'unknown'
  
  if (action === 'handshake') {
    return new Response(JSON.stringify({ ok: true, action: 'handshake' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (action === 'push') {
    return new Response(JSON.stringify({ ok: true, action: 'push' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (action === 'pull') {
    return new Response(JSON.stringify({ ok: true, action: 'pull' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ error: 'unknown action', got: action }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = async () => new Response('', { status: 204, headers: cors })
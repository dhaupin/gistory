// /sync/push handler - uses KV for persistence

interface Env {
  GISTRY_KV: KVNamespace
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { env, request } = context
  const body = await request.json() as { chainId: string; seq: number; data: string; deviceId: string }
  
  if (!env.GISTRY_KV) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }
  
  // Store in KV for persistence across deploys
  await env.GISTRY_KV.put(`blob:${body.chainId}:${body.seq}`, body.data)
  await env.GISTRY_KV.put(`seq:${body.chainId}`, String(body.seq))
  
  return new Response(JSON.stringify({ ok: true, seq: body.seq }), {
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

export const onRequestOptions = async () => new Response('', { status: 204, headers: cors })
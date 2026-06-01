// Gistory Sync - CF Pages Function
// Blind encrypted storage - server never sees plaintext or keys
// Falls back to in-memory in dev, stores to R2/KV in prod

interface Env {
  SYNC_KV?: KVNamespace
  SYNC_BLOBS?: R2Bucket
}

// In-memory store for dev/testing (resets on deploy)
const devStore = new Map<string, string>()

export const onRequest: PagesFunction = async (context) => {
  const { request, env } = context as { request: Request; env: Env }
  const url = new URL(request.url)
  const path = url.pathname
  
  // Helper to get/set from dev store
  const getDev = (key: string) => devStore.get(key)
  const setDev = (key: string, val: string) => devStore.set(key, val)
  const storage = env.SYNC_KV ? { get: (k: string) => env.SYNC_KV!.get(k), put: (k: string, v: string) => env.SYNC_KV!.put(k, v) } 
              : { get: getDev, put: setDev }
  
  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  
  try {
    if (path === '/sync/handshake' && request.method === 'POST') {
      return handleHandshake(request, storage, corsHeaders)
    }
    if (path === '/sync/push' && request.method === 'POST') {
      return handlePush(request, storage, corsHeaders)
    }
    if (path === '/sync/pull' && request.method === 'GET') {
      return handlePull(request, storage, corsHeaders)
    }
    
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

async function handleHandshake(request: Request, storage: { get: (k: string) => Promise<string | null>, put: (k: string, v: string) => Promise<void> }, corsHeaders: Record<string, string>) {
  const body = await request.json() as { chainId: string; identity: object }
  
  // Save identity with timestamp
  await storage.put(`identity:${body.chainId}`, JSON.stringify({ ...body.identity, lastSeen: Date.now() }))
  
  return new Response(JSON.stringify({ 
    chainId: body.chainId,
    timestamp: Date.now(),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handlePush(request: Request, storage: { get: (k: string) => Promise<string | null>, put: (k: string, v: string) => Promise<void> }, corsHeaders: Record<string, string>) {
  const body = await request.json() as { chainId: string; seq: number; data: string }
  
  // Store encrypted blob
  await storage.put(`blob:${body.chainId}:${body.seq}`, body.data)
  await storage.put(`seq:${body.chainId}`, String(body.seq))
  
  return new Response(JSON.stringify({ ok: true, seq: body.seq }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function handlePull(request: Request, storage: { get: (k: string) => Promise<string | null>, put: (k: string, v: string) => Promise<void> }, corsHeaders: Record<string, string>) {
  const url = new URL(request.url)
  const chainId = url.searchParams.get('chain')
  const since = Number(url.searchParams.get('since') || 0)
  
  if (!chainId) {
    return new Response(JSON.stringify({ error: 'chain required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  
  // Get latest seq
  const latestSeqStr = await storage.get(`seq:${chainId}`)
  const latestSeq = latestSeqStr ? Number(latestSeqStr) : since
  const blobs: Array<{ seq: number; data: string }> = []
  
  // Fetch each blob
  for (let seq = since + 1; seq <= latestSeq; seq++) {
    const data = await storage.get(`blob:${chainId}:${seq}`)
    if (data) blobs.push({ seq, data })
  }
  
  return new Response(JSON.stringify({ blobs, latestSeq }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
// Gistory Sync - CF Pages Function
// Blind encrypted storage - server never sees plaintext or keys

interface PagesFunction {
  (context: { request: Request; env: Record<string, unknown> }): Promise<Response>
}

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
  
  // DEBUG - just return fixed response
  return new Response(JSON.stringify({ 
    got: path,
    method: request.method,
    isFunctionRunning: "YES!"
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
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
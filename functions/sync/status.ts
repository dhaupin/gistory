// /sync/status - check chain status with KV

interface Env {
  GISTRY_KV: KVNamespace
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

interface Params {
  request: Request
  env: Env
}

export const onRequestGet = async ({ request, env }: Params) => {
  const url = new URL(request.url)
  const chainId = url.searchParams.get('chain')
  
  if (!chainId) {
    return new Response(JSON.stringify({ error: 'chain required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  if (!env.GISTRY_KV) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  // Get sequence from KV
  const seqStr = await env.GISTRY_KV.get(`seq:${chainId}`)
  const serverSeq = seqStr ? Number(seqStr) : 0
  const devices: string[] = []
  
  // Collect known deviceIds from stored blobs
  for (let seq = 1; seq <= serverSeq; seq++) {
    const data = await env.GISTRY_KV.get(`blob:${chainId}:${seq}`)
    if (data) {
      try {
        const blob = JSON.parse(data)
        if (blob.deviceId && !devices.includes(blob.deviceId)) {
          devices.push(blob.deviceId)
        }
      } catch {
        // ignore
      }
    }
  }
  
  return new Response(JSON.stringify({ chainId, serverSeq, devices }), {
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

export const onRequestOptions = async () => new Response('', { status: 204, headers: cors })
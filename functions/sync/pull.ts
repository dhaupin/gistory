// /sync/pull handler

const devStore = new Map<string, string>()

interface Params {
  request: Request
  env: Record<string, unknown>
}

export const onRequestGet = async ({ request }: Params) => {
  const url = new URL(request.url)
  const chainId = url.searchParams.get('chain')
  const since = Number(url.searchParams.get('since') || 0)
  const deviceId = url.searchParams.get('deviceId') || ''
  
  if (!chainId) {
    return new Response(JSON.stringify({ error: 'chain required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  const serverSeq = Number(devStore.get(`seq:${chainId}`) || 0)
  const blobs: Array<{ seq: number; data: string }> = []
  
  // Get blobs AFTER my since, but ONLY from OTHER devices
  for (let seq = since + 1; seq <= serverSeq; seq++) {
    const stored = devStore.get(`blob:${chainId}:${seq}`)
    if (!stored) continue
    
    // Parse to get deviceId from blob meta
    try {
      const blobData = JSON.parse(stored)
      // Filter: skip if this is from my own device
      if (deviceId && blobData.deviceId === deviceId) continue
      
      blobs.push({ seq, data: stored })
    } catch {
      // Legacy format without deviceId - include it
      blobs.push({ seq, data: stored })
    }
  }
  
  return new Response(JSON.stringify({ blobs, serverSeq }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = async () => new Response('', {
  status: 204,
  headers: { 'Access-Control-Allow-Origin': '*' }
})
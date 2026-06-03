// /sync/status - check chain status

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

interface Params {
  request: Request
}

export const onRequestGet = async ({ request }: Params) => {
  const url = new URL(request.url)
  const chainId = url.searchParams.get('chain')
  
  if (!chainId) {
    return new Response(JSON.stringify({ error: 'chain required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  const serverSeq = Number(devStore.get(`seq:${chainId}`) || 0)
  const devices: string[] = []
  
  // Collect known deviceIds from stored blobs
  for (let seq = 1; seq <= serverSeq; seq++) {
    const data = devStore.get(`blob:${chainId}:${seq}`)
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
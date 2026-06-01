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
  
  if (!chainId) {
    return new Response(JSON.stringify({ error: 'chain required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  const latestSeqStr = devStore.get(`seq:${chainId}`)
  const latestSeq = latestSeqStr ? Number(latestSeqStr) : since
  const blobs: Array<{ seq: number; data: string }> = []
  
  for (let seq = since + 1; seq <= latestSeq; seq++) {
    const data = devStore.get(`blob:${chainId}:${seq}`)
    if (data) blobs.push({ seq, data })
  }
  
  return new Response(JSON.stringify({ blobs, latestSeq }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = async () => new Response('', {
  status: 204,
  headers: { 'Access-Control-Allow-Origin': '*' }
})
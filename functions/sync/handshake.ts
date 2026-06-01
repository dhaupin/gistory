// /sync/handshake handler

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequestPost = async ({ request }: { request: Request }) => {
  const body = await request.json() as { chainId: string }
  return new Response(JSON.stringify({ ok: true, chainId: body.chainId, timestamp: Date.now() }), {
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

export const onRequestOptions = async () => new Response('', { status: 204, headers: cors })
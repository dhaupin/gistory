// /sync/push handler

const devStore = new Map<string, string>()

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequestPost = async (context) => {
  const body = await context.request.json() as { chainId: string; seq: number; data: string; deviceId: string }
  // Store deviceId along with blob for filtering
  devStore.set(`blob:${body.chainId}:${body.seq}`, body.data)
  devStore.set(`seq:${body.chainId}`, String(body.seq))
  return new Response(JSON.stringify({ ok: true, seq: body.seq }), {
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

export const onRequestOptions = async () => new Response('', { status: 204, headers: cors })
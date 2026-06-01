// /sync/push handler

const devStore = new Map<string, string>()

export const onRequestPost = async (context) => {
  const body = await context.request.json() as { chainId: string; seq: number; data: string }
  devStore.set(`blob:${body.chainId}:${body.seq}`, body.data)
  devStore.set(`seq:${body.chainId}`, String(body.seq))
  return new Response(JSON.stringify({ ok: true, seq: body.seq }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions = async () => new Response('', { 
  status: 204,
  headers: { 'Access-Control-Allow-Origin': '*' }
})
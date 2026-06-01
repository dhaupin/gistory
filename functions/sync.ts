// Pages Function with method-specific exports
// These are the correct CF Pages Function exports

export const onRequestGet = async () => {
  return new Response("GET works!", {
    headers: { 'Content-Type': 'text/plain' }
  })
}

export const onRequestPost = async (context) => {
  return new Response("POST works!", {
    headers: { 'Content-Type': 'text/plain' }
  })
}

export const onRequestOptions = async () => {
  return new Response("", {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
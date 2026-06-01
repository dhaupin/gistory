// Simple sync function - just respond
export function onRequest(context) {
  return new Response("HELLO_FROM_FUNCTION", {
    headers: { 
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*"
    }
  })
}
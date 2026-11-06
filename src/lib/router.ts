// Simple hash-based router

/** decodeURIComponent that never throws: a malformed percent-escape in a
 * shared URL returns the raw text instead of a URIError. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseRoute(hash: string) {
  const [path, query] = hash.slice(1).split('?')
  const params: Record<string, string> = {}
  
  if (query) {
    query.split('&').forEach(pair => {
      const [key, value] = pair.split('=')
      // A malformed percent-escape in a shared link (`#/project?id=100%`) makes
      // decodeURIComponent throw URIError - an uncaught crash at app init and
      // on every hashchange (white screen), from a URL a user pasted. Fall back
      // to the raw value, the same guard the serve/probe layers already carry.
      params[key] = safeDecode(value || '')
    })
  }
  
  if (path) {
    const parts = path.split('/').filter(Boolean)
    if (parts[0] === 'settings') {
      params.id = parts[1] || ''
    } else if (parts[0] === 'projects' && parts[1]) {
      params.id = parts[1]
    } else if (parts[0] === 'project' && parts[1]) {
      params.id = parts[1]
    } else if (parts[0] === 'trash') {
      // Recently-deleted log — no params. Must be matched BEFORE the generic
      // fallback below, which would read "trash" as a thread id.
    } else if (parts[0]) {
      // Assume it's a thread ID
      params.threadId = parts[0]
    }
  }
  
  return { path: path || '/', params }
}

export function buildRoute(path: string, params: Record<string, string> = {}) {
  const query = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return `#${path}${query ? '?' + query : ''}`
}

export function navigate(path: string, params: Record<string, string> = {}) {
  window.location.hash = buildRoute(path, params)
}

type RouteHandler = (route: { path: string; params: Record<string, string> }) => void
const listeners: Set<RouteHandler> = new Set()

export function onRouteChange(handler: RouteHandler) {
  listeners.add(handler)
  return () => { listeners.delete(handler) }
}

export function initRouter() {
  const handle = () => {
    const route = parseRoute(window.location.hash)
    listeners.forEach(fn => fn(route))
  }
  window.addEventListener('hashchange', handle)
  handle()
}
// Simple hash-based router

export function parseRoute(hash: string) {
  const [path, query] = hash.slice(1).split('?')
  const params: Record<string, string> = {}
  
  if (query) {
    query.split('&').forEach(pair => {
      const [key, value] = pair.split('=')
      params[key] = decodeURIComponent(value || '')
    })
  }
  
  if (path) {
    const parts = path.split('/').filter(Boolean)
    if (parts[0] === 'projects' && parts[1]) {
      params.id = parts[1]
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
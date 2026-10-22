// A Node-reachable shim over react-router-dom's CJS build (v7), used ONLY by
// prestruct's prerender engine: Vite's SSR module runner cannot take named
// exports from the CJS package, so the engine's ssrLoadModule(AppLayout)
// would die on the layout's `import { Routes } from 'react-router-dom'`.
//
// Reach is scoped in vite.config.ts — a resolveId hook that fires only when
// `this.environment.name === 'ssr'` maps the bare specifier here. Client and
// SSR-side browser builds of the app never resolve the shim, so it can never
// re-enter the browser bundle (the alias-in-config trap from the vendored
// prerenderer era). The typeof process guard below keeps it a no-op even if
// something else did reach this file in a browser graph.
//
// The dynamic require is the whole point of the shim and is unreachable in a
// browser bundle (guarded by typeof process), so vite's node-externals check
// is satisfied structurally rather than by suppression.

let rr = null
let requireFn = null

if (typeof process !== 'undefined' && process.versions?.node) {
  const { createRequire } = await import('node:module')
  requireFn = createRequire(import.meta.url)
  rr = requireFn('react-router-dom')
} else {
  // Browser fallback: dynamic import of the real package.
  rr = await import('react-router-dom')
}

export const BrowserRouter = rr.BrowserRouter
export const StaticRouter = rr.StaticRouter
export const Routes = rr.Routes
export const Route = rr.Route
export const useLocation = rr.useLocation
export const useNavigate = rr.useNavigate
export const Link = rr.Link
export const Outlet = rr.Outlet
export default rr

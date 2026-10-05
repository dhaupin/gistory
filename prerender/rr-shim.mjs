// A Node-reachable shim over react-router-dom's CJS build, used ONLY by
// prestruct's prerender.js (see vite.config.ts: the alias maps
// 'react-router-dom' here during ssrLoadModule, because Vite's SSR module
// runner cannot take named exports from the CJS package).
//
// Browser builds never import this file: the alias matches the bare specifier
// 'react-router-dom' only, and the browser entry imports nothing else. But if
// the module graph DID reach this file in a browser bundle, the guard below
// keeps it a no-op rather than a crash.
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

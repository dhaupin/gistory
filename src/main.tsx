import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import AppLayout from './AppLayout'

// Prerendered pages (/, /terms, /privacy) carry data-server-rendered on #root:
// hydrate them so React attaches to the server HTML without discarding it —
// that is what keeps the lander and legal pages crawlable while staying
// interactive.
//
// The router WRAPS AppLayout (never the reverse, and never a prop):
// BrowserRouter owns the location context AppLayout's Routes/useLocation
// consume. During prerender, prerender.js swaps in a StaticRouter the same
// way — BrowserRouter itself touches `document` and would crash Node SSR.
//
// A URL that carries a hash (bookmarks like /#/t1, or the lander CTA's #/)
// is app territory, but the server can only ever serve a PATH page — the
// hash never reaches it. That server HTML is the lander's, which can never
// match the app tree: hydrating it is a guaranteed React error #418. So a
// hash at boot means render fresh, after clearing the stale server content
// so the static lander does not flash before the first commit.
const rootEl = document.getElementById('root')!
const hashRouted = window.location.hash.startsWith('#')

if (!hashRouted && rootEl.dataset.serverRendered) {
  hydrateRoot(
    rootEl,
    <StrictMode>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </StrictMode>,
  )
} else {
  if (hashRouted) rootEl.innerHTML = ''
  createRoot(rootEl).render(
    <StrictMode>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </StrictMode>,
  )
}

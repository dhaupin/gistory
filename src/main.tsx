import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import AppLayout from './AppLayout'

// Prerendered pages (/, /terms, /privacy) carry data-server-rendered on #root:
// hydrate them so React attaches to the server HTML without discarding it —
// that is what keeps the lander and legal pages crawlable while staying
// interactive. Every other path renders fresh.
//
// The router WRAPS AppLayout (never the reverse, and never a prop):
// BrowserRouter owns the location context AppLayout's Routes/useLocation
// consume. During prerender, prerender.js swaps in a StaticRouter the same
// way — BrowserRouter itself touches `document` and would crash Node SSR.
const rootEl = document.getElementById('root')!

if (rootEl.dataset.serverRendered) {
  hydrateRoot(
    rootEl,
    <StrictMode>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </StrictMode>,
  )
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </StrictMode>,
  )
}

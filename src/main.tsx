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

// Rollout step 2 of labs/prd-sync.md: register the service worker so a device
// can be woken for background sync later. Deliberate in every detail:
//   • unconditional, but guarded on `'serviceWorker' in navigator` and a
//     secure context, so unsupported browsers and e.g. plain-http dev hosts
//     simply never register;
//   • NO fetch interception exists yet (public/sw.js is passive by design),
//     so registering early changes nothing about how the app loads;
//   • registration failure is a degradation, not a visible error — the
//     in-page sync loop is the correctness net either way;
//   • it runs before any React render so by the time the app is interactive
//     the registration reliably exists. The boot gate inside App does the
//     IndexedDB hydration; the two async paths know nothing of each other,
//     which is fine — the worker does not read IndexedDB until step 4.
if ('serviceWorker' in navigator && window.isSecureContext) {
  try {
    void navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.info('Gistory: service worker not registered', String(err))
    })
  } catch (err) {
    console.info('Gistory: service worker not registered', String(err))
  }
}

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

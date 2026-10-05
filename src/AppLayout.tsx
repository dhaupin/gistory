// AppLayout — the prestruct prerender surface.
//
// This module's graph is loaded BOTH by the browser (main.tsx) and by Node
// (prerender.js). Two hard rules from prestruct/AGENTS.md:
//
//   1. No router initialization at module scope or inside this component.
//      BrowserRouter touches `document` during render, which crashes Node
//      SSR — so AppLayout is router-less: the entry points own the router
//      and wrap AppLayout with it (prerender.js renders
//      <StaticRouter><AppLayout/></StaticRouter>, main.tsx renders
//      <BrowserRouter><AppLayout/></BrowserRouter>). Routes/useLocation
//      still work because the wrapping router owns the location context.
//   2. No window/document/localStorage at render time without a
//      `typeof window` guard — prerender runs in Node.
//
// Gistory's app is hash-routed (`#/t1`, `#/settings`). The split is decided
// by the hash: while the URL carries one, the app shell renders (bookmarked
// app links keep working); without one, the prerendered lander and legal
// pages show — the content a crawler reads without JavaScript.

import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Lander from './components/Lander'
import TermsPage from './components/TermsPage'
import PrivacyPage from './components/PrivacyPage'
import App from './App'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

/**
 * True while the URL carries a hash route. Initialised from the live URL so a
 * bookmarked `/#/t1` mounts the app on the very first render (no lander
 * flash), then kept in sync so the lander's "Open the app" CTA switches
 * without a page reload. SSR-safe: Node has no location, so this is false and
 * only the path pages render there.
 */
function useIsHashRoute(): boolean {
  const [isHash, setIsHash] = useState(
    () => typeof window !== 'undefined' && window.location.hash.startsWith('#'),
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => {
      // The lander's "Open the app" CTA is an href="#/" link: it flips the
      // hash, and this handler makes the switch live — no page reload.
      setIsHash(window.location.hash.startsWith('#'))
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return isHash
}

function RouteSwitch() {
  const inApp = useIsHashRoute()
  if (inApp) return <App />

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Lander />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        {/* Unmatched paths are served by dist/404.html from Cloudflare Pages;
            this fallback only matters for direct SPA visits to a bad path. */}
        <Route path="*" element={<Lander />} />
      </Routes>
    </>
  )
}

export default function AppLayout() {
  // Routerless seam: the entry point (StaticRouter during prerender,
  // BrowserRouter in the browser) wraps this component and provides the
  // location context RouteSwitch's hooks require.
  return <RouteSwitch />
}

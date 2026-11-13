// SiteNav — the one nav the public pages share (lander + why/what/about/
// terms/privacy).
//
// It lives in the AppLayout graph, which the prestruct engine renders in Node
// during prerender, so it must be SSR-safe: no window/document at render time
// and no router. The links are plain <a href> on purpose — each public page is
// its own prerendered document served by Cloudflare Pages, so a full page load
// is the correct navigation (the app itself is entered through the "#/" hash
// route). The drawer is closed on first render, so the prerendered HTML never
// ships an open menu.
//
// On phones the six-link row would overflow, so it collapses behind a burger
// that opens the same drawer shape the in-app sidebar uses: a right-side slide
// over a dimming overlay, Escape to dismiss. Mirrors coreforge's site nav canon
// (the family's mobile-nav receipt).

import { useEffect, useState } from 'react'

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: 'Home', href: '/' },
  { label: 'Why', href: '/why' },
  { label: 'What it is', href: '/what' },
  { label: 'About', href: '/about' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
]

export default function SiteNav() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <header className="lander-nav">
        <a href="/" className="lander-brand">Gistory</a>
        <div className="lander-nav-right">
          <nav className="lander-nav-links">
            {NAV_ITEMS.map(item => (
              <a key={item.label} href={item.href} className="lander-link">{item.label}</a>
            ))}
            <a href="#/" className="btn btn-primary btn-small lander-cta">Open the app</a>
          </nav>
          <button
            type="button"
            className="nav-burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(v => !v)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {open
                ? <path d="M6 6l12 12M6 18L18 6" />
                : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </header>

      <div className={'nav-overlay' + (open ? ' open' : '')} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={'nav-sidebar' + (open ? ' open' : '')} aria-hidden={!open}>
        <div className="nav-sidebar-title">Menu</div>
        <ul className="nav-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <li key={item.label}>
              <a href={item.href} onClick={() => setOpen(false)}>{item.label}</a>
            </li>
          ))}
        </ul>
        <div className="nav-sidebar-title">Open</div>
        <ul className="nav-sidebar-nav">
          <li><a href="#/" onClick={() => setOpen(false)}>Open the app</a></li>
        </ul>
      </aside>
    </>
  )
}

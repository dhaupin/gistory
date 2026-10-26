/**
 * ssr.config.js - site identity + route map.
 * Fills the prestruct engine (inject-brand + prerender, via `prestruct build`)
 * with the site's SEO tags and route list. Fill the identity block once; add
 * one entry per Route in AppLayout.jsx.
 */
export default {
  siteUrl:  'https://eyestruct.creadev.org',
  siteName: 'eyestruct',
  author:   'dhaupin',
  tagline:  'Eyes for production agents: deterministic look, committed visual memory, CI gates on drift.',
  ogImage:  'https://eyestruct.creadev.org/og-image.png',
  keywords: 'eyestruct, visual-testing, screenshot-diff, regression, eyes, ci, puppeteer, prerender, prestruct, cloudflare-pages',

  routes: [
    {
      path: '/',
      priority: '1.0',
      changefreq: 'monthly',
      meta: {
        title: 'eyestruct - eyes for production agents',
        description: 'Deterministic look and look-diff with a committed visual memory (.eyes/) that CI can gate. Process-per-look: the only surviving state is git state.',
      },
    },
    {
      path: '/terms',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Terms | eyestruct',
        description: 'Terms of use for eyestruct and this site.'
      },
    },
    {
      path: '/privacy',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Privacy | eyestruct',
        description: 'What this site collects: nothing. No server, no accounts, no hidden states to find.'
      },
    },
    // add more routes per AppLayout.jsx
  ],

  // The static 404 the host serves every miss; the shape + copy match
  // pages/NotFound.jsx so the host-not-found and the hydrate-not-found read
  // as one page, not two.
  notFound: {
    heading: '404',
    body: 'That page does not exist here.',
    primaryCta: { label: 'Back home', href: '/' },
  },
}

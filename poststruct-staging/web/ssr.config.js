/**
 * ssr.config.js - site identity + route map.
 * Fills the prestruct engine (inject-brand + prerender, via `prestruct build`)
 * with the site's SEO tags and route list. Fill the identity block once; add
 * one entry per Route in AppLayout.jsx.
 */
export default {
  siteUrl:  'https://poststruct.creadev.org',
  siteName: 'poststruct',
  author:   'dhaupin',
  tagline:  'Audit what shipped. A zero-dependency CLI that verifies the baked HTML against a head/site contract - FAIL findings exit non-zero so CI gates regressions.',
  ogImage:  'https://poststruct.creadev.org/og-image.png',
  keywords: 'poststruct, audit, seo, head-check, open-graph, json-ld, sitemap, robots, static-site, audit, baked-html, ci-check, struct-family, creadev, prerender, prestruct, cloudflare-pages',

  routes: [
    {
      path: '/',
      priority: '1.0',
      changefreq: 'monthly',
      meta: {
        title: 'poststruct - audit what shipped',
        description: 'A zero-dependency CLI that walks baked HTML and verifies head, links, and site hygiene against a contract - FAIL findings exit non-zero so CI gates regressions.',
      },
    },
    {
      path: '/terms',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Terms of Use | poststruct',
        description: 'Terms of use for poststruct and this site: the auditor ships as is under MIT, runs on your own builds, and the verdicts it gates are yours.'
      },
    },
    {
      path: '/privacy',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Privacy | poststruct',
        description: 'What poststruct and this site collect: the CLI collects nothing, audits read your own build output, and the site tracks nothing hidden.'
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

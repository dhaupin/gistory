/**
 * ssr.config.js - site identity + route map.
 * Fills the prestruct engine (inject-brand + prerender, via `prestruct build`)
 * with the site's SEO tags and route list. Fill the identity block once; add
 * one entry per Route in AppLayout.jsx.
 */
export default {
  siteUrl:  'https://flowforge.creadev.org',
  siteName: 'flowforge',
  author:   'dhaupin',
  tagline:  'One repo, two sites, zero styling drift.',
  ogImage:  'https://flowforge.creadev.org/og-image.png',
  keywords: 'flowforge, boilerplate, shell, docs, jekyll, landing-page, prerender, github-pages, cloudflare-pages',

  routes: [
    {
      path: '/',
      priority: '1.0',
      changefreq: 'monthly',
      meta: {
        title: 'flowforge - the shell the struct family ships sites from',
        description: 'One repo, two sites, zero styling drift: the landing shell, the docs rig, and the CI/release plumbing the struct family keeps re-porting, with brand as data.',
      },
    },
    {
      path: '/terms',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Terms | flowforge',
        description: 'Terms of use for the flowforge shell and this site.',
      },
    },
    {
      path: '/privacy',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Privacy | flowforge',
        description: 'What this site collects: nothing hidden, no tracking states to find.',
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

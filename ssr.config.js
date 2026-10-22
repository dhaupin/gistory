/**
 * ssr.config.js — prestruct prerender configuration for Gistory.
 *
 * Environment-specific on purpose (see prestruct's docs): change siteUrl here
 * when the production origin changes. The build pipeline is `prestruct build`
 * (npm engine: vite build → inject-brand → prerender, failing on route errors).
 *
 * FAQ_ITEMS is the single source for the FAQ both the lander renders as an
 * accordion and buildJsonLd emits as FAQPage schema.org markup — the JSON-LD
 * can never drift from the visible content, which is the guideline both are
 * judged by. Plain JS on purpose: the engine loads this file in Node without
 * a TS transform, so it must not import from src/.
 */
export const FAQ_ITEMS = [
  {
    q: 'Does Gistory need an account?',
    a: 'No. Gistory runs in your browser with no sign-up. Optional sync uses a passphrase and a pairing code instead of an account.',
  },
  {
    q: 'Can the server read my prompts?',
    a: 'No. Prompts are encrypted on your device with AES-GCM before they are uploaded, using a key derived from your passphrase. The relay stores ciphertext it cannot decrypt.',
  },
  {
    q: 'Does Gistory work offline?',
    a: 'Yes. Your library lives on your device first; edits made offline are kept locally and uploaded when the connection returns.',
  },
  {
    q: 'What happens if I lose my passphrase?',
    a: 'There is no reset. The passphrase never leaves your devices, so a lost passphrase means the synced data cannot be decrypted by anyone. Keep a local export from Settings as a backup.',
  },
  {
    q: 'How does {{variable}} template filling work?',
    a: 'Write a prompt with {{placeholders}}, then copy it. Gistory opens a small form with one field per placeholder and puts the filled prompt on your clipboard.',
  },
  {
    q: 'Which devices can sync?',
    a: 'Any modern browser. One device creates the sync chain; every other device joins with the pairing code and the same passphrase. Changes converge across the whole chain.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. A full JSON export lives in Settings, and the same screen imports a backup back in — merging by id rather than duplicating. Your prompt library is never locked in.',
  },
  {
    q: 'Is Gistory open source?',
    a: 'Yes — the full app, relay, and sync engine are on GitHub. The sync engine is also published separately as the gistory-sync package on npm.',
  },
]

export default {
  siteUrl: 'https://gistory.creadev.org',
  siteName: 'Gistory',
  author: 'dhaupin',
  tagline: 'Every prompt you write, kept, found, and filled in.',
  keywords: 'prompt manager, AI prompt library, prompt templates, encrypted sync, prompt organizer, ChatGPT prompts, Claude prompts, prompt variables',

  // Rendered by scripts/build-og.mjs; lives in public/ so vite copies it to
  // dist root. Routes inherit unless they override with their own (per-route
  // meta.ogImage).
  ogImage: 'https://gistory.creadev.org/og-image.png',

  appLayoutPath: '/src/AppLayout.tsx',

  routes: [
    {
      path: '/',
      priority: '1.0',
      changefreq: 'monthly',
      meta: {
        title: 'Gistory — every prompt you write, kept, found, and filled in',
        description:
          'Gistory is a personal prompt manager and AI prompt library: write prompts with {{variable}} templates, copy them filled in, organize with tags, projects, and forked variants — and sync across your devices end-to-end encrypted, no account required.',
      },
    },
    {
      path: '/terms',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Terms of Service | Gistory',
        description:
          'The terms governing use of Gistory: ownership of your content, encryption and retention behavior, acceptable use, availability, and liability.',
      },
    },
    {
      path: '/privacy',
      priority: '0.3',
      changefreq: 'yearly',
      meta: {
        title: 'Privacy Policy | Gistory',
        description:
          'What Gistory stores (encrypted blobs, chain and device ids) and what it never sees: your passphrase, your keys, or the plaintext of your prompts. No accounts, no analytics, no tracking.',
      },
    },
  ],

  buildJsonLd() {
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Gistory',
        url: this.siteUrl,
        applicationCategory: 'ProductivityApplication',
        operatingSystem: 'Any (web browser)',
        description:
          'A personal prompt manager with {{variable}} template filling, tags and projects, drag ordering, usage tracking, forked prompt variants, and end-to-end encrypted multi-device sync.',
        featureList: FAQ_ITEMS.map((item) => item.q),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author: { '@type': 'Person', name: 'Creadev.org', url: 'https://creadev.org' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
      // Site ownership: Gistory is authored by Creadev.org — shipped as the
      // founder Person on the Organization block, matching the owner
      // relationship the project is documented under.
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Gistory',
        url: this.siteUrl,
        founder: { '@type': 'Person', name: 'Creadev.org', url: 'https://creadev.org' },
      },
      // The maintainer, appended last: same person the repo commits come from.
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: 'dhaupin',
        url: 'https://github.com/dhaupin',
        jobTitle: 'Gistory maintainer',
      },
    ]
  },

  notFound: {
    heading: 'Page not found',
    body: "That page doesn't exist — the link may be mistyped, or the page moved. Everything in Gistory starts at the home page; the app itself lives under hash routes.",
    primaryCta: { label: 'Back to Gistory', href: '/' },
  },
}

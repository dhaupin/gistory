/**
 * ssr.config.js — prestruct prerender configuration for Gistory.
 *
 * Environment-specific on purpose (see prestruct's docs): change siteUrl here
 * when the production origin changes. The build pipeline is
 * `vite build && node scripts/inject-brand.js && node scripts/prerender.js`.
 */
export default {
  siteUrl: 'https://gistory.creadev.org',
  siteName: 'Gistory',
  author: 'dhaupin',
  tagline: 'Every prompt you write, kept, found, and filled in.',
  keywords: 'prompt manager, AI prompt library, prompt templates, encrypted sync, prompt organizer, ChatGPT prompts, Claude prompts, prompt variables',

  appLayoutPath: '/src/AppLayout.tsx',

  routes: [
    {
      path: '/',
      priority: '1.0',
      changefreq: 'monthly',
      meta: {
        title: 'Gistory — every prompt you write, kept, found, and filled in',
        description:
          'Gistory is a personal prompt manager: write prompts with {{variable}} templates, copy them filled in, organize with tags and projects, and sync across your devices end-to-end encrypted.',
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
          'A personal prompt manager with {{variable}} template filling, tags and projects, drag ordering, usage tracking, and end-to-end encrypted multi-device sync.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author: { '@type': 'Person', name: 'dhaupin' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Does Gistory need an account?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'No. Gistory runs in your browser with no sign-up. Optional sync uses a passphrase and a pairing code instead of an account.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can the server read my prompts?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'No. Prompts are encrypted on your device with AES-GCM before they are uploaded, using a key derived from your passphrase. The relay stores ciphertext it cannot decrypt.',
            },
          },
          {
            '@type': 'Question',
            name: 'What happens if I lose my passphrase?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'There is no reset. The passphrase never leaves your devices, so a lost passphrase means the synced data cannot be decrypted by anyone. Keep a local export from Settings as a backup.',
            },
          },
          {
            '@type': 'Question',
            name: 'How does {{variable}} template filling work?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Write a prompt with {{placeholders}}, then copy it. Gistory opens a small form with one field per placeholder and puts the filled prompt on your clipboard.',
            },
          },
          {
            '@type': 'Question',
            name: 'Which devices can sync?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Any modern browser. One device creates the sync chain; every other device joins with the pairing code and the same passphrase. Changes converge across the whole chain.',
            },
          },
        ],
      },
    ]
  },

  notFound: {
    heading: 'Page not found',
    body: "That page doesn't exist. The app itself lives under hash routes — try the board.",
    primaryCta: { label: 'Open Gistory', href: '/#/' },
  },
}

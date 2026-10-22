// Gistory service worker — rollout step 2 of labs/prd-sync.md (PASSIVE).
//
// Registered on every load so devices can be woken later, but deliberately not
// touching anything yet: no fetch interception (the browser default network
// behavior is exactly right, and intercepting the shell would be a regression
// risk with no payoff while there is no background sync), no push handler yet.
// The push handler arrives with fan-out wiring in step 4.
//
// Written as plain JS on purpose: it must load without a bundler, and the
// merge/agent modules it will eventually need import behind dynamic import()
// in the push handler, so a large script chunk never blocks the main bundle.

const STATUS = 'gistory-sw-2'

self.addEventListener('install', () => {
  // No assets to precache; activate as soon as possible so the registration
  // exists for the push step to rely on.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clear any caches a leftover or future-halved worker version may have
      // created; this version manages none. `caches` exists in all browsers
      // that support service workers, but stay defensive anyway.
      try {
        if (typeof caches !== 'undefined') {
          const names = await caches.keys()
          await Promise.all(
            names.filter((n) => n.startsWith('gistory-') && n !== STATUS).map((n) => caches.delete(n)),
          )
        }
      } catch (_err) {
        /* cleanup is best-effort */
      }
      await self.clients.claim()
    })(),
  )
})

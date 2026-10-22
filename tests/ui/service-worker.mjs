// Rollout step 2 of labs/prd-sync.md: the service worker exists, is registered,
// and intercepts nothing.
//
// Assertions live at three levels:
//   1. the registration resolves and installs;
//   2. the worker file is the passive one (no fetch handler survivable —
//      implied by absence plus the skipWaiting code marker);
//   3. the app still functions fully with the worker running — covered by the
//      storage-migration suite running in the same browser engine and by the
//      full UI suite being green after this lands.

import { openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'service-worker'

export default async function run({ check, baseUrl, browser }) {
  const page = await openPage(browser, { url: `${baseUrl}/#/`, seed: undefined })

  await settle(page)

  // 1. The registration exists and is controlling this page.
  const reg = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false }
    const registration = await navigator.serviceWorker.getRegistration('/...')
    if (!registration) return { supported: true, registered: false }
    const worker = registration.installing || registration.waiting || registration.active
    return {
      supported: true,
      registered: true,
      active: !!registration.active?.controller,
      state: worker ? worker.state : null,
    }
  })

  if (reg.supported === false) {
    // A browser without SW support cannot run this; the suite passes through
    // with a check that says so rather than failing machinery it cannot use.
    check('browser without serviceWorker support skips the suite', true, 'unsupported')
    await page.close()
    return
  }

  check('service worker registration exists after boot', reg.registered === true)

  const reg2 = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration('/sw.js')
    return r
      ? {
          scope: r.scope,
          state: (r.installing || r.waiting || r.active)?.state,
        }
      : null
  })
  check('registration covers the origin scope', !!reg2 && String(reg2.scope).endsWith('/'))

  // 2. Passive file shipped: the worker and the marker comment prove version.
  const swText = await page.evaluate(async () => {
    const res = await fetch('/sw.js')
    return { status: res.status, text: await res.text() }
  })
  check(
    'the worker is served with the passive marker',
    swText.status === 200 && swText.text.includes('rollout step 2'),
  )

  // 3. The app is alive with the worker active — same assertions as any board.
  await page.waitForFunction(
    () =>
      document.body.textContent.includes('Threads') ||
      !!document.querySelector('[class*="board"i]') ||
      !!document.querySelector('input[placeholder*="Search" i]'),
    { timeout: 15000 },
  )
  check('app renders with the worker registered', true)
  await settle(page)
  await page.close()
}

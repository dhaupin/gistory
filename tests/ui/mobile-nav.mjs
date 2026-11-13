// The public nav's mobile burger: the six-link row collapses behind a burger
// on phones, the drawer slides in over an overlay, Escape and the overlay both
// dismiss it, and a drawer link navigates to its prerendered page.
//
// This guards the lander + the five path pages (all six now share SiteNav), so
// a regression that drops the burger, strands the drawer open, or leaks a
// console error fails here. Desktop is asserted too: the burger must stay
// hidden while the inline row carries the nav.

import { clickSelector, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'mobile-nav'

const display = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).display).catch(() => null)
// `inline-flex` computes to `flex` on a flex item (flex items blockify), so
// "visible" is the honest assertion here.
const visible = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).display !== 'none').catch(() => false)
const hasClass = (page, sel, cls) =>
  page.$eval(sel, (el, c) => el.classList.contains(c), cls).catch(() => null)

export default async function run({ check, baseUrl, browser }) {
  // --- 1. Desktop: burger hidden, inline links visible ----------------------
  {
    const page = await openPage(browser, { url: baseUrl + '/', width: 1280, height: 900 })
    check('desktop: burger hidden', (await display(page, '.nav-burger')) === 'none')
    const linkCount = (await page.$$('.lander-nav-links .lander-link')).length
    check('desktop: inline nav links visible', linkCount === 6, `count=${linkCount}`)
    await page.close()
  }

  // --- 2. Phone: burger visible, inline links hidden, CTA stays -------------
  const page = await openPage(browser, { url: baseUrl + '/', width: 390, height: 844 })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  check('phone: burger visible', await visible(page, '.nav-burger'))
  const hiddenLinks = await page.$$eval('.lander-nav-links .lander-link', (els) =>
    els.every((el) => getComputedStyle(el).display === 'none'))
  check('phone: inline nav links hidden', hiddenLinks)
  check('phone: CTA stays visible', (await display(page, '.lander-cta')) !== 'none')

  // The bug class that bit this repo before: a header that overflows 390px.
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    navW: document.querySelector('.lander-nav').getBoundingClientRect().width,
  }))
  check('phone: no horizontal overflow', overflow.scrollW <= overflow.clientW + 1,
    JSON.stringify(overflow))
  check('phone: header fits the viewport', overflow.navW <= overflow.clientW + 1,
    JSON.stringify(overflow))

  // --- 3. Drawer opens on the burger ----------------------------------------
  check('drawer starts closed', (await hasClass(page, '.nav-sidebar', 'open')) === false)
  await clickSelector(page, '.nav-burger')
  await settle(page, 300)
  check('burger opens the drawer', (await hasClass(page, '.nav-sidebar', 'open')) === true)
  check('overlay opens with it', (await hasClass(page, '.nav-overlay', 'open')) === true)
  check('burger reports aria-expanded=true',
    (await page.$eval('.nav-burger', (el) => el.getAttribute('aria-expanded'))) === 'true')

  // --- 4. The drawer carries every destination ------------------------------
  const drawerText = await page.$eval('.nav-sidebar', (el) => el.textContent)
  for (const label of ['Home', 'Why', 'What it is', 'About', 'Terms', 'Privacy', 'Open the app']) {
    check(`drawer lists "${label}"`, drawerText.includes(label))
  }

  // --- 5. Escape dismisses it ----------------------------------------------
  await page.keyboard.press('Escape')
  await settle(page, 300)
  check('Escape closes the drawer', (await hasClass(page, '.nav-sidebar', 'open')) === false)

  // --- 6. The overlay dismisses it -----------------------------------------
  await clickSelector(page, '.nav-burger')
  await settle(page, 300)
  await clickSelector(page, '.nav-overlay')
  await settle(page, 300)
  check('overlay click closes the drawer', (await hasClass(page, '.nav-sidebar', 'open')) === false)

  // --- 7. A drawer link navigates to its prerendered page -------------------
  await clickSelector(page, '.nav-burger')
  await settle(page, 300)
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    page.evaluate(() => {
      const links = [...document.querySelectorAll('.nav-sidebar-nav a')]
      const terms = links.find((a) => a.textContent.trim() === 'Terms')
      terms.click()
    }),
  ])
  check('drawer link lands on /terms', page.url().endsWith('/terms'), page.url())

  // --- 8. A path page carries the same burger -------------------------------
  const why = await openPage(browser, { url: baseUrl + '/why', width: 390, height: 844 })
  check('/why: burger visible on phone', await visible(why, '.nav-burger'))
  await why.close()

  check('no console errors', errors.length === 0, errors.join(' | '))
  await page.close()
}

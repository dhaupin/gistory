// Sidebar regressions.
//
// The close X used to scroll away with the sidebar contents, so with a long
// thread list the top-right corner belonged to a thread's triple-dots action
// menu — tapping "where the X was" opened a menu instead of closing. These
// checks pin that behaviour down with a list long enough to force scrolling.

import { settle } from '../../scripts/lib/browser.mjs'

export const name = 'sidebar'

// Enough projects + threads that the sidebar must scroll (SEED only has 5).
const BIG_SEED = {
  gistory_sort: 'createdAt_desc',
  gistory_projects: Array.from({ length: 8 }, (_, i) => ({
    id: 'p' + i,
    name: 'Project ' + (i + 1),
    createdAt: 1700000000000 + i,
  })),
  gistory_threads: Array.from({ length: 40 }, (_, i) => ({
    id: 't' + i,
    name: 'Thread number ' + (i + 1),
    projectIds: i % 5 === 0 ? [] : ['p' + (i % 8)],
    createdAt: 1700000000000 + i * 1000,
    updatedAt: 1700000000000 + i * 1000,
  })),
  gistory_messages: {},
  gistory_deleted: { threads: {}, messages: {}, projects: {} },
}

const centerOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, selector)

// What the pointer actually lands on at (x, y), plus whether that element is
// inside the close button (a hit on the icon's <path> still belongs to the X).
const hitAt = (page, x, y) =>
  page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      const close = document.querySelector('.sidebar-header [aria-label="Close menu"]')
      const cls = (el?.className || '').toString().replace(/\s+/g, '.')
      return {
        label: el ? `${el.tagName.toLowerCase()}.${cls}` : 'null',
        inClose: !!(el && close && close.contains(el)),
      }
    },
    { x, y },
  )

export default async function run({ check, baseUrl, browser }) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.evaluateOnNewDocument((seed) => {
    for (const key of Object.keys(seed)) {
      const v = seed[key]
      localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v))
    }
  }, BIG_SEED)
  await page.goto(baseUrl + '/#/', { waitUntil: 'networkidle2' })
  await settle(page)

  const burger = await centerOf(page, '.btn-burger')
  await page.mouse.click(burger.x, burger.y)
  await page.waitForSelector('.sidebar')
  await settle(page)

  const scroll = await page.evaluate(() => {
    const sb = document.querySelector('.sidebar')
    return { scrollHeight: sb.scrollHeight, clientHeight: sb.clientHeight }
  })
  check('sidebar content overflows (scenario is real)', scroll.scrollHeight > scroll.clientHeight, JSON.stringify(scroll))

  const xBefore = await centerOf(page, '.sidebar-header [aria-label="Close menu"]')
  check('close X is on screen before scrolling', xBefore.y >= 0 && xBefore.y < 900, JSON.stringify(xBefore))

  await page.evaluate(() => {
    document.querySelector('.sidebar').scrollTop = 99999
  })
  await settle(page)

  const headerState = await page.evaluate(() => {
    const r = document.querySelector('.sidebar-header').getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
  })
  check('sidebar header stays pinned after scrolling', headerState.top >= 0, JSON.stringify(headerState))

  const topEl = await hitAt(page, xBefore.x, xBefore.y)
  check('the X still owns its position after scrolling', topEl.inClose, JSON.stringify(topEl))

  const threadsBefore = await page.evaluate(() => localStorage.getItem('gistory_threads'))
  await page.mouse.click(xBefore.x, xBefore.y)
  await settle(page, 350)
  check('clicking the X actually closes the sidebar', (await page.$('.sidebar')) === null)
  check('clicking the X fired no action menu', (await page.$('.action-menu-dropdown')) === null)
  check(
    'clicking the X changed no data',
    (await page.evaluate(() => localStorage.getItem('gistory_threads'))) === threadsBefore,
  )

  // Menus still work from a scrolled sidebar.
  const burger2 = await centerOf(page, '.btn-burger')
  await page.mouse.click(burger2.x, burger2.y)
  await page.waitForSelector('.sidebar')
  await settle(page)
  await page.evaluate(() => {
    document.querySelector('.sidebar').scrollTop = 99999
  })
  await settle(page)
  const lastTrigger = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.sidebar .action-menu')]
    const el = all[all.length - 1].querySelector('.action-menu-trigger')
    const r = el.getBoundingClientRect()
    return { idx: all.length - 1, x: r.left + r.width / 2, y: r.top + r.height / 2, onScreen: r.top >= 0 && r.bottom <= innerHeight }
  })
  if (lastTrigger.onScreen) {
    await page.mouse.click(lastTrigger.x, lastTrigger.y)
    await settle(page)
    const items = await page.evaluate(() => document.querySelectorAll('.action-menu-dropdown .action-menu-item').length)
    check('the last thread menu still opens when scrolled', items >= 2, `items=${items}`)
  } else {
    check('the last thread menu is reachable when scrolled', false, JSON.stringify(lastTrigger))
  }

  await page.close()
}

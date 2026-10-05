// Edge flows the other suites do not reach: archive-while-viewing, palette
// create-from-query, overlay stacking between the first-run tour and the
// palette, trash Back navigation, and the bulk unpin + pinned badges.
//
// This suite started life as a throwaway QC probe (`_qc-probe.mjs`) that found
// a real bug — Ctrl+K during the onboarding tour opened the palette OVER it
// and let the user strand the tour underneath — and was promoted to keep
// guarding those seams.

import { SEED, clickSelector, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'edge-flows'

const threads = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('gistory_threads') || '[]'))

const projects = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('gistory_projects') || '[]'))

/** Click the first element matching `selector` whose trimmed text equals `text`. */
async function clickByText(page, selector, text) {
  const handles = await page.$$(selector)
  for (const handle of handles) {
    if ((await handle.evaluate(el => (el.textContent || '').trim())) === text) {
      await handle.click()
      await settle(page, 300)
      return
    }
  }
  throw new Error(`no element matching "${selector}" with text "${text}"`)
}

const hash = (page) => page.evaluate(() => window.location.hash)
const count = (page, sel) => page.$$(sel).then(a => a.length)

export default async function run({ check, eq, baseUrl, browser }) {
  // --- A. Archive the thread you are currently viewing -----------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/t1', seed: SEED })
    await settle(page, 400)
    // ThreadView's own menu trigger (not the sidebar's).
    const triggers = await page.$$('.action-menu-trigger')
    let opened = false
    for (const t of triggers) {
      const inSidebar = await t.evaluate(el => !!el.closest('.sidebar'))
      if (!inSidebar) { await t.click(); await settle(page, 300); opened = true; break }
    }
    check('A: thread menu opens', opened)
    await clickByText(page, '.action-menu-item', 'Archive')
    check('A: route stays on the open thread', (await hash(page)).startsWith('#/t1'), await hash(page))
    check('A: thread view still renders (no crash)', (await count(page, '.app')) === 1 && (await page.$eval('body', b => b.innerText.length)) > 20)

    await page.evaluate(() => { window.location.hash = '#/' })
    await settle(page, 400)
    eq('A: archived row left the main board', (await count(page, '.thread-item:not(.archived)')), SEED.gistory_threads.length - 1)
    eq('A: archived section renders the row', (await count(page, '.thread-item.archived')), 1)

    // Restore from the archived row's own menu.
    await clickSelector(page, '.thread-item.archived .action-menu-trigger')
    await clickByText(page, '.thread-item.archived .action-menu-item', 'Restore')
    await page.evaluate(() => { window.location.hash = '#/' })
    await settle(page, 400)
    eq('A: restore puts the thread back on the board', (await count(page, '.thread-item:not(.archived)')), SEED.gistory_threads.length)
    eq('A: archived section empty after restore', (await count(page, '.thread-item.archived')), 0)
    await page.close()
  }

  // --- B. Palette create-from-query ------------------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/', seed: SEED })
    await settle(page, 300)
    await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control')
    await settle(page, 300)
    eq('B: palette opens', (await count(page, '.palette')), 1)
    await page.type('.palette-input', 'edge flows thread')
    await page.keyboard.press('Enter')
    await settle(page, 500)
    eq('B: Enter on create row closes the palette', (await count(page, '.palette')), 0)
    check('B: create row navigates to the new thread', /^#\/t/.test(await hash(page)), await hash(page))
    const names = (await threads(page)).map(t => t.name)
    eq('B: exactly one thread created', names.filter(n => n === 'edge flows thread').length, 1)
    await page.close()
  }

  // --- C. Ctrl+K while the first-run tour is open (overlay stacking) ---------
  // Regression: the palette used to paint OVER the tour (shared z-index, later
  // in the DOM) and could navigate away while the tour stayed stranded.
  {
    const page = await openPage(browser, { url: baseUrl + '#/', seed: {} })
    await settle(page, 400)
    eq('C: tour is open on first run', (await count(page, '.onboarding')), 1)
    await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control')
    await settle(page, 300)
    eq('C: palette stays closed under the tour', (await count(page, '.palette')), 0)

    // Ctrl+K works again once the tour is dismissed.
    await clickByText(page, '.onboarding-actions button', 'Skip tour')
    await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control')
    await settle(page, 300)
    eq('C: palette opens after the tour is dismissed', (await count(page, '.palette')), 1)
    await page.keyboard.press('Escape')
    eq('C: Escape closes the palette', (await count(page, '.palette')), 0)
    await page.close()
  }

  // --- D. Trash Back ----------------------------------------------------------
  {
    const page = await openPage(browser, {
      url: baseUrl + '#/trash',
      seed: { ...SEED, gistory_deleted: { threads: { tGONE: Date.now() }, messages: {}, projects: {} } },
    })
    await settle(page, 400)
    eq('D: trash page renders', (await count(page, '.trash-page')), 1)
    await clickByText(page, 'button', 'Back')
    eq('D: Back returns to the board', await hash(page), '#/')
    await page.close()
  }

  // --- E. Bulk unpin + pinned badges ------------------------------------------
  {
    // Two pinned threads (t1, t3) and one pinned project (p2), mirroring the
    // audit's ARRANGED_SEED arrangement.
    const seed = structuredClone(SEED)
    seed.gistory_threads = seed.gistory_threads.map(t =>
      t.id === 't1' || t.id === 't3' ? { ...t, pinned: true, pinnedAt: t.updatedAt ?? t.createdAt } : t)
    seed.gistory_projects = seed.gistory_projects.map(p =>
      p.id === 'p2' ? { ...p, pinned: true, pinnedAt: p.createdAt } : p)

    const page = await openPage(browser, { url: baseUrl + '#/', seed })
    await settle(page, 400)
    eq('E: the unpin-all control appears with 3 pins', (await count(page, '.unpin-all')), 1)
    check('E: the control names the pin count', (await page.$eval('.unpin-all', el => el.textContent)).includes('3'), '')

    // Badges: sidebar project groups show pinned threads inside them
    // (t1 and t3 both live in project p1).
    await clickSelector(page, '.btn-burger')
    await settle(page, 300)
    const labels = await page.$$eval('.project-label', els => els.map(el => el.textContent))
    check('E: sidebar group badge counts pinned threads', (labels.find(l => l.startsWith('Gistory')) || '').includes('📌 2'), labels.join(' | '))
    await clickSelector(page, '.sidebar .btn-icon[aria-label="Close menu"]')
    await settle(page, 200)

    // Unpinning is bulk: every pin of the kind clears in one click.
    await page.click('.unpin-all')
    await settle(page, 300)
    const stored = { threads: await threads(page), projects: await projects(page) }
    check('E: no thread stays pinned', stored.threads.every(t => !t.pinned), JSON.stringify(stored.threads.filter(t => t.pinned)))
    check('E: the pinned project is unpinned', stored.projects.every(p => !p.pinned), '')
    eq('E: the control disappears at zero pins', (await count(page, '.unpin-all')), 0)
    eq('E: no badge remains', (await count(page, '.pin-badge')), 0)
    await page.close()
  }

  // --- F. Relative timestamps -------------------------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/', seed: SEED })
    await settle(page, 400)
    const rowStamp = (id) => page.$eval(`[data-sortable-id="${id}"] .stamp`, el => el.textContent)
    // t1 carries updatedAt in SEED, t2 does not — both stamp variants on one board.
    check('F: an edited thread shows an edited stamp', /^edited /.test(await rowStamp('t1')), await rowStamp('t1'))
    check('F: an unedited thread shows a created stamp', /^created /.test(await rowStamp('t2')), await rowStamp('t2'))
    eq(
      'F: the stamp title carries the exact time',
      await page.$eval('[data-sortable-id="t2"] .stamp', el => el.getAttribute('title')),
      new Date(1700000600000).toLocaleString(),
    )

    // Editing flips created -> edited without a reload (rename via the row menu).
    await clickSelector(page, '[data-sortable-id="t2"] .action-menu-trigger')
    await clickByText(page, '.action-menu-item', 'Rename')
    await page.type('[data-sortable-id="t2"] .input-name', ' (renamed)')
    await page.keyboard.press('Enter')
    await settle(page, 400)
    eq('F: renaming flips the stamp to edited just now', await rowStamp('t2'), 'edited just now')
    await page.close()

    // Message heads carry their own stamps; the thread header distinguishes
    // created and edited in its title.
    const page2 = await openPage(browser, { url: baseUrl + '#/t1', seed: SEED })
    await settle(page, 400)
    eq('F: every message head shows a stamp', (await count(page2, '.message-head .stamp')), 3)
    const msgStamp = await page2.$eval('.message-head .stamp', el => el.textContent)
    check('F: message stamps default to created', /^created /.test(msgStamp), msgStamp)
    const headerTitle = await page2.$eval('.thread-title-row .stamp', el => el.getAttribute('title'))
    check(
      'F: the thread header title carries both times',
      headerTitle.includes('Created ') && headerTitle.includes('Edited '),
      headerTitle,
    )
    await page2.close()
  }
}

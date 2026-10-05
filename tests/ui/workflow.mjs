// Live-fire QC for the workflow features: the first-run onboarding tour, the
// Cmd+K command palette, draft/archived statuses, the rating editor, the
// recently-deleted log, and the backup nudge.
//
// Onboarding tests run against an empty seed (the tour only shows on a truly
// first run); every other test runs against SEED, where the board already has
// threads and the tour correctly stays out of the way.

import { SEED, clickSelector, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'workflow'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

const threads = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('gistory_threads') || '[]'))

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

/**
 * Palette rows match on their LABEL span, not the button's textContent — the
 * button also carries the hint ("Create"/"Go"), so an exact textContent match
 * would never fire.
 */
async function clickPaletteItem(page, label) {
  const handles = await page.$$('.palette-item')
  for (const handle of handles) {
    const text = await handle.$eval('.palette-item-label', el => el.textContent.trim()).catch(() => null)
    if (text === label) {
      await handle.click()
      await settle(page, 300)
      return
    }
  }
  throw new Error(`no palette item labeled "${label}"`)
}

export default async function run({ check, eq, baseUrl, browser }) {
  // --- 1. Onboarding: shows on a first run, walks, dismisses once -----------
  {
    const page = await openPage(browser, { url: baseUrl + '#/', seed: {} })
    eq('the tour opens on a first run', (await page.$$('.onboarding')).length, 1)

    await clickByText(page, '.onboarding-actions button', 'Skip tour')
    eq('skipping closes the tour', (await page.$$('.onboarding')).length, 0)
    eq('skipping sets the seen flag', await page.evaluate(() => localStorage.getItem('gistory_onboarded')), '1')

    // Create-from-tour path: step 1 collects a name and opens the thread.
    const page2 = await openPage(browser, { url: baseUrl + '#/', seed: {} })
    await clickByText(page2, '.onboarding-actions button', 'Get started')
    await page2.type('.onboarding-input', 'My first prompt')
    await clickByText(page2, '.onboarding-actions button', 'Create prompt')
    check('creating from the tour opens the new thread', (await page2.evaluate(() => window.location.hash)).startsWith('#/t'), await page2.evaluate(() => window.location.hash))
    eq('the tour closes after creating', (await page2.$$('.onboarding')).length, 0)
    eq('the named thread was stored', ((await threads(page2)).find(t => t.name === 'My first prompt') ?? null) !== null, true)
    await page2.close()

    // The sync step links into Settings rather than duplicating it, and is
    // reachable without creating anything (Skip for now).
    const page3 = await openPage(browser, { url: baseUrl + '#/', seed: {} })
    await clickByText(page3, '.onboarding-actions button', 'Get started')
    await clickByText(page3, '.onboarding-actions button', 'Skip for now')
    await clickByText(page3, '.onboarding-actions button', 'Open sync settings')
    eq('the sync step lands in Settings', await page3.evaluate(() => window.location.hash), '#/settings')
    eq('the tour is marked seen after the jump', await page3.evaluate(() => localStorage.getItem('gistory_onboarded')), '1')
    await page3.close()
    await page.close()
  }

  // --- 2. Command palette ----------------------------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/' })

    await page.keyboard.down('Control')
    await page.keyboard.press('k')
    await page.keyboard.up('Control')
    await settle(page, 200)
    eq('Ctrl+K opens the palette', (await page.$$('.palette')).length, 1)

    await page.type('.palette-input', 'sync')
    // With a query active, the create actions sit between matches and navigation.
    eq(
      'typing filters threads by name and offers creation',
      await page.$$eval('.palette-item .palette-item-label', els => els.map(e => e.textContent)),
      ['Refactor the sync layer', 'New prompt: “sync”', 'New project: “sync”', 'Open projects', 'Open settings', 'Recently deleted'],
    )

    // ↓×4 from the thread match lands on Open settings.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await settle(page, 300)
    eq('Enter runs the highlighted item', (await page.$$('.palette')).length, 0)
    eq('the highlighted action navigated', await page.evaluate(() => window.location.hash), '#/settings')

    await page.keyboard.down('Control')
    await page.keyboard.press('k')
    await page.keyboard.up('Control')
    await page.keyboard.press('Escape')
    await settle(page, 200)
    eq('Escape closes the palette', (await page.$$('.palette')).length, 0)

    // Create-from-query action.
    await page.keyboard.down('Control')
    await page.keyboard.press('k')
    await page.keyboard.up('Control')
    await page.type('.palette-input', 'brand new prompt')
    await clickPaletteItem(page, 'New prompt: “brand new prompt”')
    await settle(page, 300)
    check('the create action made the thread and opened it', (await page.evaluate(() => window.location.hash)).startsWith('#/t'), await page.evaluate(() => window.location.hash))
    eq('the created thread carries the query as its name', ((await threads(page)).find(t => t.name === 'brand new prompt') ?? null) !== null, true)
    await page.close()
  }

  // --- 3. Draft + archived statuses ------------------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/t1' })

    await clickSelector(page, '.thread-header .action-menu-trigger')
    await clickByText(page, '.action-menu-item', 'Mark as draft')
    await settle(page, 200)
    eq('the draft chip appears on the thread', (await page.$$('.meta-status')).length, 1)
    const draftThread = (await threads(page)).find(t => t.id === 't1')
    eq('draft status reached storage', draftThread.metadata?.status, 'draft')

    // Archived threads leave the board lists and land in the archive section.
    await clickSelector(page, '.thread-header .action-menu-trigger')
    await clickByText(page, '.action-menu-item', 'Archive')
    await settle(page, 200)
    const archivedThread = (await threads(page)).find(t => t.id === 't1')
    eq('archive status reached storage', archivedThread.metadata?.status, 'archived')
    await page.evaluate(() => { window.location.hash = '#/' })
    await settle(page, 350)
    eq('the board no longer lists the archived thread in the main grid', (await page.$$('.thread-item:not(.archived)')).length, 4)
    eq('the Archived section holds it', (await page.$$('.thread-item.archived')).length, 1)

    // Sidebar navigation hides archived threads too.
    await clickSelector(page, '.btn-burger')
    await settle(page, 250)
    const sidebarText = await page.$eval('.sidebar', el => el.textContent)
    check('the sidebar hides archived threads', !sidebarText.includes('Refactor the sync layer'), sidebarText.slice(0, 120))
    await clickSelector(page, '.sidebar .btn-icon[aria-label="Close menu"]')

    // Restore puts it back on the board (open the row's menu first).
    await clickSelector(page, '.thread-item.archived .action-menu-trigger')
    await clickByText(page, '.thread-item.archived .action-menu-item', 'Restore')
    await settle(page, 250)
    eq('restore removes the archived section', (await page.$$('.thread-item.archived')).length, 0)
    eq('restore returns the thread to the main grid', (await page.$$('.thread-item:not(.archived)')).length, 5)
    eq('restore resets status to active', ((await threads(page)).find(t => t.id === 't1')).metadata?.status, 'active')
    await page.close()
  }

  // --- 4. Rating editor --------------------------------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/t1' })
    // Star buttons are icon-only, so they are clicked by position.
    const stars = await page.$$('.star-btn')
    eq('five rate buttons render', stars.length, 5)
    await stars[3].click()
    await settle(page, 250)
    eq('clicking the 4th star stores rating 4', ((await threads(page)).find(t => t.id === 't1')).metadata?.rating, 4)
    eq('four stars render filled', (await page.$$('.star.filled')).length, 4)
    await stars[3].click()
    await settle(page, 250)
    eq('clicking the same star clears the rating', ((await threads(page)).find(t => t.id === 't1')).metadata?.rating, undefined)
    await page.close()
  }

  // --- 5. Recently-deleted log ---------------------------------------------------
  {
    const deleted = { threads: { 'tGONE-abc': NOW - 2 * DAY }, messages: { 'mGONE-def': NOW - 200 * DAY }, projects: { pGONE: NOW - DAY } }
    const page = await openPage(browser, { url: baseUrl + '#/trash', seed: { ...SEED, gistory_deleted: deleted } })

    check('the trash page renders', (await page.$$('.trash-page')).length === 1)
    const text = await page.$eval('.trash-page', el => el.textContent)
    check('thread tombstones are listed', text.includes('tGONE-abc'), text.slice(0, 100))
    eq('the 90-day filter hides the ancient message entry', text.includes('mGONE-def'), false)
    eq('entries on record counts everything', (await page.$eval('.trash-toolbar .meta-usage', el => el.textContent)).includes('3'), true)

    await page.click('.trash-filter input')
    await settle(page, 200)
    check('toggling the filter reveals older entries', (await page.$eval('.trash-page', el => el.textContent)).includes('mGONE-def'))

    // Sidebar entry point.
    await page.evaluate(() => { window.location.hash = '#/' })
    await settle(page, 300)
    await clickSelector(page, '.btn-burger')
    await clickByText(page, '.sidebar-footer-link button', 'Recently deleted')
    eq('the sidebar links to the trash log', await page.evaluate(() => window.location.hash), '#/trash')
    await page.close()
  }

  // --- 6. Backup nudge -------------------------------------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/settings' })
    await clickByText(page, '.tab', 'Snapshot')
    eq('a never-backed-up library sees the nudge', (await page.$$('.backup-notice')).length, 1)
    const notice = await page.$eval('.backup-notice', el => el.textContent)
    check('the nudge explains the 5-snapshot retention', notice.includes('newest 5 snapshots'), notice.slice(0, 120))
    check('the stamp says never', (await page.$eval('.backup-stamp', el => el.textContent)).includes('never'))

    await page.click('.backup-notice .btn-icon')
    await settle(page, 200)
    eq('dismissing hides the nudge', (await page.$$('.backup-notice')).length, 0)
    eq('dismissal is stored', await page.evaluate(() => localStorage.getItem('gistory_backup_nudge_dismissed')), '1')
    await page.close()

    // A recent backup suppresses the nudge but keeps the stamp.
    const page2 = await openPage(browser, { url: baseUrl + '#/settings', seed: { ...SEED, gistory_last_export: NOW - DAY } })
    await clickByText(page2, '.tab', 'Snapshot')
    eq('a fresh backup suppresses the nudge', (await page2.$$('.backup-notice')).length, 0)
    check('the stamp shows the last backup time', (await page2.$eval('.backup-stamp', el => el.textContent)).includes(new Date(NOW - DAY).toLocaleDateString()), '')
    await page2.close()
  }
}

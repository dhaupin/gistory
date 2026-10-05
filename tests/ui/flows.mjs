// Interaction flows — the things you actually do every day.
//
// Every flow also fails if the page logs a console error or throws, which is
// the main value: a flow can look right while React is spewing errors.

import { SEED, clickButtonByText, clickSelector, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'flows'

/**
 * Set a React-controlled field.
 *
 * Triple-click + Backspace is not reliable (it can leave the caret mid-value
 * and append instead of replace), so drive the native value setter and fire
 * `input`, which is exactly what React's onChange listens for.
 */
async function fill(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel)
      if (!el) throw new Error(`no element matching ${sel}`)
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    selector,
    value,
  )
}

const readStore = (page) =>
  page.evaluate(() => ({
    threads: JSON.parse(localStorage.getItem('gistory_threads') || '[]'),
    messages: JSON.parse(localStorage.getItem('gistory_messages') || '{}'),
    projects: JSON.parse(localStorage.getItem('gistory_projects') || '[]'),
    deleted: JSON.parse(localStorage.getItem('gistory_deleted') || '{}'),
  }))

const text = (page) => page.evaluate(() => document.body.innerText)

export default async function run({ check, baseUrl, browser }) {
  const errors = []

  // --- 0. First-run journey on a genuinely empty library --------------------
  // Regression: createThread set the current thread id but never navigated, so
  // creating your first thread from the empty board left you on the board with
  // no message box — which is why collapse "did nothing" on a fresh install.
  // Every other suite seeds data, so this path was never exercised.
  const fresh = await openPage(browser, { url: baseUrl + '#/', seed: {} })
  const freshErrors = []
  fresh.on('console', (m) => { if (m.type() === 'error') freshErrors.push(m.text()) })
  fresh.on('pageerror', (e) => freshErrors.push('PAGEERROR: ' + e.message))
  await settle(fresh, 500)
  check('an empty library shows the empty state', (await fresh.$('.input-area')) === null)

  await clickSelector(fresh, '.header-actions .btn-ghost')
  await settle(fresh, 300)
  await fill(fresh, '.new-form .input', 'My first thread')
  await clickSelector(fresh, '.new-form .btn-primary')
  await settle(fresh, 700)
  check('creating the first thread opens it', (await fresh.$('.input-area')) !== null)
  check(
    'creating the first thread updates the route',
    /#\/.+/.test(await fresh.evaluate(() => location.hash)),
    await fresh.evaluate(() => location.hash),
  )

  // And the thing the user reported: collapse has to work on this path.
  await fresh.click('.input-area')
  await fresh.type(
    '.input-area',
    'First message with quite a few more words in it than the preview keeps',
  )
  await fresh.keyboard.down('Control')
  await fresh.keyboard.press('Enter')
  await fresh.keyboard.up('Control')
  await settle(fresh, 700)
  check(
    'a message typed on the first-run path is saved',
    await fresh.evaluate(
      () => Object.values(JSON.parse(localStorage.getItem('gistory_messages') || '{}')).flat().length,
    ) === 1,
  )
  await fresh.evaluate(() => document.querySelectorAll('.message-card .collapse-toggle')[0].click())
  await settle(fresh, 500)
  check('collapsing hides the body on the first-run path', (await fresh.$('.message-card pre')) === null)
  check(
    'collapsing shows a preview on the first-run path',
    (await fresh.$('.message-card .message-preview')) !== null,
  )
  check(
    'the collapsed preview is shorter than the message',
    await fresh.evaluate(() => {
      const preview = document.querySelector('.message-card .message-preview')?.textContent ?? ''
      const full = JSON.parse(localStorage.getItem('gistory_messages'))
      const msg = Object.values(full).flat()[0]
      return preview.length < msg.content.trim().length
    }),
  )
  check('no errors on the first-run journey', freshErrors.length === 0, freshErrors.join(' | ').slice(0, 200))
  await fresh.close()

  const page = await openPage(browser, { url: baseUrl + '#/', seed: SEED })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  // --- 1. Header search actually filters the board --------------------------
  const before = await text(page)
  check('board shows a thread before searching', before.includes('Refactor the sync layer'))
  await fill(page, '.search-input', 'planning')
  await settle(page, 400)
  const filtered = await text(page)
  check('search keeps the matching thread', filtered.includes('Weekly planning prompt'))
  check('search hides the non-matching thread', !filtered.includes('Refactor the sync layer'))
  check('search reports a match count', /Threads matching/i.test(filtered), filtered.slice(0, 120))

  await fill(page, '.search-input', 'zzzz-no-match')
  await settle(page, 400)
  const noMatch = await text(page)
  check('search with no matches says so', /No threads match/i.test(noMatch), noMatch.slice(0, 160))
  check('search with no matches hides the empty-state copy', !noMatch.includes('Create one to get started'))

  await fill(page, '.search-input', '')
  await settle(page, 400)
  check('clearing search restores the board', (await text(page)).includes('Refactor the sync layer'))

  // --- 2. Add a message -----------------------------------------------------
  await page.evaluate(() => {
    window.location.hash = '#/t2'
  })
  await settle(page, 500)
  check('empty thread renders no message cards', (await page.$$('.message-card')).length === 0)

  await fill(page, '.input-card .input-area', 'A brand new prompt')
  await page.click('.input-actions .btn-primary')
  await settle(page, 500)
  check('message card appears after saving', (await page.$$('.message-card')).length === 1)
  let store = await readStore(page)
  check('new message persisted to localStorage', (store.messages.t2 || []).some((m) => m.content === 'A brand new prompt'))

  // --- 3. Edit that message -------------------------------------------------
  // Row buttons are icon-only; Edit is matched by its aria-label.
  await clickSelector(page, '.message-card button[aria-label="Edit message"]')
  await settle(page, 300)
  await fill(page, '.message-edit .input-area', 'Edited prompt text')
  // Scope this: the composer also has a "Save" button, and it comes first in
  // the DOM, so a plain text match would click the wrong one.
  await clickSelector(page, '.message-edit .btn-primary')
  await settle(page, 500)
  const edited = await text(page)
  check('edited content is shown', edited.includes('Edited prompt text'), edited.slice(0, 200))
  check('old content is gone', !edited.includes('A brand new prompt'))
  store = await readStore(page)
  check('edit persisted', (store.messages.t2 || []).some((m) => m.content === 'Edited prompt text'))

  // --- 4. Delete the message (confirm dialog) -------------------------------
  await clickSelector(page, '.message-card button[aria-label="Delete message"]')
  await settle(page, 300)
  check('delete message opens a confirm dialog', (await page.$('#confirm-dialog-title')) !== null)
  const dialogTitle = await page.$eval('#confirm-dialog-title', (el) => el.textContent.trim())
  check('confirm dialog is titled for messages', dialogTitle === 'Delete message?', dialogTitle)
  await clickButtonByText(page, 'Delete')
  await settle(page, 500)
  check('message removed after confirming', (await page.$$('.message-card')).length === 0)
  store = await readStore(page)
  const deletedMsgId = Object.keys(store.deleted.messages || {})[0]
  check('message delete recorded a tombstone', !!deletedMsgId, JSON.stringify(store.deleted.messages))

  // --- 5. Rename the thread from the thread view ----------------------------
  await clickSelector(page, '.thread-title-row .action-menu-trigger')
  await settle(page, 250)
  await clickButtonByText(page, 'Rename')
  await settle(page, 250)
  await fill(page, '.thread-header .input-name', 'Renamed from thread view')
  await clickButtonByText(page, 'Save')
  await settle(page, 500)
  check('thread renamed in the header', (await text(page)).includes('Renamed from thread view'))
  store = await readStore(page)
  check('rename persisted', store.threads.some((t) => t.name === 'Renamed from thread view'))
  check('rename kept the project links', (store.threads.find((t) => t.id === 't2')?.projectIds || []).length === 0)

  // --- 6. Add a thread to a project via the same menu ----------------------
  await clickSelector(page, '.thread-title-row .action-menu-trigger')
  await settle(page, 250)
  await clickButtonByText(page, 'Gistory')
  await settle(page, 500)
  store = await readStore(page)
  check(
    'thread added to the project',
    (store.threads.find((t) => t.id === 't2')?.projectIds || []).includes('p1'),
    JSON.stringify(store.threads.find((t) => t.id === 't2')?.projectIds),
  )

  // --- 7. Delete the thread (confirm dialog) and land somewhere valid ------
  await clickSelector(page, '.thread-title-row .action-menu-trigger')
  await settle(page, 250)
  await clickButtonByText(page, 'Delete')
  await settle(page, 300)
  const threadDialog = await page.$eval('#confirm-dialog-title', (el) => el.textContent.trim())
  check('confirm dialog is titled for threads', threadDialog === 'Delete thread?', threadDialog)
  await clickButtonByText(page, 'Delete')
  await settle(page, 600)
  store = await readStore(page)
  check('thread removed', !store.threads.some((t) => t.id === 't2'))
  check('thread delete recorded a tombstone', !!store.deleted.threads?.t2, JSON.stringify(store.deleted.threads))
  check('app did not crash after deleting the open thread', (await page.$('.app')) !== null)

  // --- 8. Create a project from the board ----------------------------------
  await page.evaluate(() => {
    window.location.hash = '#/'
  })
  await settle(page, 400)
  // Scope to the board header: the app header's "Projects" nav button also
  // contains the substring "Project" and comes first in the DOM.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.home-header button')].find((x) => x.textContent.trim() === 'Project')
    if (!b) throw new Error('no "+ Project" button in the board header')
    b.click()
  })
  await settle(page, 300)
  await fill(page, '.new-form input.input', 'Fresh project')
  await clickButtonByText(page, 'Create')
  await settle(page, 500)
  store = await readStore(page)
  check('project created and persisted', store.projects.some((p) => p.name === 'Fresh project'))

  // --- 9. Sort preference persists -----------------------------------------
  await page.select('.home-header .sort-select', 'name_asc')
  await settle(page, 400)
  check('sort preference persisted', (await page.evaluate(() => localStorage.getItem('gistory_sort'))) === 'name_asc')

  check('no console errors during any flow', errors.length === 0, errors.join(' | ').slice(0, 300))

  await page.close()
}

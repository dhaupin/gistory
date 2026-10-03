// Usability pass: board-level rename/delete consistency, confirmations,
// textbox guards, and control consistency.
//
// These are the flows the audit can't see (the audit only inspects rendered
// states, it never drives a rename or confirms a delete). Every check here
// also fails on a console error, which is the main value.

import { SEED, clickButtonByText, clickSelector, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'usability'

/** React-controlled field setter (triple-click+Backspace is unreliable). */
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

const store = (page) =>
  page.evaluate(() => ({
    threads: JSON.parse(localStorage.getItem('gistory_threads') || '[]'),
    projects: JSON.parse(localStorage.getItem('gistory_projects') || '[]'),
    messages: JSON.parse(localStorage.getItem('gistory_messages') || '{}'),
    deleted: JSON.parse(localStorage.getItem('gistory_deleted') || '{}'),
  }))

export default async function run({ check, baseUrl, browser }) {
  const errors = []
  const page = await openPage(browser, { url: baseUrl + '#/', seed: SEED })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  // --- 1. Thread board offers the same rename/delete menu everywhere --------
  const firstTrigger = await page.$('.thread-item .action-menu-trigger')
  check('thread board items expose an actions menu', !!firstTrigger)
  await clickSelector(page, '.thread-item .action-menu-trigger')
  const menuText = await page.$eval('.action-menu-dropdown', (el) => el.textContent)
  check('board thread menu offers Rename', menuText.includes('Rename'), menuText)
  check('board thread menu offers Delete', menuText.includes('Delete'), menuText)

  // --- 2. Rename a thread from the board -----------------------------------
  await clickButtonByText(page, 'Rename')
  await settle(page, 200)
  await fill(page, '.thread-item .input-name', 'Renamed on the board')
  await clickButtonByText(page, 'Save')
  await settle(page, 400)
  check('renamed thread shows on the board', (await page.evaluate(() => document.body.innerText)).includes('Renamed on the board'))
  let s = await store(page)
  check('board rename persisted', s.threads.some((t) => t.name === 'Renamed on the board'), JSON.stringify(s.threads.map((t) => t.name)))

  // --- 3. Delete that thread with a proper confirmation dialog -------------
  await clickSelector(page, '.thread-item .action-menu-trigger')
  await clickButtonByText(page, 'Delete')
  await settle(page, 250)
  const title = await page.$eval('#confirm-dialog-title', (el) => el.textContent.trim())
  check('board delete opens the shared confirm dialog', title === 'Delete thread?', title)
  await clickButtonByText(page, 'Delete')
  await settle(page, 400)
  s = await store(page)
  check('thread removed after confirming', !s.threads.some((t) => t.name === 'Renamed on the board'))
  check('board delete recorded a tombstone', Object.keys(s.deleted.threads || {}).length >= 1, JSON.stringify(s.deleted.threads))

  // --- 4. Rename a project from the board ----------------------------------
  await clickSelector(page, '.project-item .action-menu-trigger')
  await clickButtonByText(page, 'Rename')
  await settle(page, 200)
  await fill(page, '.project-item .input-name', 'Renamed project')
  await clickButtonByText(page, 'Save')
  await settle(page, 400)
  s = await store(page)
  check('board project rename persisted', s.projects.some((p) => p.name === 'Renamed project'), JSON.stringify(s.projects.map((p) => p.name)))

  // --- 5. Empty-name create is a no-op (Enter and click) -------------------
  await page.evaluate(() => {
    window.location.hash = '#/'
  })
  await settle(page, 300)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.home-header button')].find((x) => x.textContent.trim() === 'Project')
    if (!b) throw new Error('no "+ Project" button')
    b.click()
  })
  await settle(page, 200)
  const beforeCount = (await store(page)).projects.length
  await fill(page, '.new-form input.input', '   ')
  await page.focus('.new-form input.input')
  await page.keyboard.press('Enter')
  await settle(page, 300)
  check('blank project name via Enter creates nothing', (await store(page)).projects.length === beforeCount)
  await clickButtonByText(page, 'Cancel')

  // --- 6. Sort controls share one option set -------------------------------
  const sortLabels = await page.$$eval('.home-header .sort-select option', (opts) => opts.map((o) => o.textContent))
  check('thread sort offers Recently updated', sortLabels.includes('Recently updated'), sortLabels.join(','))
  check('thread sort offers Name A-Z', sortLabels.includes('Name A-Z'), sortLabels.join(','))

  // --- 7. Passphrase show/hide works ---------------------------------------
  await page.evaluate(() => {
    window.location.hash = '#/settings'
  })
  await settle(page, 350)
  const typeBefore = await page.$eval('.password-field input', (el) => el.getAttribute('type'))
  check('passphrase starts hidden', typeBefore === 'password', typeBefore)
  await clickSelector(page, '.password-toggle')
  await settle(page, 200)
  const typeAfter = await page.$eval('.password-field input', (el) => el.getAttribute('type'))
  check('passphrase toggle reveals the text', typeAfter === 'text', typeAfter)

  // --- 8. ActionMenu closes on Escape --------------------------------------
  await page.evaluate(() => {
    window.location.hash = '#/'
  })
  await settle(page, 350)
  await clickSelector(page, '.thread-item .action-menu-trigger')
  check('menu is open before Escape', (await page.$('.action-menu-dropdown')) !== null)
  await page.keyboard.press('Escape')
  await settle(page, 200)
  check('Escape closes the actions menu', (await page.$('.action-menu-dropdown')) === null)

  // --- 9. Project cards are keyboard-operable ------------------------------
  await page.evaluate(() => {
    window.location.hash = '#/projects'
  })
  await settle(page, 350)
  await page.focus('.project-card')
  await page.keyboard.press('Enter')
  await settle(page, 350)
  check(
    'Enter opens the focused project card',
    (await page.evaluate(() => window.location.hash)).startsWith('#/project/'),
    await page.evaluate(() => window.location.hash),
  )

  // --- 10. Pinning a thread floats it to the top ---------------------------
  await page.evaluate(() => {
    window.location.hash = '#/'
  })
  await settle(page, 350)
  await clickSelector(page, '.thread-item .action-menu-trigger')
  const boardMenu = await page.$eval('.action-menu-dropdown', (el) => el.textContent)
  check('thread menu offers Pin to top', boardMenu.includes('Pin to top'), boardMenu)
  await clickButtonByText(page, 'Pin to top')
  await settle(page, 400)
  let pinned = (await store(page)).threads.filter((t) => t.pinned)
  check('pin persisted to storage', pinned.length === 1, JSON.stringify(pinned.map((t) => t.name)))
  const topAfterPin = await page.$eval('.thread-item .thread-name', (el) => el.textContent)
  check('pinned thread floats above the previously first thread', topAfterPin === pinned[0].name, `${topAfterPin} vs ${pinned[0].name}`)
  check('pin marker is rendered', (await page.$('.thread-item.pinned .pin-indicator')) !== null)

  // Unpin from the same row (now at the top) and confirm it clears.
  await clickSelector(page, '.thread-item .action-menu-trigger')
  await clickButtonByText(page, 'Unpin')
  await settle(page, 400)
  check('unpin clears the flag', !(await store(page)).threads.some((t) => t.pinned))

  // --- 11. Collapse the home Projects section ------------------------------
  check('home projects section starts expanded', (await page.$('.projects-section .projects-grid')) !== null)
  await clickSelector(page, '.projects-section .collapse-toggle')
  await settle(page, 250)
  check('collapse hides the project cards', (await page.$('.projects-section .projects-grid')) === null)
  await clickSelector(page, '.projects-section .collapse-toggle')
  await settle(page, 250)
  check('expand restores the project cards', (await page.$('.projects-section .projects-grid')) !== null)

  // --- 12. Collapse a project group in the sidebar -------------------------
  await clickSelector(page, '.btn-burger')
  await settle(page, 350)
  const sidebarSort = await page.$$eval('.sidebar .sort-select option', (opts) => opts.map((o) => o.textContent))
  check('sidebar exposes the shared thread sort options', sidebarSort.includes('Name A-Z'), sidebarSort.join(','))
  const rowsBefore = await page.$$eval('.sidebar .project-group .thread-link-row', (els) => els.length)
  await clickSelector(page, '.sidebar .project-group .collapse-toggle')
  await settle(page, 250)
  const rowsAfter = await page.$$eval('.sidebar .project-group .thread-link-row', (els) => els.length)
  check('collapsing a sidebar project hides its threads', rowsAfter < rowsBefore, `${rowsBefore} -> ${rowsAfter}`)
  await clickSelector(page, '.sidebar-overlay')
  await settle(page, 200)
  check('sidebar closes after collapse checks', (await page.$('.sidebar')) === null)

  // --- 13. Pin and collapse individual messages ---------------------------
  await page.evaluate(() => {
    window.location.hash = '#/t1'
  })
  await settle(page, 400)
  check('thread view renders messages', (await page.$$('.message-card')).length > 0)
  // Pin the oldest visible message so "floats to the top" is actually tested.
  await clickSelector(page, '.message-card:last-child button[aria-label="Pin message"]')
  await settle(page, 400)
  check('message pin persisted', (await store(page)).messages.t1.some((m) => m.pinned))
  check('pinned message floats to the top with a marker', (await page.$('.message-card:first-child [aria-label="Pinned"]')) !== null)
  await clickSelector(page, '.message-card:first-child button[aria-label="Unpin message"]')
  await settle(page, 400)
  check('message unpin cleared the flag', !(await store(page)).messages.t1.some((m) => m.pinned))

  check('message starts expanded', (await page.$('.message-card:first-child pre')) !== null)
  await clickSelector(page, '.message-card:first-child .collapse-toggle')
  await settle(page, 250)
  check('collapsing a message hides its body', (await page.$('.message-card:first-child pre')) === null)
  check('collapsed message shows a one-line preview', (await page.$('.message-card:first-child .message-preview')) !== null)
  // Regression: the preview used to be bounded only by character count, so a
  // short single-line prompt previewed as its own complete text and collapsing
  // it looked like it had done nothing. The preview must always be visibly
  // shorter than the body it stands in for.
  await clickSelector(page, '.message-card:first-child .collapse-toggle')
  await settle(page, 250)
  check('expanding restores the message body', (await page.$('.message-card:first-child pre')) !== null)
  // Collapse a short, single-line message specifically and compare. It has to be
  // one that fits the old 140-char preview whole *and* runs past PREVIEW_WORDS,
// so it is exactly the case that used to render its own complete text. Resolve
  // it by id, not by array index: earlier checks in this suite pin and reorder
  // messages, so store order != rendered order.
  const shortId = (await store(page)).messages.t1.find(
    (m) => m.content.trim().length <= 140 && m.content.trim().split(/\s+/).length > 9,
  )?.id
  const shortIdx = shortId
    ? await page.evaluate(
        (id) =>
          [...document.querySelectorAll('.message-card')].findIndex(
            (c) => c.getAttribute('data-sortable-id') === id,
          ),
        shortId,
      )
    : -1
  if (shortIdx >= 0) {
    await page.evaluate((i) => {
      document.querySelectorAll('.message-card .collapse-toggle')[i].click()
    }, shortIdx)
    await settle(page, 300)
    // Scope to the card we just collapsed, not whichever card happens to be first.
    const shortPreview = await page.evaluate((id) => {
      const card = document.querySelector(`[data-sortable-id="${id}"]`)
      const el = card && card.querySelector('.message-preview')
      return el ? el.textContent : null
    }, shortId)
    const shortFull = await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem('gistory_messages')).t1.find((m) => m.id === id).content,
      shortId,
    )
    check(
      'a short message still collapses to a visibly shorter preview',
      shortPreview !== null && shortPreview.length < shortFull.trim().length,
      `${JSON.stringify(shortPreview)} vs ${shortFull.trim().length} chars`,
    )
    check(
      'the collapsed preview is ellipsised',
      shortPreview !== null && shortPreview.endsWith('…'),
      JSON.stringify(shortPreview),
    )
    await page.evaluate((i) => {
      document.querySelectorAll('.message-card .collapse-toggle')[i].click()
    }, shortIdx)
    await settle(page, 300)
  }

  // --- 14. Pin a project ---------------------------------------------------
  await page.evaluate(() => {
    window.location.hash = '#/'
  })
  await settle(page, 350)
  // Pin the last project so the pinned-first ordering is observable.
  await clickSelector(page, '.project-item:last-child .action-menu-trigger')
  const projectMenu = await page.$eval('.action-menu-dropdown', (el) => el.textContent)
  check('project menu offers Pin to top', projectMenu.includes('Pin to top'), projectMenu)
  await clickButtonByText(page, 'Pin to top')
  await settle(page, 400)
  check('project pin persisted', (await store(page)).projects.some((p) => p.pinned))
  check('pinned project floats to the top with a marker', (await page.$('.project-item:first-child .pin-indicator')) !== null)
  await page.evaluate(() => {
    window.location.hash = '#/projects'
  })
  await settle(page, 350)
  check('projects grid shows the pinned project first', (await page.$('.project-card-row:first-child.pinned')) !== null)

  // --- 15. Drag to reorder (pointer + keyboard) ----------------------------
  await page.evaluate(() => {
    window.location.hash = '#/'
    window.scrollTo(0, 0)
  })
  await settle(page, 400)

  const threadIds = () => page.$$eval('.thread-item', (els) => els.map((e) => e.getAttribute('data-sortable-id')))
  const before = await threadIds()
  check('enough rows to reorder', before.length >= 3, `only ${before.length} threads`)

  // Keyboard path first: it is the deterministic, accessible one.
  await page.focus('.thread-item:nth-child(1) .drag-handle')
  await page.keyboard.press('ArrowDown')
  await settle(page, 400)
  let after = await threadIds()
  check(
    'ArrowDown on the grip moves a thread down',
    after[0] === before[1] && after[1] === before[0],
    `${before.join('|')} -> ${after.join('|')}`,
  )
  const ranks = await page.evaluate(() => JSON.parse(localStorage.getItem('gistory_view') || '{}'))
  check('reorder wrote a synced rank', typeof ranks[before[0]]?.rank === 'number', JSON.stringify(ranks))

  // Pointer drag: grab row 1 and drop it just past row 3's bottom edge, so the
  // dragged row's centre clears row 3's midpoint (that is what commits index 2).
  const start = await page.$eval('.thread-item:nth-child(1) .drag-handle', (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  const dropY = await page.$eval('.thread-item:nth-child(3)', (el) => el.getBoundingClientRect().bottom + 2)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, dropY, { steps: 15 })
  await page.mouse.up()
  await settle(page, 500)
  after = await threadIds()
  check('dragging a thread moves it down the list', after[2] === before[1], after.join('|'))
  check('the dragged thread landed where it was dropped', after[0] === before[0], after.join('|'))

  // --- 16. Collapse state is synced (stored in the view payload) -----------
  await clickSelector(page, '.projects-section .collapse-toggle')
  await settle(page, 300)
  const viewState = await page.evaluate(() => JSON.parse(localStorage.getItem('gistory_view') || '{}'))
  check(
    'collapse is stored in the synced view state',
    Object.values(viewState).some((v) => v && v.collapsed === true),
    JSON.stringify(viewState),
  )
  check('projects section is collapsed', (await page.$('.projects-section .projects-grid')) === null)

  await page.reload({ waitUntil: 'networkidle2' })
  await settle(page, 500)
  check('collapse survives a reload', (await page.$('.projects-section .projects-grid')) === null)

  // --- 17. A rapid double-click must not create duplicates -------------------
  // Regression: the create handlers read the same non-empty input on every
  // click before React re-renders, so a triple-click made three identical
  // threads and the user had to delete two of them. Guarded by useSubmitLock.
  await page.evaluate(() => { window.location.hash = '#/' })
  await settle(page, 500)
  await clickSelector(page, '.header-actions .btn-ghost')
  await settle(page, 300)
  await fill(page, '.new-form .input', 'Double click test')
  await page.evaluate(() => {
    const btn = document.querySelector('.new-form .btn-primary')
    btn.click(); btn.click(); btn.click()
  })
  await settle(page, 500)
  const dupes = (await store(page)).threads.filter((t) => t.name === 'Double click test').length
  check('a triple-click on Create makes exactly one thread', dupes === 1, `${dupes} created`)

  // The lock must release when the form re-opens, so creating a second item
  // with the same name is still allowed — it is a guard, not a dedupe.
  // Creating a thread navigates into it, so return to the board first.
  await page.evaluate(() => { window.location.hash = '#/' })
  await settle(page, 500)
  await clickSelector(page, '.header-actions .btn-ghost')
  await settle(page, 300)
  await fill(page, '.new-form .input', 'Double click test')
  await clickSelector(page, '.new-form .btn-primary')
  await settle(page, 500)
  const dupes2 = (await store(page)).threads.filter((t) => t.name === 'Double click test').length
  check(
    'creating a second thread with the same name on purpose still works',
    dupes2 === 2,
    `${dupes2} created`,
  )

  // Same guard on the projects board.
  await page.evaluate(() => { window.location.hash = '#/projects' })
  await settle(page, 500)
  await clickSelector(page, '.page-header .btn-primary')
  await settle(page, 300)
  await fill(page, '.form-inline .input-name', 'Double click project')
  await page.evaluate(() => {
    const btn = document.querySelector('.form-inline .btn-primary')
    btn.click(); btn.click(); btn.click()
  })
  await settle(page, 500)
  const dupP = (await store(page)).projects.filter((x) => x.name === 'Double click project').length
  check('a triple-click on Create makes exactly one project', dupP === 1, `${dupP} created`)

  // --- 18. Escape dismisses a create form without creating -------------------
  // Every other dismissable surface (menus, dialogs, rename) honours Escape;
  // the create forms did not, and the sidebar's thread form has no Cancel
  // button at all, so Escape was its only keyboard way out.
  await page.evaluate(() => { window.location.hash = '#/' })
  await settle(page, 500)
  await clickSelector(page, '.header-actions .btn-ghost')
  await settle(page, 300)
  await fill(page, '.new-form .input', 'Escape me')
  await page.keyboard.press('Escape')
  await settle(page, 400)
  check('Escape closes the new-thread form', (await page.$('.new-form')) === null)
  check(
    'Escape does not create anything',
    !(await store(page)).threads.some((t) => t.name === 'Escape me'),
  )
  // Re-opening must start clean, not restore the abandoned text.
  await page.evaluate(() => { window.location.hash = '#/' })
  await settle(page, 400)
  await clickSelector(page, '.header-actions .btn-ghost')
  await settle(page, 300)
  const reopened = await page.$eval('.new-form .input', (el) => el.value)
  check('re-opening the form starts empty', reopened === '', JSON.stringify(reopened))
  await page.keyboard.press('Escape')
  await settle(page, 300)

  // Enter must still create (the Escape handler must not swallow it).
  // Creating a thread now navigates into it, so come back to the board first.
  await page.evaluate(() => { window.location.hash = '#/' })
  await settle(page, 500)
  await clickSelector(page, '.header-actions .btn-ghost')
  await settle(page, 300)
  await fill(page, '.new-form .input', 'Enter still works')
  await clickSelector(page, '.new-form .btn-primary')
  await settle(page, 500)
  check(
    'Enter/Click still creates after adding Escape',
    (await store(page)).threads.some((t) => t.name === 'Enter still works'),
  )

  check('no console errors during the usability flows', errors.length === 0, errors.join(' | ').slice(0, 300))

  await page.close()
}

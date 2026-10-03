// Live-fire QC for arrangement: drag ordering + collapse across every surface.
//
// These drive the real UI with real Chrome input events (page.mouse produces
// genuine pointerdown/pointermove/pointerup), not synthetic DOM clicks, so the
// drag path is exercised the way a user exercises it.
//
// Note on viewports: the home board and message list are single-column, but
// `.projects-grid` is `repeat(auto-fill, minmax(200px, 1fr))`, so at desktop
// widths its cards sit side by side. Vertical dragging there is meaningless, so
// the grid test narrows the viewport to force one column first.

import { SEED, clickSelector, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'sortable'

/** Grab row N's grip and drop it just past the bottom edge of `targetSelector`. */
async function dragPast(page, fromRow, targetSelector) {
  const start = await page.$eval(`${fromRow} .drag-handle`, (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  const dropY = await page.$eval(targetSelector, (el) => el.getBoundingClientRect().bottom + 2)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, dropY, { steps: 15 })
  await page.mouse.up()
  await settle(page, 450)
}

const ids = (page, selector) =>
  page.$$eval(selector, (els) => els.map((e) => e.getAttribute('data-sortable-id')))

const viewState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('gistory_view') || '{}'))

export default async function run({ check, baseUrl, browser }) {
  const errors = []
  const page = await openPage(browser, { url: baseUrl + '#/', seed: SEED })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  // --- 1. Drag threads on the home board ------------------------------------
  const threadsBefore = await ids(page, '.thread-item')
  check('home board renders draggable thread rows', threadsBefore.length >= 3, `${threadsBefore.length}`)
  check(
    'thread grips are labelled for assistive tech',
    (await page.$eval('.thread-item .drag-handle', (el) => el.getAttribute('aria-label') || '')).startsWith('Reorder '),
  )

  await dragPast(page, '.thread-item:nth-child(1)', '.thread-item:nth-child(3)')
  const threadsAfter = await ids(page, '.thread-item')
  check(
    'dragging a thread two rows down relocates it',
    threadsAfter[2] === threadsBefore[0] && threadsAfter[0] === threadsBefore[1],
    `${threadsBefore.join('|')} -> ${threadsAfter.join('|')}`,
  )
  const v1 = await viewState(page)
  check('the drag wrote ranks for the group', typeof v1[threadsBefore[0]]?.rank === 'number', JSON.stringify(v1))

  // --- 2. Escape aborts an in-flight drag ----------------------------------
  const beforeEscape = await ids(page, '.thread-item')
  const start = await page.$eval('.thread-item:nth-child(1) .drag-handle', (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  const farY = await page.$eval('.thread-item:nth-child(3)', (el) => el.getBoundingClientRect().bottom + 2)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, farY, { steps: 10 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await settle(page, 450)
  check(
    'Escape cancels the drag without reordering',
    (await ids(page, '.thread-item')).join('|') === beforeEscape.join('|'),
    `${beforeEscape.join('|')} -> ${(await ids(page, '.thread-item')).join('|')}`,
  )

  // --- 3. A one-row list has nothing to reorder ----------------------------
  await page.click('.search-input')
  await page.type('.search-input', 'Empty thread')
  await settle(page, 400)
  check('filtering to one thread leaves a single row', (await page.$$('.thread-item')).length === 1)
  check(
    'the grip is disabled when there is nothing to reorder',
    await page.$eval('.thread-item .drag-handle', (el) => el.disabled === true),
  )
  await page.evaluate(() => {
    const el = document.querySelector('.search-input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle(page, 300)

  // --- 4. Ranks survive a reload -------------------------------------------
  const beforeReload = await ids(page, '.thread-item')
  await page.reload({ waitUntil: 'networkidle2' })
  await settle(page, 500)
  check(
    'a custom order survives a reload',
    (await ids(page, '.thread-item')).join('|') === beforeReload.join('|'),
    `${beforeReload.join('|')} -> ${(await ids(page, '.thread-item')).join('|')}`,
  )

  // --- 5. Drag messages inside a thread ------------------------------------
  await page.evaluate(() => {
    window.location.hash = '#/t1'
  })
  await settle(page, 500)
  const msgsBefore = await ids(page, '.message-card')
  check('thread renders draggable messages', msgsBefore.length >= 3, `${msgsBefore.length}`)
  await dragPast(page, '.message-card:nth-child(1)', '.message-card:nth-child(3)')
  const msgsAfter = await ids(page, '.message-card')
  check(
    'dragging a message relocates it',
    msgsAfter[2] === msgsBefore[0],
    `${msgsBefore.join('|')} -> ${msgsAfter.join('|')}`,
  )
  check('message drag wrote a rank', typeof (await viewState(page))[msgsBefore[0]]?.rank === 'number')

  // Message collapse is part of the same synced state.
  await clickSelector(page, '.message-card:nth-child(1) .collapse-toggle')
  await settle(page, 300)
  check('a collapsed message hides its body', (await page.$('.message-card:nth-child(1) pre')) === null)
  const msgOrder = await ids(page, '.message-card')
  await page.reload({ waitUntil: 'networkidle2' })
  await settle(page, 500)
  check('message collapse survives a reload', (await page.$('.message-card:nth-child(1) pre')) === null)
  check('message order survives a reload too', (await ids(page, '.message-card')).join('|') === msgOrder.join('|'))

  // --- 6. Sidebar project collapse (synced state, not local) ---------------
  await clickSelector(page, '.btn-burger')
  await settle(page, 400)

  // Groups are ordered by name, so the first one may well be empty — collapsing
  // an empty group correctly hides nothing. Target the first group that actually
  // has threads.
  const groupIndex = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.sidebar .project-group')]
    return groups.findIndex((g) => g.querySelectorAll('.thread-link-row').length > 0)
  })
  check('sidebar has a populated project group to collapse', groupIndex >= 0, `index ${groupIndex}`)

  const sidebarRows = await page.$$eval('.sidebar .project-group .thread-link-row', (e) => e.length)
  const groups = await page.$$('.sidebar .project-group')
  const toggle = await groups[groupIndex].$('.collapse-toggle')
  await toggle.click()
  await settle(page, 300)
  const sidebarRowsAfter = await page.$$eval('.sidebar .project-group .thread-link-row', (e) => e.length)
  check(
    'collapsing a populated sidebar project hides its threads',
    sidebarRowsAfter < sidebarRows,
    `${sidebarRows} -> ${sidebarRowsAfter}`,
  )
  await clickSelector(page, '.sidebar-overlay')
  await settle(page, 200)
  await page.reload({ waitUntil: 'networkidle2' })
  await settle(page, 500)
  await clickSelector(page, '.btn-burger')
  await settle(page, 400)
  check(
    'sidebar collapse survives a reload',
    (await page.$$eval('.sidebar .project-group .thread-link-row', (e) => e.length)) === sidebarRowsAfter,
  )
  await clickSelector(page, '.sidebar-overlay')
  await settle(page, 200)

  // --- 7. Projects grid drag (needs a single column) -----------------------
  await page.setViewport({ width: 420, height: 900 })
  await page.evaluate(() => {
    window.location.hash = '#/projects'
  })
  await settle(page, 500)
  const projectsBefore = await ids(page, '.project-card-row')
  check('projects grid renders draggable rows', projectsBefore.length >= 3, `${projectsBefore.length}`)
  await dragPast(page, '.project-card-row:nth-child(1)', '.project-card-row:nth-child(3)')
  const projectsAfter = await ids(page, '.project-card-row')
  check(
    'dragging a project relocates it',
    projectsAfter[2] === projectsBefore[0],
    `${projectsBefore.join('|')} -> ${projectsAfter.join('|')}`,
  )
  check('project drag wrote a rank', typeof (await viewState(page))[projectsBefore[0]]?.rank === 'number')

  // --- 8. Sidebar + project-detail rows carry grips -------------------------
  // These surfaces honour ranks but used to render no handle at all, so there
  // was no way to arrange them from the UI.
  await page.setViewport({ width: 1280, height: 900 })
  await page.evaluate(() => {
    window.location.hash = '#/project/p1'
  })
  await settle(page, 500)
  const detailRows = await ids(page, '.thread-card-row')
  check('project detail renders draggable rows', detailRows.length >= 2, `${detailRows.length}`)
  check(
    'project detail rows carry a grip',
    (await page.$$eval('.thread-card-row .drag-handle', (e) => e.length)) === detailRows.length,
  )
  const detailBefore = await ids(page, '.thread-card-row')
  await dragPast(page, '.thread-card-row:nth-child(1)', '.thread-card-row:nth-child(2)')
  check(
    'dragging in project detail relocates the thread',
    (await ids(page, '.thread-card-row'))[1] === detailBefore[0],
    `${detailBefore.join('|')} -> ${(await ids(page, '.thread-card-row')).join('|')}`,
  )

  await page.evaluate(() => {
    window.location.hash = '#/'
  })
  await settle(page, 500)
  await clickSelector(page, '.btn-burger')
  await settle(page, 400)
  check(
    'sidebar project rows carry a grip',
    (await page.$$eval('.sidebar .project-group .drag-handle', (e) => e.length)) > 0,
  )
  const sidebarBefore = await ids(page, '.sidebar .project-group .thread-link-row')
  if (sidebarBefore.length >= 2) {
    await dragPast(
      page,
      '.sidebar .project-group .thread-link-row:nth-child(1)',
      '.sidebar .project-group .thread-link-row:nth-child(2)',
    )
    check(
      'dragging in the sidebar relocates the thread',
      (await ids(page, '.sidebar .project-group .thread-link-row'))[1] === sidebarBefore[0],
      `${sidebarBefore.join('|')} -> ${(await ids(page, '.sidebar .project-group .thread-link-row')).join('|')}`,
    )
  }
  await clickSelector(page, '.sidebar-overlay')
  await settle(page, 200)

  // --- 9. Reordering while a search filter hides rows -----------------------
  // Regression: ranking only the visible subset let hidden rows collide on
  // rank. Drag one visible row and confirm every id — hidden ones included —
  // ends up with its own distinct rank.
  await page.evaluate(() => {
    window.location.hash = '#/'
  })
  await settle(page, 500)
  await page.type('.search-input', 'thread')
  await settle(page, 400)
  const filteredVisible = await ids(page, '.thread-item')
  const allThreadIds = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gistory_threads') || '[]').map((t) => t.id),
  )
  check(
    'the search filter really is hiding rows',
    filteredVisible.length > 0 && filteredVisible.length < allThreadIds.length,
    `${filteredVisible.length} visible of ${allThreadIds.length}`,
  )
  await dragPast(page, '.thread-item:nth-child(1)', '.thread-item:nth-child(2)')
  const filteredAfter = await ids(page, '.thread-item')
  check(
    'a drag under an active filter still relocates the row',
    filteredAfter[1] === filteredVisible[0],
    `${filteredVisible.join('|')} -> ${filteredAfter.join('|')}`,
  )
  const ranksAfterFilter = await viewState(page)
  const rankedAll = Object.entries(ranksAfterFilter).filter(([k]) => allThreadIds.includes(k))
  const distinct = new Set(rankedAll.map(([, v]) => v.rank))
  check(
    'every ranked thread has a distinct rank after a filtered drag',
    rankedAll.length > 0 && distinct.size === rankedAll.length,
    JSON.stringify(rankedAll),
  )

  check('no console errors during the sortable flows', errors.length === 0, errors.join(' | ').slice(0, 300))

  await page.close()
}
// Live-fire QC for the product features added in this pass: tags end-to-end,
// `{{variable}}` template fill-in copy, usage counting, thread forking, and the
// header sync chip.
//
// The fixture has no tags and no sync, so tags are exercised from their empty
// state and the chip's "renders nothing until sync is enabled" rule is
// asserted directly. Template variables get their own thread via a custom
// seed so both the fill-in path and the plain-copy path are covered.

import { SEED, clickSelector, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'product'

/**
 * Clipboard capture. The app's contract is the string it hands to
 * `navigator.clipboard.writeText` — that is the part the app owns. The OS
 * clipboard round-trip itself is not reliably observable in headless Chromium
 * (writeText can resolve while readText still returns empty), so the suite
 * shadows `writeText` on the clipboard object and asserts on the recorded
 * arguments instead. A naive `navigator.clipboard.writeText = fn` assignment
 * silently does nothing (read-only prototype chain) — defineProperty is what
 * actually takes.
 */
const CLIPBOARD_CAPTURE = () => {
  window.__writes = []
  const clip = navigator.clipboard
  const proto = Object.getPrototypeOf(clip)
  const orig = proto && proto.writeText
  Object.defineProperty(clip, 'writeText', {
    value(text) {
      window.__writes.push(String(text))
      try {
        const p = orig.call(clip, text)
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {
        /* headless write may be refused; the app's request is already recorded */
      }
      return Promise.resolve()
    },
    configurable: true,
  })
}

/**
 * openPage + clipboard capture. The capture must be registered before the app
 * code runs, and openPage navigates internally, so it is installed via
 * evaluateOnNewDocument followed by one reload — which re-seeds the same
 * fixture by design, so the app state is identical.
 */
async function openWithClipboard(browser, opts) {
  const page = await openPage(browser, opts)
  await page.evaluateOnNewDocument(CLIPBOARD_CAPTURE)
  await page.reload({ waitUntil: 'networkidle2' })
  await settle(page, 400)
  return page
}

const threads = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('gistory_threads') || '[]'))

/**
 * Click the first element matching `selector` whose trimmed text equals `text`.
 *
 * This is an ElementHandle click — real CDP input, carrying user activation —
 * not `el.click()` from evaluate. The copy buttons call
 * `navigator.clipboard.writeText`, which Chrome only honours inside a genuine
 * user gesture; a synthetic click makes it reject and the clipboard stays
 * empty, which read as a copy bug that was actually a harness artifact.
 */
async function clickByText(page, selector, text) {
  const handles = await page.$$(selector)
  for (const handle of handles) {
    if ((await handle.evaluate((el) => (el.textContent || '').trim())) === text) {
      await handle.click()
      await settle(page, 300)
      return
    }
  }
  throw new Error(`no element matching "${selector}" with text "${text}"`)
}

const clipboardText = (page, i = 0) => page.evaluate((idx) => window.__writes?.[idx], i)

// One message with two placeholders (so fill-all and fill-some differ), one
// without any (so the plain-copy path is provable).
const TEMPLATE_SEED = {
  ...SEED,
  gistory_threads: [
    {
      id: 't9',
      name: 'Template thread',
      projectIds: [],
      createdAt: 1700000800000,
      updatedAt: 1700000800000,
    },
    ...SEED.gistory_threads,
  ],
  gistory_messages: {
    ...SEED.gistory_messages,
    t9: [
      {
        id: 'm9',
        threadId: 't9',
        content: 'Write a haiku about {{topic}} in {{language}}.',
        createdAt: 1700000810000,
      },
    ],
  },
}

export default async function run({ check, eq, baseUrl, browser }) {

  // --- 1. The header sync chip stays hidden until sync is enabled ----------
  {
    const page = await openPage(browser, { url: baseUrl + '#/' })
    eq('no sync chip before sync is enabled', (await page.$$('.sync-chip')).length, 0)
    await page.close()
  }

  // --- 2. Tags: add from zero, persist, show on the board, filter ----------
  {
    const page = await openWithClipboard(browser, { url: baseUrl + '#/t1' })

    eq('fixture thread starts with no tags', (await page.$$('.meta-tags .tag')).length, 0)

    await clickSelector(page, '.tag-add')
    await page.type('.tag-input', 'urgent')
    await page.keyboard.press('Enter')
    await settle(page, 250)

    eq(
      'the typed tag becomes a chip',
      await page.$$eval('.meta-tags .tag', (els) => els.map((e) => e.textContent.trim())),
      ['urgent'],
    )
    eq('the inline tag input closes after committing', (await page.$$('.tag-input')).length, 0)

    // Persistence: the write must be in storage, not just in React state. A
    // page.reload() cannot prove this — openPage seeds localStorage on every
    // navigation (evaluateOnNewDocument), so a reload re-seeds the fixture and
    // erases user changes by design. A seedless sibling page in the SAME
    // context hydrates from exactly what the app wrote.
    const t1Tagged = (await threads(page)).find((t) => t.id === 't1')
    eq('the tag reached localStorage', t1Tagged.metadata?.tags, ['urgent'])
    const sibling = await page.browserContext().newPage()
    await sibling.goto(baseUrl + '#/t1', { waitUntil: 'networkidle2' })
    await settle(sibling, 400)
    eq(
      'a fresh page hydrates the tag from storage (no re-seed)',
      await sibling.$$eval('.meta-tags .tag', (els) => els.map((e) => e.textContent.trim())),
      ['urgent'],
    )

    // Home board: chip shown on the row, clicking it filters the board.
    await sibling.evaluate(() => { window.location.hash = '#/' })
    await settle(sibling, 350)
    eq(
      'the board shows the tag as a chip',
      await sibling.$$eval('.thread-tags .tag', (els) => els.map((e) => e.textContent.trim())),
      ['urgent'],
    )
    await clickSelector(sibling, '.thread-tags .tag')
    eq('clicking a tag chip sets the search query', await sibling.$eval('.search-input', (el) => el.value), 'urgent')
    eq('the tag filter leaves only the tagged thread', (await sibling.$$('.thread-item')).length, 1)
    await sibling.close()

    // Remove it again — the editor has to be reversible, not one-way.
    await page.evaluate(() => { window.location.hash = '#/t1' })
    await settle(page, 350)
    await clickSelector(page, '.tag-remove')
    await settle(page, 250)
    eq('removing the tag empties the chip row', (await page.$$('.meta-tags .tag')).length, 0)
    const t1 = (await threads(page)).find((t) => t.id === 't1')
    eq('removal persists an empty tag list', t1.metadata?.tags, [])

    // --- 3. Plain copy: no placeholders, no dialog, usage counted ----------
    const m3 = (await page.evaluate(() => JSON.parse(localStorage.getItem('gistory_messages')))).t1.find(
      (m) => m.id === 'm3',
    )
    const updatedAtBefore = (await threads(page)).find((t) => t.id === 't1').updatedAt
    await clickByText(page, '.message-card .message-actions button', 'Copy')
    eq('a message without placeholders copies without a dialog', (await page.$$('.modal')).length, 0)
    eq('the clipboard holds the message as written', await clipboardText(page), m3.content)
    eq('the usage stamp appears after the first copy', await page.$eval('.meta-usage', (el) => el.textContent.trim()), '1 uses')
    const t1AfterCopy = (await threads(page)).find((t) => t.id === 't1')
    eq('usageCount reached the stored thread', t1AfterCopy.metadata?.usageCount, 1)
    eq(
      'copying does not bump updatedAt (a copy is not an edit)',
      t1AfterCopy.updatedAt,
      updatedAtBefore,
    )

    // --- 4. Fork: full copy, parent link, new ids --------------------------
    await clickSelector(page, '.thread-header .action-menu-trigger')
    await clickByText(page, '.action-menu-item', 'Fork')
    const hash = await page.evaluate(() => window.location.hash)
    check('forking opens the new thread', hash.startsWith('#/t') && hash !== '#/t1', hash)
    check(
      'the fork is named after its source',
      (await page.$eval('.thread-title', (el) => el.textContent)).endsWith('(fork)'),
    )
    eq('the fork carries all three messages', (await page.$$('.message-card')).length, 3)
    const fork = (await threads(page)).find((t) => t.id === hash.slice(2))
    eq('the fork records its parent', fork.metadata?.parentId, 't1')
    eq('the fork bumps the version', fork.metadata?.version, 2)
    const forkMsgs = (await page.evaluate(() => JSON.parse(localStorage.getItem('gistory_messages'))))[fork.id]
    eq('forked messages get fresh ids', forkMsgs.some((m) => ['m1', 'm2', 'm3'].includes(m.id)), false)
    eq('forked message count matches the source', forkMsgs.length, 3)

    await page.close()
  }

  // --- 5. Template variables: fill-in dialog, partial fill, usage ----------
  {
    const page = await openWithClipboard(browser, { url: baseUrl + '#/t9', seed: TEMPLATE_SEED })

    await clickByText(page, '.message-card .message-actions button', 'Copy')
    await settle(page, 300)
    eq('a template message opens the fill dialog instead of copying', (await page.$$('.modal')).length, 1)
    eq(
      'every unique placeholder gets an input',
      await page.$$eval('.template-vars input', (els) => els.map((e) => e.getAttribute('aria-label'))),
      ['Value for topic', 'Value for language'],
    )

    await page.type('input[aria-label="Value for topic"]', 'robots')
    await page.type('input[aria-label="Value for language"]', 'Japanese')
    await clickByText(page, '.modal-footer button', 'Copy filled')
    eq('the dialog closes after copying', (await page.$$('.modal')).length, 0)
    eq(
      'the copy has the placeholders replaced',
      await clipboardText(page, 0),
      'Write a haiku about robots in Japanese.',
    )
    eq('the filled copy counts as usage', await page.$eval('.meta-usage', (el) => el.textContent.trim()), '1 uses')

    // Partial fill: an empty value must leave the placeholder as written.
    await clickByText(page, '.message-card .message-actions button', 'Copy')
    await page.type('input[aria-label="Value for topic"]', 'robots')
    await clickByText(page, '.modal-footer button', 'Copy filled')
    eq(
      'an unfilled placeholder is copied exactly as written',
      await clipboardText(page, 1),
      'Write a haiku about robots in {{language}}.',
    )
    const t9 = (await threads(page)).find((t) => t.id === 't9')
    eq('both copies counted', t9.metadata?.usageCount, 2)
    eq('template copying also leaves updatedAt alone', t9.updatedAt, 1700000800000)

    await page.close()
  }
}

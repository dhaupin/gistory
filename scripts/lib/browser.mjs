// Shared helpers for the headless-browser harness.
//
// Everything here runs ONLY under `scripts/` and `tests/` — never during a
// production build (tsconfig includes only `src/`). See `.puppeteerrc.cjs` for
// why `npm install` never downloads Chromium.

import puppeteer from 'puppeteer'

/** Preview URL. Override with PREVIEW_URL or by passing an http(s) arg. */
export const DEFAULT_URL = process.env.PREVIEW_URL || 'http://localhost:5173'

/** Is something serving the app at this origin? */
async function servesApp(url) {
  try {
    const res = await fetch(url + '/', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('id="root"') || html.includes('/src/main.tsx')
  } catch {
    return false
  }
}

/**
 * Resolve the preview origin.
 *
 * An explicit http(s) arg or PREVIEW_URL always wins. Otherwise we probe the
 * usual Vite ports, because the dev server here does not always get 5173 (a
 * stale server may already hold it) and auditing the wrong port silently
 * measures the wrong build.
 */
export async function resolveBaseUrl(argv = process.argv.slice(2)) {
  const explicit = argv.find((a) => a.startsWith('http'))
  if (explicit) return explicit.replace(/\/+$/, '')
  if (process.env.PREVIEW_URL) return process.env.PREVIEW_URL.replace(/\/+$/, '')

  const live = []
  for (let port = 5173; port <= 5180; port++) {
    const candidate = `http://localhost:${port}`
    if (await servesApp(candidate)) live.push(candidate)
  }

  if (live.length === 0) return DEFAULT_URL
  if (live.length > 1) {
    console.warn(
      `\n  WARNING: ${live.length} dev servers are responding (${live.join(', ')}).\n` +
        `  Auditing ${live[live.length - 1]} (newest). Pass the URL explicitly to be sure.\n`,
    )
  }
  return live[live.length - 1]
}

/**
 * Launch headless Chrome, or exit with an actionable message.
 * `headless: 'shell'` uses chrome-headless-shell (fastest for auditing).
 */
export async function launchBrowser(options = {}) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined
  try {
    return await puppeteer.launch({
      headless: 'shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath,
      ...options,
    })
  } catch (err) {
    const first = String(err?.message || err).split('\n')[0]
    console.error('\n  Could not start a headless browser:', first, '\n')
    console.error('  Install one (once per machine), then re-run:\n')
    console.error('    bun run ui:browsers\n')
    process.exit(2)
  }
}

// --- Fixture data -----------------------------------------------------------
// Field names must match src/lib/models.ts: Thread.projectIds is an ARRAY,
// Message carries threadId, Project has no threads back-reference.

export const SEED = {
  gistory_sort: 'createdAt_desc',
  gistory_projects: [
    { id: 'p1', name: 'Gistory', createdAt: 1700000000000 },
    { id: 'p2', name: 'Marketing site', createdAt: 1700000100000 },
    { id: 'p3', name: 'Empty project', createdAt: 1700000200000 },
  ],
  gistory_threads: [
    {
      id: 't1',
      name: 'Refactor the sync layer',
      projectIds: ['p1'],
      createdAt: 1700000000000,
      updatedAt: 1700000500000,
    },
    { id: 't2', name: 'Empty thread', projectIds: [], createdAt: 1700000600000 },
    {
      id: 't3',
      name: 'Weekly planning prompt',
      projectIds: ['p1', 'p2'],
      createdAt: 1700000200000,
      updatedAt: 1700000300000,
    },
    {
      id: 't4',
      name: 'A deliberately very long thread name that should wrap or ellipsize gracefully instead of breaking the layout badly',
      projectIds: [],
      createdAt: 1700000700000,
    },
    {
      id: 't5',
      name: 'Older thread',
      projectIds: ['p2'],
      createdAt: 1600000000000,
      updatedAt: 1600000000000,
    },
  ],
  gistory_messages: {
    t1: [
      {
        id: 'm1',
        threadId: 't1',
        content:
          'Explain how the pull watermark works, and why a push must not advance it.',
        createdAt: 1700000010000,
      },
      {
        id: 'm2',
        threadId: 't1',
        content:
          'Now rewrite it as one indexed query with LIMIT and a short-page check, and show the SQL.',
        createdAt: 1700000020000,
      },
      {
        id: 'm3',
        threadId: 't1',
        content:
          'A much longer block to exercise wrapping and scrolling behaviour: when two devices push at the same time the sequence numbers still have to be unique per chain, which is why the insert selects MAX(seq)+1 rather than trusting a client-assigned counter.',
        createdAt: 1700000030000,
      },
    ],
    t2: [],
    t3: [],
    t4: [],
    t5: [],
  },
  gistory_deleted: { threads: {}, messages: {}, projects: {} },
}

/**
 * Open a page with fixture data seeded *before* any app code runs, so the app
 * hydrates from it instead of racing it.
 *
 * Each page gets its OWN browser context. Pages in one context share
 * localStorage, so without this a suite that drags rows or collapses a group
 * leaks that state into the next suite — which showed up as "pinning a message
 * does not float to the top" (the previous suite had left custom ranks, and a
 * manual order deliberately outranks pin-first).
 */
export async function openPage(browser, { url, seed = SEED, dark = false, width = 1280, height = 900 } = {}) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.once('close', () => {
    context.close().catch(() => {})
  })
  await page.setViewport({ width, height })
  await page.evaluateOnNewDocument(
    (data, darkMode) => {
      const all = { ...data, gistory_dark: darkMode ? 'true' : 'false' }
      for (const key of Object.keys(all)) {
        const value = all[key]
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
      }
    },
    seed,
    dark,
  )
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
  return page
}

/** Click the first <button> whose trimmed text matches exactly. */
export async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((t) => {
    // Open action-menu dropdowns come first: a menu item's text (a project
    // named "Gistory", a thread renamed to "Settings") can collide with a
    // header element, and the dropdown is the thing under test.
    const scope = document.querySelector('.action-menu-dropdown') || document
    const button = [...scope.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === t,
    )
    if (!button) return false
    button.click()
    return true
  }, text)
  if (!clicked) throw new Error(`no button with text "${text}"`)
  await settle(page)
}

export async function clickSelector(page, selector) {
  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    el.click()
    return true
  }, selector)
  if (!clicked) throw new Error(`no element matching "${selector}"`)
  await settle(page)
}

/** Give React a tick to flush after an interaction. */
export function settle(page, ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

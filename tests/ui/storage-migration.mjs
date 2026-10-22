// Rollout step 1 of labs/prd-sync.md: sync state moved to IndexedDB.
//
// The migration contract, exercised in a REAL browser:
//
//   • a device that had everything in localStorage (every existing install)
//     boots with it intact — nothing may read as empty;
//   • the same data lands in the IndexedDB `gistory` kv store;
//   • localStorage keys are NOT deleted in this step — the shadow is kept
//     deliberately, updated after every successful IndexedDB write, and a
//     later rollout step makes IndexedDB authoritative read path;
//   • a second boot reads from IndexedDB (the seeded mem map), so a stale or
//     tampered localStorage copy cannot resurrect over current data.
//
// Runs against the dev server via the shared harness; each page gets its own
// context, which matters here because the whole test is about storage state.

import { openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'storage-migration'

const THREAD_NAME = 'Thread to migrate'
const MIGRATION_SEED = {
  gistory_device_id: '11111111-1111-4111-8111-111111111111',
  gistory_device_name: 'Migration Fixtures',
  gistory_chain_id: 'chain-migr-a1',
  gistory_sync_key: 'migration-passphrase',
  gistory_write_secret: 'q'.repeat(43),
  gistory_seq_chain: '12',
  gistory_threads: [
    {
      id: 't-migrate',
      name: THREAD_NAME,
      projectIds: [],
      createdAt: 1700000010000,
      updatedAt: 1700000010000,
      metadata: { tags: [] },
    },
  ],
  gistory_messages: {},
  gistory_projects: [],
  gistory_deleted: { threads: {}, messages: {}, projects: {} },
}

/** Read the gistory IndexedDB kv store from inside the page. */
async function readIdb(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        if (!window.indexedDB) return resolve(null)
        const req = window.indexedDB.open('gistory', 1)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('kv')) {
            db.close()
            return resolve({ exists: false, rows: {} })
          }
          const tx = db.transaction('kv', 'readonly')
          const store = tx.objectStore('kv')
          const rows = {}
          const cursor = store.openCursor()
          cursor.onsuccess = () => {
            const at = cursor.result
            if (at) {
              rows[String(at.key)] = String(at.value)
              at.continue()
            } else {
              db.close()
              resolve({ exists: true, rows })
            }
          }
          cursor.onerror = () => {
            db.close()
            resolve({ exists: false, rows: {} })
          }
        }
        req.onerror = () => resolve(null)
      }),
  )
}

export default async function run({ check, baseUrl, browser }) {
  // 1. A localStorage-era device boots on the new build: never an empty board.
  // The hash router serves the lander at the bare origin; the board is '#/'.
  const page = await openPage(browser, { url: `${baseUrl}/#/`, seed: MIGRATION_SEED })
  await page.waitForSelector('.boot-hold', { timeout: 5000 }).catch(() => {})
  await page.waitForFunction(
    (needle) => document.body.textContent.includes(needle),
    { timeout: 10000 },
    THREAD_NAME,
  )
  check('post-gate render shows the migrated thread', true)

  // 2. The same data must be in IndexedDB now.
  const after = await readIdb(page)
  check('IndexedDB store exists', !!after && after.exists)
  check(
    'gistory_threads migrated into IndexedDB',
    !!after && /t-migrate/.test(after.rows['gistory_threads'] || ''),
    after && Object.keys(after.rows).join(','),
  )
  check(
    'the per-chain watermark migrated into IndexedDB',
    !!after && after.rows['gistory_seq_chain'] === '12',
    after && JSON.stringify(after.rows['gistory_seq_chain']),
  )
  check(
    'the device identity migrated into IndexedDB',
    !!after &&
      after.rows['gistory_device_id'] === '11111111-1111-4111-8111-111111111111',
  )
  check(
    'a post-boot write also reached IndexedDB (settings persist on mount)',
    !!after && typeof after.rows['gistory_settings'] === 'string',
  )
  check(
    'UI-local keys did NOT migrate (they stay device-local)',
    !!after && after.rows['gistory_dark'] === undefined,
  )

  // 3. This step keeps the localStorage shadow — done on every successful
  //    IndexedDB write, so it stays a plausible rollback path.
  const local = await page.evaluate(() => ({
    threads: localStorage.getItem('gistory_threads'),
    seq: localStorage.getItem('gistory_seq_chain'),
  }))
  check('localStorage still carries the thread shadow', !!local.threads)
  check('localStorage still carries the watermark shadow', local.seq === '12')

  // 4. Second boot must read from IndexedDB, not the shadow. The shadow's
  //    thread copy is stale-but-present; the render must still be current.
  await page.evaluate(() => {
    const threads = JSON.parse(localStorage.getItem('gistory_threads') || '[]')
    if (threads.length) threads[0] = { ...threads[0], name: 'Stale shadow name' }
    localStorage.setItem('gistory_threads', JSON.stringify(threads))
  })
  await settle(page)
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForFunction(
    (needle) => document.body.textContent.includes(needle),
    { timeout: 10000 },
    THREAD_NAME,
  )
  check('second boot shows the IndexedDB-authoritative thread', true)
  const stale = await page.evaluate(
    (needle) => document.body.textContent.includes(needle),
    'Stale shadow name',
  )
  check('second boot ignored the stale shadow', !stale)
}

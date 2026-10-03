// Export -> Import round trip through the real UI.
//
// Export writes a real download (verified via CDP); importing that exact file
// into a fresh profile must reproduce the data. The fixture uses the models'
// real field names (Thread.projectIds is an array), so a rename there fails
// this test.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SEED, clickButtonByText, openPage, settle } from '../../scripts/lib/browser.mjs'
import { waitForDownload } from './_shared.mjs'

export const name = 'export-import'

const EMPTY_SEED = {
  gistory_sort: 'createdAt_desc',
  gistory_threads: [],
  gistory_messages: {},
  gistory_projects: [],
  gistory_deleted: { threads: {}, messages: {}, projects: {} },
}

export default async function run({ check, baseUrl, browser }) {
  // --- Export ---------------------------------------------------------------
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gistory-dl-'))
  const exporter = await openPage(browser, { url: baseUrl + '#/settings', seed: SEED })
  const cdp = await exporter.createCDPSession()
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir })

  await clickButtonByText(exporter, 'Snapshot')
  await clickButtonByText(exporter, 'Export All Data')
  const file = await waitForDownload(dlDir)
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))

  check('export produced gistory-export-full.json', path.basename(file) === 'gistory-export-full.json', path.basename(file))
  check('export payload has the expected keys', ['version', 'exportedAt', 'threads', 'messages', 'projects'].every((k) => k in payload), Object.keys(payload).join(','))
  check('export kept every seeded thread', payload.threads.length === SEED.gistory_threads.length, `${payload.threads.length} vs ${SEED.gistory_threads.length}`)
  check('export kept every seeded project', payload.projects.length === SEED.gistory_projects.length)
  check('export kept thread messages', (payload.messages.t1 || []).length === 3, String((payload.messages.t1 || []).length))
  check('export preserved Thread.projectIds as an array', Array.isArray(payload.threads.find((t) => t.id === 't1').projectIds))
  await exporter.close()

  // --- Import the same file into a fresh profile ----------------------------
  const importer = await openPage(browser, { url: baseUrl + '#/settings', seed: EMPTY_SEED })
  await clickButtonByText(importer, 'Snapshot')

  // Sentinel: a full page reload would wipe this, so it proves the import is
  // applied to live state rather than forcing `window.location.reload()`.
  await importer.evaluate(() => {
    window.__importSurvivedWithoutReload = true
  })

  const input = await importer.$('.file-input input[type="file"]')
  check('import file input exists', !!input)
  await input.uploadFile(file)

  await importer.waitForFunction(
    () => {
      const el = document.querySelector('.import-status')
      return !!el && el.textContent.trim().length > 0
    },
    { timeout: 15000 },
  )
  const status = await importer.$eval('.import-status', (el) => el.textContent.trim())
  check('import reports success', /^Imported /i.test(status), status)
  check('import matched the exported counts', status.includes(`${SEED.gistory_threads.length} threads`), status)

  await importer.waitForFunction(
    () => {
      try {
        return JSON.parse(localStorage.getItem('gistory_threads') || '[]').length > 0
      } catch {
        return false
      }
    },
    { timeout: 15000 },
  )
  const stored = await importer.evaluate(() => ({
    threads: JSON.parse(localStorage.getItem('gistory_threads') || '[]'),
    projects: JSON.parse(localStorage.getItem('gistory_projects') || '[]'),
    messages: JSON.parse(localStorage.getItem('gistory_messages') || '{}'),
  }))

  check('imported threads persisted', stored.threads.length === SEED.gistory_threads.length, `${stored.threads.length}`)
  check('imported projects persisted', stored.projects.length === SEED.gistory_projects.length)
  check('imported messages persisted', (stored.messages.t1 || []).length === 3)
  check('imported thread kept its project links', (stored.threads.find((t) => t.id === 't1')?.projectIds || []).join(',') === 'p1')

  // The imported board must render the threads immediately — the app owns the
  // state, so no reload is involved.
  await importer.evaluate(() => {
    window.location.hash = '#/'
  })
  await settle(importer, 400)
  const rendered = await importer.evaluate(() => document.body.innerText.includes('Refactor the sync layer'))
  check('imported thread is visible on the board', rendered)

  // Wait past the 1500ms delay the old implementation used to reload, then
  // confirm no reload ever happened.
  await settle(importer, 1700)
  const survived = await importer.evaluate(() => window.__importSurvivedWithoutReload === true)
  check('import applies live without forcing a page reload', survived)

  await importer.close()
}

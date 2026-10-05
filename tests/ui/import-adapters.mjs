// Live-fire QC for the ChatGPT/Claude import adapters, exercised through the
// real Settings → Snapshot upload control with real files from disk.
//
// The fixtures mirror the documented export shapes: ChatGPT conversations.json
// (mapping tree, epoch-second times, content.parts) and Claude's conversations
// (chat_messages with ISO timestamps and human/assistant senders).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SEED, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'import-adapters'

function makeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gistory-import-'))
  const chatgpt = [
    {
      title: 'GPT sync chat',
      create_time: 1700000000,
      update_time: 1700000100,
      conversation_id: 'abc123def456',
      mapping: {
        root: {},
        a: {
          message: {
            author: { role: 'user' },
            content: { parts: ['hello from chatgpt'] },
            create_time: 1700000001,
          },
        },
        b: {
          message: {
            author: { role: 'assistant' },
            content: { parts: ['hi! how can I help?'] },
            create_time: 1700000002,
          },
        },
        empty: { message: { author: { role: 'system' }, content: { parts: [''] } } },
      },
    },
  ]
  const claude = [
    {
      uuid: 'c1aude5e5510n',
      name: 'Claude planning chat',
      created_at: '2023-11-14T22:13:20.000Z',
      updated_at: '2023-11-14T22:14:20.000Z',
      chat_messages: [
        { sender: 'human', text: 'plan my week', created_at: '2023-11-14T22:13:21.000Z' },
        { sender: 'assistant', text: 'here is a plan', created_at: '2023-11-14T22:13:25.000Z' },
      ],
    },
  ]
  const garbage = { hello: 'world', not: 'an export' }
  const write = (name, data) => {
    const p = path.join(dir, name)
    fs.writeFileSync(p, JSON.stringify(data))
    return p
  }
  return {
    dir,
    chatgpt: write('chatgpt.json', chatgpt),
    claude: write('claude.json', claude),
    garbage: write('garbage.json', garbage),
  }
}

async function importFile(page, filePath) {
  const input = await page.$('.import-section input[type=file]')
  if (!input) throw new Error('import file input not found')
  await input.uploadFile(filePath)
  await settle(page, 400)
}

const boardText = (page) => page.evaluate(() => document.body.textContent)

export default async function run({ check, eq, baseUrl, browser }) {
  const fx = makeFixtures()

  // --- ChatGPT export --------------------------------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/settings' })
    await clickByText(page, '.tab', 'Snapshot')
    await importFile(page, fx.chatgpt)

    const status = await page.$eval('.import-status', el => el.textContent)
    check('the status names the format', status.includes('ChatGPT export'), status)
    check('the status counts the thread', status.includes('1 thread(s)'), status)

    await page.evaluate(() => { window.location.hash = '#/' })
    await settle(page, 350)
    check('the imported thread appears on the board', (await boardText(page)).includes('GPT sync chat'))

    // Open it: user text verbatim, assistant prefixed, system turn skipped.
    await page.evaluate(() => {
      const t = JSON.parse(localStorage.getItem('gistory_threads')).find(t => t.name === 'GPT sync chat')
      window.location.hash = '#/' + t.id
    })
    await settle(page, 350)
    // Assert on STORAGE order (ascending createdAt), not the board's display
    // order — the default sort is newest-first, so the DOM shows them reversed.
    const gptTurns = await page.evaluate(() => {
      const t = JSON.parse(localStorage.getItem('gistory_threads')).find(t => t.name === 'GPT sync chat')
      return (JSON.parse(localStorage.getItem('gistory_messages'))[t.id] || [])
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(m => m.content)
    })
    eq('two turns imported (system noise dropped)', gptTurns.length, 2)
    eq('the user turn is verbatim', gptTurns[0], 'hello from chatgpt')
    check('the assistant turn is prefixed', gptTurns[1].startsWith('Assistant:'), gptTurns[1])
    eq('the thread keeps the export timestamps', ((await page.evaluate(() => JSON.parse(localStorage.getItem('gistory_threads')))).find(t => t.name === 'GPT sync chat')).createdAt, 1700000000000)
    await page.close()
  }

  // --- Claude export -----------------------------------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/settings' })
    await clickByText(page, '.tab', 'Snapshot')
    await importFile(page, fx.claude)

    const status = await page.$eval('.import-status', el => el.textContent)
    check('the status names the format', status.includes('Claude export'), status)

    await page.evaluate(() => { window.location.hash = '#/' })
    await settle(page, 350)
    check('the imported thread appears on the board', (await boardText(page)).includes('Claude planning chat'))

    await page.evaluate(() => {
      const t = JSON.parse(localStorage.getItem('gistory_threads')).find(t => t.name === 'Claude planning chat')
      window.location.hash = '#/' + t.id
    })
    await settle(page, 350)
    const claudeTurns = await page.evaluate(() => {
      const t = JSON.parse(localStorage.getItem('gistory_threads')).find(t => t.name === 'Claude planning chat')
      return (JSON.parse(localStorage.getItem('gistory_messages'))[t.id] || [])
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(m => m.content)
    })
    eq('both turns imported', claudeTurns.length, 2)
    eq('the human turn is verbatim', claudeTurns[0], 'plan my week')
    check('the assistant turn is prefixed', claudeTurns[1].startsWith('Assistant:'), claudeTurns[1])
    await page.close()
  }

  // --- Unknown JSON is refused, not imported -----------------------------------
  {
    const page = await openPage(browser, { url: baseUrl + '#/settings' })
    await clickByText(page, '.tab', 'Snapshot')
    await importFile(page, fx.garbage)
    const status = await page.$eval('.import-status', el => el.textContent)
    check('garbage JSON is refused with a useful message', status.startsWith('Error: Unsupported file format'), status)
    eq('nothing was imported', (await page.evaluate(() => (JSON.parse(localStorage.getItem('gistory_threads') || '[]')).length)), SEED.gistory_threads.length)
    await page.close()
  }

  fs.rmSync(fx.dir, { recursive: true, force: true })
}

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

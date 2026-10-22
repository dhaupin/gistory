// Live lander check against the managed preview: the sample prompt block in
// "How it works" must render with Prism token spans (autoloader-fetched yaml
// grammar), the language badge, and a working copy button — and ONLY inside
// .lander (the app shell's ThreadView <pre> must stay untouched).
import { resolveBaseUrl, launchBrowser, openPage, settle } from './lib/browser.mjs'

const origin = await resolveBaseUrl(process.argv.slice(2))
const browser = await launchBrowser()
const page = await openPage(browser, { url: `${origin}/`, width: 1280, height: 900 })
// CDN + autoloader need a beat before grammar and buttons land.
await settle(page, 2000)

const d = await page.evaluate(() => {
  const pre = document.querySelector('.lander-example pre')
  const appPre = document.querySelector('.thread-view pre')
  return {
    badge: pre?.getAttribute('data-language') || null,
    tokenCount: pre ? pre.querySelectorAll('.token').length : 0,
    copyBtn: !!pre?.querySelector('.lander-copy-btn'),
    placeholderText: (pre?.textContent || '').includes('{{repos}}'),
    prismCss: !!document.querySelector('link[href*="prism-tomorrow"]'),
    scripts: Array.from(document.scripts).filter((s) => (s.src || '').includes('prismjs')).length,
    appPreHighlighted: !!appPre?.querySelector('.token'),
  }
})
console.log(JSON.stringify(d, null, 2))

const problems = []
if (d.badge !== 'yaml') problems.push(`badge ${d.badge}, expected yaml`)
if (!d.tokenCount) problems.push('no Prism token spans in the sample block')
if (!d.copyBtn) problems.push('copy button missing')
if (!d.placeholderText) problems.push('{{repos}} placeholder missing from rendered text')
if (!d.prismCss) problems.push('prism stylesheet not injected')
if (d.scripts < 2) problems.push(`prism scripts not all injected (${d.scripts})`)
if (d.appPreHighlighted) problems.push('app-shell <pre> got highlighted — scope leaked')

await browser.close().catch(() => {})
if (problems.length) { console.error('FAIL:', problems.join('; ')); process.exit(1) }
console.log('LANDER CODE HIGHLIGHT: PASS')

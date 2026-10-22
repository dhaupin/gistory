// Docs-frame fixture check (no Ruby on this box, so Jekyll can't run here):
// renders docs/_layouts/default.html into a static page by substituting the
// Liquid tags it uses, serves it in-process, and drives the sidebar drawer,
// theme switch, search modal, and active-link marking in a real browser.
// Viewports: desktop 1280 and mobile 390 (the 760px breakpoint).
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { launchBrowser, openPage, settle } from './lib/browser.mjs'

let html = readFileSync(new URL('../docs/_layouts/default.html', import.meta.url), 'utf8')
const NAV = [
  { title: 'Start', items: [{ title: 'Home', url: '/' }, { title: 'Getting Started', url: '/getting-started' }] },
  { title: 'Guides', items: [{ title: 'Features', url: '/features' }, { title: 'Sync & Security', url: '/sync-and-security' }, { title: 'The gistory-sync npm package', url: '/npm' }] },
  { title: 'Reference', items: [{ title: 'FAQ', url: '/faq' }, { title: 'Contributing', url: '/contributing' }] },
]
const navHtml = NAV.map((s) => `
<div class="docs-nav-section">
<p class="docs-nav-title">${s.title}</p>
<ul>
${s.items.map((i) => `<li><a href="${i.url}"${i.url === '/faq' ? ' aria-current="page"' : ''}>${i.title}</a></li>`).join('\n')}
</ul>
</div>`).join('\n')
const projectBlock = `
<div class="docs-nav-section">
<p class="docs-nav-title">Project</p>
<ul>
<li><a href="https://gistory.creadev.org">Open the app</a></li>
<li><a href="https://github.com/dhaupin/gistory" target="_blank" rel="noopener noreferrer">Source on GitHub</a></li>
<li><a href="https://creadev.org" target="_blank" rel="noopener">Creadev.org</a></li>
</ul>
</div>`

// Substitution order matters: exact URL filters first (they must survive the
// generic strip), then comment blocks, then the nav loop, then any leftover
// Liquid, then the content.
for (const [from, to] of [
  ['{{ page.title }} | {{ site.title }}', 'FAQ | Gistory docs'],
  ["{{ '/assets/main.css' | relative_url }}", '/assets/main.css'],
  ["{{ '/pagefind/pagefind.css' | relative_url }}", '/pagefind.css'],
  ["{{ '/' | relative_url }}", '/'],
  ['{{ "pagefind/pagefind.js" | relative_url }}', '/pagefind.js'],
  ["{{ '/faq' | relative_url }}", '/faq'],
  ["{{ 'now' | date: '%Y' }}", String(new Date().getFullYear())],
]) html = html.split(from).join(to)
html = html.replace(/\{%\s*comment\s*%\}[\s\S]*?\{%\s*endcomment\s*%\}/g, '')
html = html.replace(/\{% for section in site\.data\.nav %\}[\s\S]*?\{% endfor %\}\s*<\/ul>\s*<\/div>\s*\{% endfor %\}/, navHtml)
html = html.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, '')
html = html.replace('<main class="docs-content"', `${projectBlock}\n<main class="docs-content"`)
html = html.replace(/<main class="docs-content" data-pagefind-body>[\s\S]*?<\/main>/,
  '<main class="docs-content" data-pagefind-body><h1>FAQ</h1><p>fixture body</p></main>')

const css = readFileSync(new URL('../docs/assets/main.css', import.meta.url), 'utf8')
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0]
  if (url === '/' || url === '/faq') { res.setHeader('content-type', 'text/html'); res.end(html); return }
  if (url === '/assets/main.css') { res.setHeader('content-type', 'text/css'); res.end(css); return }
  res.statusCode = 404
  res.setHeader('content-type', 'text/plain')
  res.end('fixture 404')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
console.log('fixture at', origin)

const browser = await launchBrowser()
const problems = []
const expect = (actual, expected, msg) => { if (actual !== expected) problems.push(`${msg} (got ${JSON.stringify(actual)})`) }

// --- Desktop (/faq) ---------------------------------------------------------
{
  const page = await openPage(browser, { url: `${origin}/faq`, width: 1280, height: 900 })
  const d = await page.evaluate(() => ({
    leftover: /\{\{|\{%/.test(document.body.innerHTML),
    current: document.querySelector('.docs-nav a[aria-current="page"]')?.getAttribute('href') || null,
    active: document.querySelector('.docs-nav a.docs-nav-active')?.getAttribute('href') || null,
    sidebarVisible: getComputedStyle(document.getElementById('docsNav')).display !== 'none',
    theme: document.documentElement.getAttribute('data-theme'),
    sunShown: getComputedStyle(document.querySelector('.docs-icon-sun')).display !== 'none',
    credit: [...document.querySelectorAll('.docs-footer a')].map(a => ({ t: a.textContent.trim(), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
  }))
  console.log('desktop:', JSON.stringify(d, null, 2))
  expect(d.leftover, false, 'unsubstituted Liquid in fixture')
  expect(d.current, '/faq', 'aria-current not on FAQ')
  expect(d.active, '/faq', 'JS active class not on FAQ')
  expect(d.sidebarVisible, true, 'sidebar hidden on desktop')
  expect(d.credit.some(c => c.t === 'Creadev.org' && c.href === 'https://creadev.org' && c.target === '_blank' && !/nofollow/i.test(c.rel)), true, 'footer credit link wrong')

  await page.click('#docsThemeToggle')
  const after = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('gistory_docs_theme'),
    sunShown: getComputedStyle(document.querySelector('.docs-icon-sun')).display !== 'none',
    darkBg: getComputedStyle(document.body).backgroundColor,
  }))
  console.log('after toggle:', JSON.stringify(after))
  expect(after.theme, 'dark', 'theme did not switch to dark')
  expect(after.stored, 'dark', 'theme not persisted')
  expect(after.sunShown, true, 'sun icon not shown in dark mode')
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark', 'theme lost on reload')

  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control')
  expect(await page.evaluate(() => document.getElementById('docsSearchModal').classList.contains('docs-search-open')), true, 'Ctrl+K did not open search modal')
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => !document.getElementById('docsSearchModal').classList.contains('docs-search-open')), true, 'Escape did not close search modal')
}

// --- Mobile drawer (390px < the 760 breakpoint) -------------------------------
{
  const page = await openPage(browser, { url: `${origin}/faq`, width: 390, height: 844 })
  const d = await page.evaluate(() => ({
    hamburgerShown: getComputedStyle(document.getElementById('docsSidebarToggle')).display !== 'none',
    navRight: Math.round(document.getElementById('docsNav').getBoundingClientRect().right),
  }))
  console.log('mobile initial:', JSON.stringify(d))
  expect(d.hamburgerShown, true, 'hamburger hidden on mobile')
  expect(d.navRight <= 1, true, 'nav not off-canvas on mobile (right=' + d.navRight + ')')

  await page.click('#docsSidebarToggle')
  await settle(page, 400) // the 0.25s drawer transform must finish before geometry
  const open = await page.evaluate(() => ({
    open: document.getElementById('docsNav').classList.contains('docs-nav-open'),
    overlayShown: getComputedStyle(document.getElementById('docsOverlay')).display !== 'none',
    expanded: document.getElementById('docsSidebarToggle').getAttribute('aria-expanded'),
    navLeft: Math.round(document.getElementById('docsNav').getBoundingClientRect().left),
    hasFaq: [...document.querySelectorAll('.docs-nav a')].some(a => a.textContent.trim() === 'FAQ'),
  }))
  console.log('mobile open:', JSON.stringify(open))
  expect(open.open, true, 'drawer did not open')
  expect(open.overlayShown, true, 'backdrop not visible')
  expect(open.expanded, 'true', 'aria-expanded not set')
  expect(open.navLeft >= 0 && open.navLeft < 390, true, 'drawer not on-screen (left=' + open.navLeft + ')')
  expect(open.hasFaq, true, 'nav items missing in drawer')
  // The drawer covers the left 260px of a 390px viewport — a plain element
  // click would land on the nav; the exposed content area is what closes it.
  await page.mouse.click(340, 500)
  expect(await page.evaluate(() => !document.getElementById('docsNav').classList.contains('docs-nav-open')), true, 'backdrop click did not close drawer')
}

await browser.close().catch(() => {})
server.close()
if (problems.length) { console.error('FAIL:', problems.join('; ')); process.exit(1) }
console.log('DOCS FRAME CHECKS: PASS')

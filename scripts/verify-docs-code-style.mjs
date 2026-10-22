// Docs content styling check: kramdown <main> output must carry the rules the
// prose relies on — content links use the accent token, inline code is a
// chip, fenced blocks get the dark slab + language badge + copy button, and
// Prism colors arrive from the CDN grammar. The layout fixture renders a
// representative main body (link + inline code + ts fence) instead of real
// page HTML, then asserts computed styles and the Prism token coloring.
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { launchBrowser, openPage, settle } from './lib/browser.mjs'

let html = readFileSync(new URL('../docs/_layouts/default.html', import.meta.url), 'utf8')
const NAV = [
  { title: 'Start', items: [{ title: 'Home', url: '/' }, { title: 'Getting Started', url: '/getting-started' }] },
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

for (const [from, to] of [
  ['{{ page.title }} | {{ site.title }}', 'FAQ | Gistory docs'],
  ["{{ '/assets/main.css' | relative_url }}", '/assets/main.css'],
  ["{{ '/pagefind/pagefind.css' | relative_url }}", '/pagefind.css'],
  ["{{ '/favicon.svg' | relative_url }}", '/favicon.svg'],
  ["{{ '/' | relative_url }}", '/'],
  ['{{ "pagefind/pagefind.js" | relative_url }}', '/pagefind.js'],
  ["{{ '/faq' | relative_url }}", '/faq'],
  ["{{ 'now' | date: '%Y' }}", String(new Date().getFullYear())],
]) html = html.split(from).join(to)
html = html.replace(/\{%\s*comment\s*%\}[\s\S]*?\{%\s*endcomment\s*%\}/g, '')
html = html.replace(/\{% for section in site\.data\.nav %\}[\s\S]*?\{% endfor %\}\s*<\/ul>\s*<\/div>\s*\{% endfor %\}/, navHtml)
html = html.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, '')
html = html.replace('<main class="docs-content"', `${projectBlock}\n<main class="docs-content"`)
// Representative content: prose link, inline mention, labeled ts fence,
// unlabeled fence (the heuristic tagger must still badge it).
const body = `
<p>See the <a href="/npm">npm page</a> for the engine, and <code>gistory-sync</code> inline.</p>
<pre><code class="language-ts">import { SyncAgent } from 'gistory-sync'
console.log('ok')</code></pre>
<pre><code>chainId: GS1-abc
tone: terse</code></pre>`

const mainStart = html.indexOf('<main class="docs-content"')
const mainEnd = html.indexOf('</main>')
html = html.slice(0, mainStart) + `<main class="docs-content" data-pagefind-body>${body}</main>` + html.slice(mainEnd + '</main>'.length)

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

const browser = await launchBrowser()
const problems = []
const page = await openPage(browser, { url: `${origin}/faq`, width: 1280, height: 900 })
// CDN assets need to actually load here, so give Prism a beat.
await settle(page, 1500)
const d = await page.evaluate(() => {
  const q = (s) => document.querySelector(s)
  const link = q('.docs-content a')
  const inline = q('.docs-content p > code')
  const pres = [...document.querySelectorAll('.docs-content pre')]
  const fence = pres.find((p) => p.querySelector('code.language-ts'))
  const unlabeled = pres.find((p) => !p.querySelector('code[class*="language-"]'))
  const prismToken = fence?.querySelector('.token')
  return {
    linkColor: link && getComputedStyle(link).color,
    inlineColor: inline && getComputedStyle(inline).color,
    inlineMono: inline && getComputedStyle(inline).fontFamily,
    fenceBg: fence && getComputedStyle(fence).backgroundColor,
    fenceBadge: fence?.getAttribute('data-language') || null,
    unlabeledBadge: unlabeled?.getAttribute('data-language') || null,
    copyBtn: !!fence?.querySelector('.docs-copy-btn'),
    prismApplied: !!prismToken,
    prismTokenColor: prismToken && getComputedStyle(prismToken).color,
    scriptsLoaded: Array.from(document.scripts).filter((s) => (s.src || '').includes('prismjs')).length,
  }
})
console.log(JSON.stringify(d, null, 2))

if (d.linkColor !== 'rgb(53, 82, 204)') problems.push(`content link color ${d.linkColor}, expected #3552cc`)
if (!/monospace/.test(d.inlineMono || '')) problems.push('inline code not monospaced')
if (d.fenceBg !== 'rgb(30, 30, 30)') problems.push(`fence bg ${d.fenceBg}, expected #1e1e1e`)
if (d.fenceBadge !== 'ts') problems.push(`labeled fence badge ${d.fenceBadge}, expected ts`)
if (d.unlabeledBadge !== 'yaml') problems.push(`unlabeled fence badge ${d.unlabeledBadge}, expected yaml (heuristic)`)
if (!d.copyBtn) problems.push('copy button missing on fenced block')
if (!d.prismApplied) problems.push('Prism token spans absent (highlighting not applied)')
if (!/^rgb/.test(d.prismTokenColor || '')) problems.push('Prism token color missing')
if (d.scriptsLoaded < 2) problems.push(`prism scripts not all injected (${d.scriptsLoaded})`)

await browser.close().catch(() => {})
server.close()
if (problems.length) { console.error('FAIL:', problems.join('; ')); process.exit(1) }
console.log('DOCS CODE/LINK STYLING: PASS')

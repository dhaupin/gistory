// Footer parity check: every surface renders the identical shared <Footer />.
// Covers the four footered surfaces — lander (/), terms (/terms),
// privacy (/privacy), and the app shell (#/).

import { resolveBaseUrl, launchBrowser, openPage } from './lib/browser.mjs'

const origin = await resolveBaseUrl(process.argv.slice(2))
const browser = await launchBrowser()

const surface = async (url) => {
  const page = await openPage(browser, { url })
  const info = await page.evaluate(() => {
    const f = [...document.querySelectorAll('footer')].at(-1)
    if (!f) return null
    const links = [...f.querySelectorAll('a')].map(a => ({
      text: a.textContent.trim(),
      href: a.getAttribute('href'),
      target: a.getAttribute('target') || '',
      rel: a.getAttribute('rel') || '',
    }))
    return { className: f.className, text: f.textContent.replace(/\s+/g, ' ').trim(), links }
  })
  return info
}

const results = {
  lander: await surface(`${origin}/`),
  terms: await surface(`${origin}/terms`),
  privacy: await surface(`${origin}/privacy`),
  app: await surface(`${origin}/#/`),
}

console.log(JSON.stringify(results, null, 2))

const problems = []
const signature = (f) => (f ? f.links.map(l => `${l.text}|${l.href}|${l.target}|${l.rel}`).join('\n') : 'MISSING')
const expected = signature(results.lander)
for (const [name, f] of Object.entries(results)) {
  if (!f) problems.push(`${name}: no footer rendered`)
  if (f && signature(f) !== expected) problems.push(`${name}: footer differs from lander`)
}
const credit = results.lander?.links?.find(l => l.text === 'Creadev.org')
if (!credit) problems.push('Creadev.org credit missing')
else {
  if (credit.target !== '_blank') problems.push('credit not target=_blank')
  if (/nofollow/i.test(credit.rel)) problems.push('credit is nofollow')
}
if (problems.length) {
  console.error('FAIL:', problems.join('; '))
  process.exit(1)
}
console.log('FOOTER PARITY: PASS (4 surfaces identical)')

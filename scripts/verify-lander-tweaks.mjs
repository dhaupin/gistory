// Throwaway verification (later pass can delete): lander CTA alignment + footer credit.
// Serves the same job as ui:audit for exactly the two changes in this pass:
//   1. .btn is inline-flex → the arrow icon's box is vertically centered on the label
//   2. lander footer has the dofollow, target=_blank "Made by Creadev.org" credit
import { resolveBaseUrl, launchBrowser, openPage } from './lib/browser.mjs'

const origin = await resolveBaseUrl(process.argv.slice(2))
const browser = await launchBrowser()
const page = await openPage(browser, { url: `${origin}/` })

const checks = await page.evaluate(() => {
  const out = {}

  // Footer credit: exists, points at credadev.org, new tab, dofollow (no nofollow).
  const credit = [...document.querySelectorAll('.lander-footer a')]
    .find(a => a.textContent.trim() === 'Creadev.org')
  out.creditPresent = !!credit
  out.creditHref = credit?.href || null
  out.creditTargetBlank = credit?.getAttribute('target') === '_blank'
  const rel = credit?.getAttribute('rel') || ''
  out.creditDofollow = !/nofollow/i.test(rel)
  out.creditRel = rel
  out.creditText = credit?.closest('span')?.textContent.replace(/\s+/g, ' ').trim() || null

  // Button geometry: the arrow icon must share the label's vertical center.
  const ctas = [...document.querySelectorAll('.lander-nav .lander-cta, .lander-final .btn-primary')]
  out.ctaCount = ctas.length
  out.ctas = ctas.map(btn => {
    const svg = btn.querySelector('svg')
    if (!svg) return { hasIcon: false }
    const b = btn.getBoundingClientRect()
    const s = svg.getBoundingClientRect()
    const display = getComputedStyle(btn).display
    const iconCenter = s.top + s.height / 2
    const tn = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim())
    let textRect = null
    if (tn) {
      const r = document.createRange()
      r.selectNodeContents(tn)
      textRect = r.getBoundingClientRect()
    }
    const textCenter = textRect ? textRect.top + textRect.height / 2 : null
    // Inside a flex parent (lander-nav-links / lander-actions) the computed
    // display of an inline-flex child is blockified to "flex" — accept both.
    return {
      hasIcon: true,
      display,
      iconVsTextDelta: textCenter == null ? null : +(iconCenter - textCenter).toFixed(2),
      iconVsBtnDelta: +((s.top + s.height / 2) - (b.top + b.height / 2)).toFixed(2),
    }
  })
  // Terms/privacy nav CTAs carry the same pattern (no arrow there, but flex must
  // not have broken their centered look): display check only.
  return out
})

console.log(JSON.stringify(checks, null, 2))

const problems = []
if (!checks.creditPresent) problems.push('Creadev.org credit link missing')
if (!checks.creditTargetBlank) problems.push('credit is not target=_blank')
if (!checks.creditDofollow) problems.push('credit is nofollow (must be dofollow)')
if (checks.creditHref && !/^https:\/\/creadev\.org\/?$/.test(checks.creditHref)) problems.push(`credit href unexpected: ${checks.creditHref}`)
for (const c of checks.ctas) {
  if (!['inline-flex', 'flex'].includes(c.display)) problems.push(`CTA display is ${c.display}, expected inline-flex (possibly blockified)`)
  if (c.iconVsTextDelta == null || Math.abs(c.iconVsTextDelta) > 1) problems.push(`icon/text center delta ${c.iconVsTextDelta}`)
}
if (problems.length) {
  console.error('FAIL:', problems.join('; '))
  process.exit(1)
}
console.log('LANDER CHECKS: PASS')

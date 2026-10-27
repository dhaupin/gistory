#!/usr/bin/env node
/**
 * web/scripts/repair-404.cjs - repair the 404.html head tags, then gate.
 *
 * UPSTREAM BUG (unfixed in prestruct 1.0.0 AND 1.1.0; live on
 * crashtest.creadev.org too - transcribed here with receipts, RETIRE the
 * script when a fixed prestruct pins): prestruct's engine generate404()
 * uses FUNCTION replacers that return STRINGS WITH $1/$2 IN THEM. A string
 * replacer expands those capture references; a function replacer inserts
 * them LITERALLY - so the whole description/og:title/twitter:title/
 * canonical tags are consumed and replaced by leaked text like
 * `$1The page you were looking for does not exist.$2  />`, which the
 * browser hoists into the body (visibly, above the styled page).
 *
 * This script rewrites the four broken spots deterministically from
 * ssr.config.js (siteName/siteUrl - no wall clock), then ASSERTS the repair
 * landed: any leftover `$1`/`$2`, a missing description, or a canonical not
 * on the configured origin exits 1 and litters the page intact for
 * inspection. `prestruct build` wires this after generation.
 */
const fs = require('fs')
const path = require('path')

const WEB = path.resolve(__dirname, '..')
const target = path.join(WEB, 'dist', '404.html')

async function main() {
  const ssr = (await import(path.join(WEB, 'ssr.config.js'))).default
  const siteName = String(ssr.siteName || 'Site')
  const siteUrl = String(ssr.siteUrl || '').replace(/\/+$/, '')
  let html = fs.readFileSync(target, 'utf8')

  // 1. description meta (whole tag was consumed; rebuild it whole)
  html = html.replace(
    /\$1The page you were looking for does not exist\.\$2 ?\/>/,
    () => '<meta name="description" content="The page you were looking for does not exist." />'
  )

  // 2-3. og:title then twitter:title, in generator order
  html = html.replace(
    /\$1Page Not Found \| .+?\$2 ?\/>/,
    () => `<meta property="og:title" content="Page Not Found | ${siteName}" />`
  )
  html = html.replace(
    /\$1Page Not Found \| .+?\$2 ?\/>/,
    () => `<meta name="twitter:title" content="Page Not Found | ${siteName}" />`
  )

  // 4. canonical (generator emits siteUrl + '/', the not-found root)
  html = html.replace(
    /\$1[^<]*?\$2 ?\/>/,
    () => `<link rel="canonical" href="${siteUrl}/" />`
  )

  fs.writeFileSync(target, html)

  // Assert-clean gate: every failure exits 1 WITH cause, per house law.
  const problems = []
  if (/\$[\{12]/.test(html)) problems.push('leaked $1/$2 literals still in 404.html')
  const descriptions = html.match(/<meta name="description" content="[^"]*" \/>/g) || []
  if (descriptions.length !== 1) {
    problems.push(`expected exactly 1 description meta in 404.html, found ${descriptions.length}`)
  }
  if (!html.includes(`<link rel="canonical" href="${siteUrl}/" />`)) {
    problems.push(`canonical link is not "${siteUrl}/"`)
  }
  if (!html.includes(`<meta property="og:title" content="Page Not Found | ${siteName}" />`)) {
    problems.push('og:title meta missing or off-spec')
  }
  if (!html.includes(`<meta name="twitter:title" content="Page Not Found | ${siteName}" />`)) {
    problems.push('twitter:title meta missing or off-spec')
  }

  if (problems.length) {
    console.error('REPAIR-404: FAIL')
    for (const p of problems) console.error(' ' + p)
    process.exit(1)
  }
  console.log('REPAIR-404: PASS (404.html head tags rebuilt + asserted clean)')
}

main().catch((err) => {
  console.error('REPAIR-404: FAIL (' + err.message + ')')
  process.exit(1)
})

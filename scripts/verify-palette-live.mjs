// Live palette check against the managed preview: the rendered lander CTA and
// body must carry the new tokens (deep indigo-blue primary, cool ink bg), and
// the app's dark theme class must equally resolve through CSS vars once
// body.dark lands. Reads computed styles only — no screenshots.
import { resolveBaseUrl, launchBrowser, openPage } from './lib/browser.mjs'

const origin = await resolveBaseUrl(process.argv.slice(2))
const browser = await launchBrowser()
const page = await openPage(browser, { url: `${origin}/`, width: 1280, height: 900 })

const d = await page.evaluate(() => ({
  cta: getComputedStyle(document.querySelector('.lander-actions .btn-primary')).backgroundColor,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  link: (document.querySelector('.lander-footer a') && getComputedStyle(document.querySelector('.lander-footer a')).color) || '',
  kicker: getComputedStyle(document.querySelector('.lander-kicker')).color,
}))
console.log(JSON.stringify(d, null, 2))

// rgb constants: --primary #3552cc -> rgb(53, 82, 204); --bg #f6f7f9 -> rgb(246, 247, 249);
// --text-dim #565b66 -> rgb(86, 91, 102)
const problems = []
if (d.cta !== 'rgb(53, 82, 204)') problems.push(`CTA fill ${d.cta}, expected #3552cc`)
if (d.bodyBg !== 'rgb(246, 247, 249)') problems.push(`body bg ${d.bodyBg}, expected #f6f7f9`)
if (d.kicker !== 'rgb(86, 91, 102)') problems.push(`kicker ${d.kicker}, expected #565b66`)
if (problems.length) { console.error('FAIL:', problems.join('; ')); process.exit(1) }
console.log('LIVE PALETTE: PASS (lander renders the new tokens)')
process.exit(0)

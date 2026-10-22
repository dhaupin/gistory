// Palette contrast receipt: WCAG 2.1 ratios for the token pairs the new
// palette must satisfy, both themes, app + docs + favicon. Deterministic
// (no browser). Uses a tiny { }-block scanner rather than one mega-regex —
// a single-regex token grab already misfired once on this file.
import { readFileSync } from 'node:fs'

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (fg, bg) => {
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a)
  return +(((l1 + 0.05) / (l2 + 0.05)).toFixed(2))
}

// Scan "selector { ... }" blocks with a real brace stack (nested @media rules
// exist in both files) and pull --token: value declarations out of the ones
// whose FULL selector matches the given prefix exactly.
function tokens(headerIs, rawCss) {
  // Comments are stripped first: headers otherwise swallow the star-banner
  // above a selector (the docs :root block sits behind one), and comment
  // bodies may contain braces of their own ({{name}} in the app's docs). */
  const cssText = rawCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = []
  const stack = []
  let next = ''
  for (const ch of cssText) {
    if (ch === '{') {
      stack.push({ header: next, buf: '' })
      next = ''
    } else if (ch === '}') {
      const f = stack.pop()
      if (f) blocks.push({ header: f.header.trim(), body: f.buf })
      if (stack.length === 0) next = ''
    } else if (stack.length) {
      stack[stack.length - 1].buf += ch
    } else {
      next += ch
    }
  }
  const wanted = blocks.filter((b) => headerIs(b.header))
  if (!wanted.length) throw new Error('no css block for the given header predicate')
  const out = {}
  for (const b of wanted) {
    for (const line of b.body.split('\n')) {
      const m = line.match(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})/)
      if (m) out[m[1]] = m[2]
    }
  }
  return out
}

const appRaw = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const docsRaw = readFileSync(new URL('../docs/assets/main.css', import.meta.url), 'utf8')

// Strict: ':root' means the light scope itself — both files carry a dark
// scope whose selector also contains ':root', which is exactly the
// over-match that misvalidated the docs' light pair the first run.
const appLight = tokens((h) => h === ':root', appRaw)
const appDark = tokens((h) => h === 'body.dark', appRaw)
const docsLight = tokens((h) => h === ':root', docsRaw)
const docsDark = tokens((h) => h.startsWith(":root[data-theme='dark']"), docsRaw)

const failures = []
const check = (label, fg, bg, min) => {
  const r = ratio(fg, bg)
  const ok = r >= min
  console.log(`${ok ? ' ok ' : 'FAIL'} ${label.padEnd(46)} ${fg} on ${bg}  ${r}:1 (min ${min})`)
  if (!ok) failures.push(label)
}

console.log('APP LIGHT (:root)')
check('text on bg', appLight.text, appLight.bg, 4.5)
check('text-dim on bg', appLight['text-dim'], appLight.bg, 4.5)
check('primary on bg (link accents)', appLight.primary, appLight.bg, 3)
check('primary-fg on primary fill (buttons)', appLight['primary-fg'], appLight.primary, 4.5)

console.log('APP DARK (body.dark — light fill + dark text pattern)')
check('text on bg', appDark.text, appDark.bg, 4.5)
check('text-dim on bg', appDark['text-dim'], appDark.bg, 4.5)
check('primary on bg (link accents)', appDark.primary, appDark.bg, 3)
check('primary-fg on primary fill', appDark['primary-fg'], appDark.primary, 4.5)

console.log('DOCS LIGHT (:root)')
check('text on bg', docsLight.text, docsLight.bg, 4.5)
check('text-dim on bg', docsLight['text-dim'], docsLight.bg, 4.5)
check('primary on bg (links — normal text here)', docsLight.primary, docsLight.bg, 4.5)

console.log('DOCS DARK ([data-theme=dark] — primary doubles as text colour)')
check('text on bg', docsDark.text, docsDark.bg, 4.5)
check('text-dim on bg', docsDark['text-dim'], docsDark.bg, 4.5)
check('primary on bg (links)', docsDark.primary, docsDark.bg, 4.5)

console.log('BRAND MARK (favicon tile + index.html theme-color)')
check('glyph on tile', '#f5f5f5', '#0c0d10', 3)
const fav = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const favTile = fav.match(/fill="(#[0-9a-fA-F]{6})"/)?.[1]
if (favTile !== '#0c0d10') failures.push(`favicon tile is ${favTile}, expected #0c0d10`)
const themecolor = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const themeMeta = themecolor.match(/theme-color" content="(#[0-9a-fA-F]{6})"/)?.[1]
if (themeMeta !== '#0c0d10') failures.push(`index.html theme-color is ${themeMeta}, expected #0c0d10`)
console.log(` ok favicon tile ${favTile} == theme-color ${themeMeta} == new ink`)

if (failures.length) {
  console.error('FAIL:', failures.join('; '))
  process.exit(1)
}
console.log('PALETTE CONTRAST: PASS')

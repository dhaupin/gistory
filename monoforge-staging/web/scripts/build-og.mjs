#!/usr/bin/env node
// build-og.mjs - render the Open Graph social cards (1200x630) for
//
//   web/public/og-image.png   the product site (ssr.config ogImage)
//   docs/og-image.png         the docs site (freestruct injects it)
//
// Pure prerender, stored as real PNGs in-tree: no runtime image service, and
// crawlers fetch a static file. Text renders through Liberation Sans
// (system TTFs) via @resvg/resvg-js, the family's proven card lane
// (poststruct web/scripts/build-og.mjs / gistory scripts/build-og.mjs).
//
//   node web/scripts/build-og.mjs     [run with FONTS_DIR set on machines
//                                      without /usr/share/fonts/truetype/liberation]
//
// Rerun after any brand change; CI does not run it (the PNGs are committed).

import { Resvg } from '@resvg/resvg-js'
import { writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

const FONTS = process.env.FONTS_DIR || '/usr/share/fonts/truetype/liberation'
const fontFiles = [
  'LiberationSans-Regular.ttf',
  'LiberationSans-Bold.ttf',
  'LiberationMono-Regular.ttf',
].map((f) => join(FONTS, f))
for (const f of fontFiles) {
  if (!existsSync(f)) {
    console.error(`build-og: missing font ${f}; set FONTS_DIR to a Liberation fonts dir`)
    process.exit(2)
  }
}

const W = 1200, H = 630

// The card shell: mint-library palette (ink #10131a .. #131a22), mint accent
// bar, one soft radial glow. Same structure as the poststruct/gistory shell.
const shell = (inner) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10131a"/>
      <stop offset="1" stop-color="#131a22"/>
    </linearGradient>
    <radialGradient id="glow" cx="82%" cy="18%" r="55%">
      <stop offset="0" stop-color="#7dd3a8" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#7dd3a8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="#7dd3a8"/>
  ${inner}
</svg>`

const siteCard = shell(`
  <text x="96" y="118" font-family="Liberation Mono" font-size="30" fill="#7dd3a8">stamp repos | doctor truth | lock bytes</text>
  <text x="92" y="258" font-family="Liberation Sans" font-weight="700" font-size="96" fill="#e7eaf1" letter-spacing="-2">monoforge</text>
  <text x="94" y="336" font-family="Liberation Sans" font-size="40" fill="#aeb7c2">Stamp fleet repos from proven template blocks.</text>
  <text x="94" y="392" font-family="Liberation Sans" font-size="40" fill="#aeb7c2">The doctor refuses unfilled slots; the lock verifies bytes.</text>
  <rect x="96" y="452" width="452" height="64" rx="12" fill="#131a22"/>
  <text x="120" y="494" font-family="Liberation Mono" font-size="30" fill="#7dd3a8">monoforge.creadev.org</text>
  <text x="96" y="576" font-family="Liberation Sans" font-size="26" fill="#717c88">npm i -g monoforge | Creadev.org</text>
  <text x="1104" y="576" text-anchor="end" font-family="Liberation Sans" font-size="26" fill="#4a545e">v0.9</text>
`)

const docsCard = shell(`
  <text x="96" y="128" font-family="Liberation Sans" font-size="34" fill="#717c88" letter-spacing="6">DOCS</text>
  <text x="92" y="268" font-family="Liberation Sans" font-weight="700" font-size="104" fill="#e7eaf1" letter-spacing="-2">Monoforge Docs</text>
  <text x="96" y="344" font-family="Liberation Sans" font-size="38" fill="#aeb7c2">The verb catalog, the stamp factory, and rig</text>
  <text x="96" y="396" font-family="Liberation Sans" font-size="38" fill="#aeb7c2">mechanics for the emitted repos.</text>
  <rect x="96" y="452" width="536" height="64" rx="12" fill="#131a22"/>
  <text x="120" y="494" font-family="Liberation Mono" font-size="30" fill="#7dd3a8">docs.creadev.org/monoforge</text>
  <text x="96" y="576" font-family="Liberation Sans" font-size="26" fill="#717c88">maintained by dhaupin | Creadev.org</text>
  <text x="1104" y="576" text-anchor="end" font-family="Liberation Sans" font-size="26" fill="#4a545e">v0.9</text>
`)

const opts = (svg) => ({
  svg,
  fitTo: { mode: 'width', value: W },
  font: { fontFiles, loadSystemFonts: false },
})

for (const [name, svg, out] of [
  ['site card', siteCard, 'web/public/og-image.png'],
  ['docs card', docsCard, 'docs/og-image.png'],
]) {
  const { svg: source, ...options } = opts(svg)
  const png = new Resvg(source, options).render().asPng()
  writeFileSync(join(root, out), png)
  console.log(`  ${out} ${name} (${Math.round(png.length / 1024)} KB)`)
}

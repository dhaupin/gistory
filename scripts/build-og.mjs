#!/usr/bin/env node
// build-og.mjs — render the Open Graph social cards (1200×630) for
//
//   docs/og-image.png           → the docs site (freestruct injects it)
//   public/og-image.png         → the product site (inject-brand points at it)
//   horcrux/prestruct-og-image.png → handoff asset for dhaupin/prestruct:
//     their site's og:image is an SVG (og-image.svg), which the big crawlers
//     (Facebook/LinkedIn/X) refuse to render — this PNG twin is regenerable
//     here until the prestruct repo adopts it and the file moves home.
//
// Pure prerender, stored as real PNGs in-tree: no runtime image service, and
// the relays/crawlers fetch a static file. Text renders through Liberation
// Sans (system TTFs) via @resvg/resvg-js — a devDependency — so the generator
// needs zero browser or fontconfig setup.
//
//   node scripts/build-og.mjs     (wired as `npm run build:og`)
//
// Rerun after any brand change; CI does not need it (the PNGs are committed).

import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const FONTS = '/usr/share/fonts/truetype/liberation'
const W = 1200, H = 630

const shell = (inner) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0d12"/>
      <stop offset="1" stop-color="#131722"/>
    </linearGradient>
    <radialGradient id="glow" cx="82%" cy="18%" r="55%">
      <stop offset="0" stop-color="#2563eb" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#2563eb" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="#2563eb"/>
  ${inner}
</svg>`

const docsCard = shell(`
  <text x="96" y="128" font-family="Liberation Sans" font-size="34" fill="#9aa0ac" letter-spacing="6">DOCS</text>
  <text x="92"  y="268" font-family="Liberation Sans" font-weight="700" font-size="104" fill="#f2f4f8" letter-spacing="-2">Gistory Docs</text>
  <text x="96"  y="344" font-family="Liberation Sans" font-size="38" fill="#c7cbd4">A personal prompt manager — variable filling,</text>
  <text x="96"  y="396" font-family="Liberation Sans" font-size="38" fill="#c7cbd4">tags and projects, end-to-end encrypted sync.</text>
  <rect x="96"  y="452" width="468" height="64" rx="12" fill="#1a2233"/>
  <text x="120" y="494" font-family="Liberation Mono" font-size="30" fill="#5b8bf4">docs.creadev.org/gistory</text>
  <text x="96"  y="576" font-family="Liberation Sans" font-size="26" fill="#81879a">maintained by dhaupin · Creadev.org</text>
  <text x="1104" y="576" text-anchor="end" font-family="Liberation Sans" font-size="26" fill="#3d4352">v1.0</text>
`)

const siteCard = shell(`
  <text x="96" y="118" font-family="Liberation Mono" font-size="30" fill="#5b8bf4">{'{{'}language{'}'} {'{{'}codebase{'}'} {'{{'}tone{'}'}</text>
  <text x="92"  y="252" font-family="Liberation Sans" font-weight="700" font-size="88" fill="#f2f4f8" letter-spacing="-2">Gistory</text>
  <text x="94"  y="330" font-family="Liberation Sans" font-size="44" fill="#c7cbd4">Every prompt you write,</text>
  <text x="94"  y="386" font-family="Liberation Sans" font-size="44" fill="#c7cbd4">kept, found, and <tspan font-style="italic" fill="#5b8bf4">filled in</tspan>.</text>
  <rect x="96" y="452" width="468" height="64" rx="12" fill="#1a2233"/>
  <text x="120" y="494" font-family="Liberation Mono" font-size="30" fill="#5b8bf4">gistory.creadev.org</text>
  <text x="96" y="576" font-family="Liberation Sans" font-size="26" fill="#81879a">No account required · works offline · your data stays yours</text>
  <text x="1104" y="576" text-anchor="end" font-family="Liberation Sans" font-size="26" fill="#3d4352">free</text>
`)

const prestructCard = shell(`
  <text x="92" y="150" font-family="Liberation Mono" font-size="28" fill="#5b8bf4">vite build | inject-brand | prerender</text>
  <text x="92" y="272" font-family="Liberation Sans" font-weight="700" font-size="100" fill="#f2f4f8" letter-spacing="-2">prestruct</text>
  <text x="94" y="348" font-family="Liberation Sans" font-size="40" fill="#c7cbd4">Build-time SEO prerender for Vite + React apps.</text>
  <text x="94" y="402" font-family="Liberation Sans" font-size="40" fill="#c7cbd4">Per-route static HTML, islands, schema.org, sitemap.</text>
  <rect x="96" y="456" width="540" height="64" rx="12" fill="#1a2233"/>
  <text x="120" y="498" font-family="Liberation Mono" font-size="30" fill="#5b8bf4">prestruct.creadev.org</text>
  <text x="96" y="576" font-family="Liberation Sans" font-size="26" fill="#81879a">npm i -D prestruct | Creadev.org</text>
  <text x="1104" y="576" text-anchor="end" font-family="Liberation Sans" font-size="26" fill="#3d4352">v1.1</text>
`)

for (const [svg, out] of [
  [docsCard, 'docs/og-image.png'],
  [siteCard, 'public/og-image.png'],
  [prestructCard, 'horcrux/prestruct-og-image.png'],
]) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles: [`${FONTS}/LiberationSans-Bold.ttf`, `${FONTS}/LiberationSans-Regular.ttf`, `${FONTS}/LiberationMono-Regular.ttf`], loadSystemFonts: false },
  }).render().asPng()
  writeFileSync(join(root, out), png)
  console.log(`  ${out} (${Math.round(png.length / 1024)} KB)`)
}

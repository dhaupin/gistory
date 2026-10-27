#!/usr/bin/env node
/**
 * scripts/adopt-icons.mjs - the family icon lane (gistory#17, eyestruct's
 * proven pipeline at dhaupin/eyestruct web/scripts/make-icons.mjs).
 *
 * Three stages, all reproducible, lockfile untouched:
 *   1. Sample + trace. The source art is binned by color class, and BOTH
 *      layers (ink band, accent) are potrace-traced from thresholded masks
 *      - no eyeballed vector anywhere. The accent classifier is the generic
 *      nearest-to-accent-color test (eyestruct used the blue-dominance
 *      special case; pass --accent to trace any palette).
 *   2. Author the seal. Everything traced is committed by THIS RUN as
 *      scripts/brand-mark.json (viewBox, ink/accent paths, mask bbox,
 *      transform) - an authored record downstream generators (og cards,
 *      badges, README art) can consume instead of a placeholder circle.
 *   3. Rasterize the set. The same SVG renders favicon-32, icon-192,
 *      icon-512, apple-touch-icon, and copies the tile into docs/ so the
 *      two faces stay byte-identical.
 *
 * Usage:
 *   node scripts/adopt-icons.mjs <source-art> [--ink HEX] [--accent HEX]
 *        [--tile HEX] [--public-dir DIR] [--docs-copy PATH] [--no-docs-copy]
 *        [--work N]
 *
 * Defaults come from this repo's package.json name (the family map below);
 * an unknown repo with no --public-dir is refused loudly, never guessed.
 * Helpers are build-local, like eyestruct's run - missing ones refuse with
 * exit 2 and the exact install line, never a stack trace.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

// Per-repo family map: probe (accent-distance threshold), ink, tile, public
// dir, and where the byte-identical docs copy lands (null = no copy).
const FAMILY = {
  'gistory-sync': { probe: 90, work: 2048, ink: '#f2f4f8', accent: '#4d81e7', tile: '#111216', pub: 'public', docsCopy: 'docs/favicon.svg' },
  monoforge: { probe: 60, ink: '#e7eaf1', accent: '#7dd3a8', tile: '#10131a', pub: 'web/public', docsCopy: 'docs/icon.svg' },
  poststruct: { probe: 60, ink: '#e6e8dd', accent: '#a8c000', tile: '#0c0f0a', pub: 'docs', docsCopy: null },
}

const die = (msg, code = 2) => { console.error(`adopt-icons[${code}]: ${msg}`); process.exit(code) }

const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
const art = argv.find((a) => !a.startsWith('--'))
if (!art) die('usage: node scripts/adopt-icons.mjs <source-art> [flags] - see the header')
const artPath = path.resolve(process.cwd(), art)
if (!fs.existsSync(artPath)) die(`source art not found: ${artPath}`)

const FAMILY_NAME = pkg.name in FAMILY ? pkg.name : (flag('--repo') || null)
const base = FAMILY_NAME ? FAMILY[FAMILY_NAME] : null
const ink = (flag('--ink') || base?.ink || '').toLowerCase()
const accent = (flag('--accent') || base?.accent || '').toLowerCase()
const tile = (flag('--tile') || base?.tile || '').toLowerCase()
const pubDir = flag('--public-dir') || base?.pub || null
const docsCopy = flag('--docs-copy') ?? (base?.docsCopy ? path.join(ROOT, base.docsCopy) : null)
const docsCopyArg = flag('--no-docs-copy') ? null : docsCopy
if (!ink || !accent || !tile) die(`colors missing - pass --ink/--accent/--tile or add this repo to FAMILY (name: "${pkg.name}")`)
if (!pubDir) die(`public dir unknown - pass --public-dir or add this repo to FAMILY (name: "${pkg.name}")`)

const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [ (n >> 16) & 255, (n >> 8) & 255, n & 255 ] }
const ACCENT_RGB = hex2rgb(accent)
const PROBE = Number(flag('--probe') ?? base?.probe ?? 60)

// Build-local helpers: --no-save, never in the lockfile (eyestruct receipt).
// CJS deps resolve through createRequire - the same posture eyestruct run.
let sharp, potrace, Resvg
try {
  const require = (await import('node:module')).createRequire(import.meta.url)
  sharp = require('sharp')
  potrace = require('potrace')
  Resvg = require('@resvg/resvg-js').Resvg
} catch { die('helpers missing - run: npm i --no-save sharp potrace @resvg/resvg-js (build-local, lockfile untouched)') }

const WORK = Number(flag('--work') ?? base?.work ?? 1024)
const { data, info } = await sharp(artPath).resize(WORK, WORK).raw().toBuffer({ resolveWithObject: true })
if (info.channels < 3) die('source art must be RGB/RGBA raster (jpg/png)')

const at = (x, y) => {
  const i = (y * info.width + x) * info.channels
  return [data[i], data[i + 1], data[i + 2]]
}
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
const inkClass = (p) => p[0] + p[1] + p[2] > 330           // light family ink
const accentClass = (p) => dist(p, ACCENT_RGB) <= PROBE    // nearest-accent test

const lum = Buffer.alloc(WORK * WORK)
const accents = []
for (let y = 0; y < WORK; y++) for (let x = 0; x < WORK; x++) {
  const p = at(x, y)
  if (accentClass(p)) accents.push(x, y)
  else if (inkClass(p)) lum[y * WORK + x] = 255
}

const trace = async (png) => new Promise((resolve, reject) => {
  potrace.trace(png, { threshold: 128, turdSize: 8, optTolerance: 0.4, blackOnWhite: true },
    (err, svg) => (err ? reject(err) : resolve(svg)))
})
// potrace follows BLACK-on-white bitmaps: the selected mask pixels must be
// black (0) and the rest white (255), or the trace comes out inverted and
// the accent becomes a giant block with the real shapes as holes.
const toPng = (mask) => sharp(mask, { raw: { width: WORK, height: WORK, channels: 1 } }).negate().png().toBuffer()
const pathsOf = (svg) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).filter((d) => d.length > 1)

const inkPaths = pathsOf(await trace(await toPng(lum)))
if (!inkPaths.length) die('the ink layer traced to nothing - the art may be too dark or empty at the ink threshold')

const accMask = new Uint8Array(WORK * WORK)
for (let i = 0; i < accents.length; i += 2) accMask[accents[i + 1] * WORK + accents[i]] = 255
const accentTracedList = accents.length ? pathsOf(await trace(await toPng(accMask))) : []

// box of a mask (for the authored record, same geometry as the trace)
const boxOf = (mask) => {
  let minX = WORK, maxX = -1, minY = WORK, maxY = -1
  for (let y = 0; y < WORK; y++) for (let x = 0; x < WORK; x++)
    if (mask[y * WORK + x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  return { minX, maxX, minY, maxY }
}
const inkBox = boxOf(lum)
const SCALE = 48 / Math.max(inkBox.maxX - inkBox.minX, inkBox.maxY - inkBox.minY)
const ox = 32 - ((inkBox.minX + inkBox.maxX) / 2) * SCALE
const oy = 32 - ((inkBox.minY + inkBox.maxY) / 2) * SCALE

const inkEls = inkPaths.map((d) => `<path d="${d}" fill="${ink}" fill-rule="evenodd"/>`).join('\n  ')
const accEls = accentTracedList.map((d) => `<path d="${d}" fill="${accent}" fill-rule="evenodd"/>`).join('\n  ')
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="${tile}"/>
<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${SCALE.toFixed(5)})">
  ${inkEls}${accEls ? '\n  ' + accEls : ''}
</g>
</svg>
`

const pubPath = path.resolve(ROOT, pubDir)
fs.mkdirSync(pubPath, { recursive: true })
fs.writeFileSync(path.join(pubPath, 'icon.svg'), iconSvg)
if (docsCopyArg) {
  fs.mkdirSync(path.dirname(docsCopyArg), { recursive: true })
  fs.writeFileSync(docsCopyArg, iconSvg)
}

const seal = path.join(HERE, 'brand-mark.json')
fs.writeFileSync(seal, JSON.stringify({
  viewBox: 64,
  paths: inkPaths,
  accent: { rgb: ACCENT_RGB, probe: PROBE, paths: accentTracedList },
  inkMask: inkBox,
  transform: { ox: +ox.toFixed(2), oy: +oy.toFixed(2), scale: +SCALE.toFixed(5) },
}, null, 2) + '\n')

const pngRoot = new Resvg(iconSvg, { fitTo: { mode: 'width', value: 512 } }).render().asPng()
for (const [name, size] of Object.entries({ 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180, 'favicon-32.png': 32 })) {
  await sharp(pngRoot).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(pubPath, name))
}
console.log('ink bbox:', inkBox)
console.log('paths:', inkPaths.length, 'ink /', accentTracedList.length, 'accent | scale', SCALE.toFixed(5), 'origin', ox.toFixed(1), oy.toFixed(1))
console.log('icon set written (svg + 4 png + brand-mark.json' + (docsCopyArg ? ' + docs copy' : '') + ')')

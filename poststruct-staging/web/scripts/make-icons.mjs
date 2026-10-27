#!/usr/bin/env node
/**
 * web/scripts/make-icons.mjs - the derived-asset lane for poststruct's icon
 * set, in the family shape (gistory#17 / eyestruct's make-icons): derived
 * icon bytes are GENERATED, never hand-drawn, and the committed source art
 * is the record a rerun consumes.
 *
 * poststruct's source art is the authored seal
 * web/public/icon.svg (the audit lens: a magnifier whose glass holds a
 * PASS check). There is no bitmap master to trace, so this lane is the
 * rasterizer half of adopt-icons: the same SVG renders favicon-32,
 * icon-192, icon-512, and apple-touch-icon from one buffer, and the byte
 * from ONE render lands in docs/assets/icon.svg so the docs site and the
 * product site wear the identical mark (the docs copy is what Jekyll
 * injects; see docs/freestruct.config.yml).
 *
 *   node web/scripts/make-icons.mjs       (parenthetical: run before a
 *                                          release-cut that touches art)
 *
 * Reruns are byte-deterministic (resvg, no wall clock); CI does not run
 * this script - the PNGs are committed artifacts.
 */
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

const svg = readFileSync(join(root, 'web/public/icon.svg'), 'utf8')

const render = (width) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()

const outputs = [
  ['favicon-32.png', 32],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]

for (const [name, width] of outputs) {
  const png = render(width)
  writeFileSync(join(root, 'web/public', name), png)
  console.log(`  web/public/${name} (${width}px, ${Math.round(png.length / 1024)} KB)`)
}

// The byte-identical docs face. The seal is the same source SVG; committing
// it as a copy (not a build output) keeps the docs site deployable without
// this script - mirrors monoforge's docs/icon.svg copy.
writeFileSync(join(root, 'docs/assets/icon.svg'), svg)
console.log('  docs/assets/icon.svg (byte-identical mark)')

#!/usr/bin/env node
/**
 * scripts/fix-logo-corners.mjs - the boundary-fidelity pre-pass for the
 * gistory logo before the icon lane eats it (gistory#17 lane, real-art run).
 *
 * Why this exists: public/gistory-logo.jpg is an app-tile illustration whose
 * dark superellipse shape does NOT touch the canvas at the corners/edges —
 * the art shows white outside the curve. The icon lane's ink test
 * (sum > 330, light pixels) would trace that white as part of the mark and
 * paint bogus white wedges at the icon's corners. Circular rings cannot
 * chase a superellipse: measured, the curve is ~340px inset at corners but
 * full-bleed at mid rows (JPEG 2048px source).
 *
 * Fix: follow the REAL boundary. For each row, find the leftmost/rightmost
 * dark pixel and repaint everything outside it (plus an 8px AA margin) with
 * the tile color; same per-column for top/bottom bands. The result is dark
 * everywhere outside the tile's own curve, so the lane's ink mask holds
 * exactly the artwork. Deterministic from the committed art: same input
 * bytes, same library version, same output.
 *
 * Usage: node scripts/fix-logo-corners.mjs [src] [dest]
 * Defaults: public/gistory-logo.jpg -> .cut-tmp/gistory-logo-fixed.png
 * (the intermediate is a disposable: the committed art + this committed
 * script are the source of truth; regenerate any time).
 */
import sharp from 'sharp'

const SRC = process.argv[2] || 'public/gistory-logo.jpg'
const DEST = process.argv[3] || '.cut-tmp/gistory-logo-fixed.png'
const TILE = [0x11, 0x12, 0x16] // #111216 - the art's own tile color
const K = 8                     // AA margin inside the boundary

const dark = (p) => p[0] < 70 && p[1] < 70 && p[2] < 80

sharp(SRC)
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    const { width, height, channels } = info
    const at = (x, y) => (y * width + x) * channels
    const paint = (x, y) => {
      const i = at(x, y)
      data[i] = TILE[0]; data[i + 1] = TILE[1]; data[i + 2] = TILE[2]
    }
    for (let y = 0; y < height; y++) {
      let l = null, r = null
      for (let x = 0; x < width; x++) { if (dark([data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]])) { l = x; break } }
      for (let x = width - 1; x >= 0; x--) { if (dark([data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]])) { r = x; break } }
      if (l === null) continue // fully light row: leave for the column pass
      for (let x = 0; x < Math.min(l + K, width); x++) paint(x, y)
      for (let x = Math.max(r - K + 1, 0); x < width; x++) paint(x, y)
    }
    for (let x = 0; x < width; x++) {
      let t = null, b = null
      for (let y = 0; y < height; y++) { if (dark([data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]])) { t = y; break } }
      for (let y = height - 1; y >= 0; y--) { if (dark([data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]])) { b = y; break } }
      if (t === null) continue
      for (let y = 0; y < Math.min(t + K, height); y++) paint(x, y)
      for (let y = Math.max(b - K + 1, 0); y < height; y++) paint(x, y)
    }
    return sharp(data, { raw: { width, height, channels } }).png().toFile(DEST)
  })
  .then(() => console.log(`boundary-fixed: ${DEST}`))

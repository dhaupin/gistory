#!/usr/bin/env bash
# mounts-adopt receipts: append the landing receipts to the three work logs.
# The blocks are append-only here (the byte-exact rehearsal lives in the
# harness transcript); a second run would duplicate, so this script is
# one-shot and retires with the pass.
set -euo pipefail
cat >> labs/TASKS.md << 'BLOCK'
- **Third pass, same day (the mounts' identity adopt, 2026-10-28):** the
  uploaded JPG logos land as bytes on origin (55b4b0b / 7f19a39); both
  mounts now carry the full adopt: traced icon set (svg + favicon-32 +
  icon-192 + icon-512 + apple-touch-icon) into web/public AND the
  poststruct docs face, the scripts/brand-mark.json authored seals, the
  rebuilt baked sites (poststruct site:build byte-identical HTML, monoforge
  web/dist mint re-bake), monoforge's og card lane retunes the placeholder
  card to the family word-mark shape (web + docs cards + the freestruct og
  block), and the poststruct docs layout grows its favicon links
  (baseurl-safe). Landing receipts: text via the commit lane, binaries via
  this one-shot; each blob-diffed against origin head after the run.
BLOCK
cat >> monoforge-staging/labs/TASKS.md << 'BLOCK'

## 2026-10-28 - the logo adopts + the og card lane (identity fills in)

- web/public/monoforge-logo.jpg (the owner-uploaded art) adopts through
  `npm run icons:adopt`: potrace-traced ink + accent layers, the
  scripts/brand-mark.json authored seal, the full 5-face raster set
  (icon.svg, favicon-32, icon-192, icon-512, apple-touch-icon) into
  web/public, and the byte-identical docs copy at docs/icon.svg
  (documentation baseurl lays it out at /monoforge/icon.svg).
- web/scripts/build-og.mjs: the family og card lane (the poststruct
  shape, retuned to the mint library palette) - the placeholder
  square-art card retires for the word-mark cards: "stamp repos |
  doctor truth | lock bytes" eyebrow, four-line identity block, chip
  urls. web/public/og-image.png + docs/og-image.png are committed
  bytes; docs/freestruct.config.yml gains the og block so the docs
  page head carries the card like poststruct does.
- web/index.html: the leftover "Generate from favicon.io" template
  prose retires; the head carries the real-identity comment form.
BLOCK
cat >> poststruct-staging/labs/TASKS.md << 'BLOCK'

## 2026-10-28 - the logo adopts (icons set + docs favicon wiring + brand seal)

- web/public/poststruct-logo.jpg (the owner-uploaded art) adopts through
  `npm run icons:adopt`: potrace-traced ink + accent layers, the
  scripts/brand-mark.json authored seal, and the 5-face raster set
  (icon.svg, favicon-32, icon-192, icon-512, apple-touch-icon) written
  INTO BOTH FACES - docs/ is the family-default public dir, and a
  second --public-dir web/public pass re-derives the same bytes
  deterministically (cmp-proven identical across the two passes).
- docs/_layouts/default.html grows the favicon links (icon.svg +
  favicon-32 + apple-touch-icon through relative_url - the docs live
  under baseurl /poststruct); the stale unreferenced
  docs/assets/icon.svg placeholder retires in the same pass.
- Dogfood: rebuild (site:build) is byte-identical on the HTML (the
  prerender cache held) with only the identity assets refreshed; the
  audit's og-dims/JSON-LD WARN class is the accepted contract state
  (same WARNs on origin; exit 0).
BLOCK
echo "receipts appended"

# poststruct 0.9.0

**Audit what shipped.** A zero-dependency CLI that walks a directory of baked HTML (any generator's output) and verifies it against a head/site contract. FAIL findings exit non-zero so CI gates regressions.

Where the family sits: prestruct puts SEO in before the build (source-time), freestruct injects after an SSG, and poststruct checks the baked artifact that both of them (and everyone else) actually shipped.

Core law: **files on disk only.** No SPA runtime, no scraping, no source linting. The fence is timeless by construction.

## What this version audits

`npx poststruct audit [dir]` (default `dist`):

```bash
npx poststruct audit dist/          # human output, one line per finding
npx poststruct audit dist/ --json   # {schema: 1, counts, findings}
```

- **head module** (per page): title present + length band, description present + band, canonical present + absolute, OG(7) + Twitter(4) sets, og:image raster-format (an SVG og:image FAILs: most social scrapers cannot render it), og:image dims, JSON-LD parses + LocalBusiness recommended fields, h1 sanity. A 404 keeps only its noindex contract.
- **site module**: sitemap.xml exists + has <loc> entries + lastmod, and robots.txt points at the sitemap with `Sitemap:`.

Exit codes: `0` clean or warns-only, `1` any FAIL, `2` usage/environment error (no directory to walk). Planned modules (links, i18n, a11y-lite, language, feeds) are tracked in `docs/checks.md` and land per the PRD.

## Fixtures (the negative test is permanent)

```bash
npm test
```

The corpus is `test/fixtures/good` (must audit clean) and `test/fixtures/bad` (must hit EXACTLY the expected FAIL ids, warns included). Deleting or degrading a check breaks the test - that is the point.

## Packs (realized)

The `/packs` mount follows the shared [packstruct](https://github.com/dhaupin/packstruct) SPEC v1, check profile: `packs/public/<name>/pack.json` + entry exporting `{ checks: [...] }`, ids namespaced by pack slug, and the config `packs:` entry as the arm. The loader is realized here: `packs/public/eyes-reference/` ships the reference-shape pack and `packs/public/eyestruct-shapes/` ships the canon-audit pack over an eyestruct-shaped lab tree (seven pure file checks, the `EYESTRUCT_TREE` target knob, one BOUNDED docket when no tree is present, never a fake pass), both against the committed `packs/eye-ledger.json` verdict baseline (8 rows). The pack lane runs as the discoverable wrapper verb `poststruct lint-packs [--deep]` over the repo's own packstruct install (exact 1.0.0 devDependency pin), and the CI battery (`npm run check`) carries the deep lint plus `npm run conform:packs`, which proves the loader itself conforms. Future shape packs keep landing per the PRD.

## Release ladder

0.9.x is the manual `npm publish` ladder; `publish.yml` refuses 0.x at the gate. 1.0.0 flips OIDC trusted publishing (`id-token: write`). See [DEPLOY.md](DEPLOY.md).

## Landing & docs

- Landing: poststruct.creadev.org - Cloudflare Pages built from `web/` (Vite + React, prerendered by the prestruct build). `npm run site:build` runs the web build + the 404 head repair gate and copies `web/dist` into the root `dist/` that `wrangler.toml` pins; `functions/api/health.js` ships the `/api/health` canary. The baked tree is poststruct's own first audit target: `npx poststruct audit dist/` gates clean on it (0 FAIL).
- Identity: `web/public/icon.svg` is the authored seal (the audit lens), rendered to the favicon set + OG cards by `web/scripts/make-icons.mjs` and `web/scripts/build-og.mjs` - generated assets, never hand-drawn, the family's generated asset lane.
- Docs: `docs.creadev.org/poststruct` - Jekyll + Pagefind + Freestruct via GitHub Actions (`.github/workflows/docs.yml`), with the getting started and CLI reference pages in the nav.

## Related

- [prestruct](https://github.com/dhaupin/prestruct) - source-time audit, my upstream sibling
- [freestruct](https://github.com/dhaupin/freestruct) - post-SSG injection, my other sibling
- [crashtest](https://github.com/dhaupin/crashtest) - transport-level adversarial testing
- [packstruct](https://github.com/dhaupin/packstruct) - the shared packs spec (pinned 1.0.0 as an exact devDependency here; `npm run conform:packs` proves the pack loader itself conforms - 8/8 audit cases honored)
- **The workshop** → [Creadev.org](https://creadev.org) (poststruct is made by Rook @ Creadev.org — the same home as the landing and docs surfaces above)

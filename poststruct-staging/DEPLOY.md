# DEPLOY.md - poststruct release runbook

poststruct is an npm tool. There is no server. "Deploy" = publish. The model
follows [prestruct](https://github.com/dhaupin/prestruct) exactly:

1. **0.9.x is manual.** While the major is 0.x, publishing is done by a human
   with `npm publish`. CI blocks `workflow_dispatch`/`tag` publishing for 0.x
   versions - the publish workflow REFUSES 0.x versions. This is the proven
   convention.

## Ladder to automated publishes

1. Bump `package.json` + `CHANGELOG.md` to 1.0.0 (Unreleased → Dated).
2. Run `npm test` + `npm pack --dry-run` locally. Tag `v1.0.0` and push.
3. `publish.yml` (`.github/workflows/publish.yml`):
   - Triggers: `push: tags: [ 'v*' ]` + a manually-runnable `workflow_dispatch`.
   - Idempotent: skips when `npm view poststruct@<version>` says it's already
     out - refuses 0.x. Runs `npm ci` + `npm test`; publishes via
     (`id-token: write`, so it is provenance-attested).
4. Tool updates thereafter are just: change files, bump version, tag vX.Y.Z.

## npm prep

- Work from a machine with npm credentials (or exchange for a 0.9.0 manual
  publish): manual publishes run `npm publish`.
- The npm registry name **poststruct** is checked in CI with `npm view` on the
  version before publish - if it's taken, the release fails instead of
  clobbering someone else's name.

## Key facts baked in

- `package.json`: `"files"` whitelists what actually goes in the tarball
  (`src/`, `bin/`, `LICENSE`).
- `engines.node: ">=20"` runtime floor.
- Tagged CR = the docs/CHANGELOG npm convention stays exact.

## Landing site (Cloudflare Pages, poststruct.creadev.org)

- The landing site deploys as a **Cloudflare Pages project** named
  `poststruct` with the production custom domain `poststruct.creadev.org`.
- `wrangler.toml` pins the contract: `pages_build_output_dir = "dist"`:
  whatever builds the site must emit to `dist/` and exit; serving is
  Pages' job.
- LANDED: the landing is the `web/` tree (Vite + React, prerendered by the
  prestruct build). `npm run site:build` installs/builds `web/`, runs
  `prestruct build` + the 404 head repair gate, and copies `web/dist` to the
  root `dist/` the contract pins. Verified locally: 3/3 routes prerendered,
  sitemap emitted, repair gate PASS, and poststruct's own audit against the
  baked tree gates clean (0 FAIL; the 6 residual WARNs are the inject-brand
  og:image dims + JSON-LD absences - see the carry issue filed for prestruct).
  Pages build command: `npm run site:build`; build output directory: `dist`.
  `functions/api/health.js` is ready for the first deploy.
- Identity assets are generated, never hand-drawn (the family lane):
  `web/scripts/make-icons.mjs` renders the authored seal (`web/public/icon.svg`,
  the audit lens) to favicon-32/icon-192/icon-512/apple-touch-icon and the
  byte-identical `docs/assets/icon.svg`; `web/scripts/build-og.mjs` renders
  the OG cards (`web/public/og-image.png` + `docs/og-image.png`, Liberation
  Sans via resvg; set `FONTS_DIR` on machines without
  `/usr/share/fonts/truetype/liberation`). Reruns are byte-deterministic;
  CI does not run either (the PNGs are committed).
- **Functions:** `functions/api/health.js` is the living examples banner:
  `GET /api/health` returns honest JSON. Pages Functions are the only
  worker surface this repo runs; anything heavier belongs in the CLI, not
  the landing.
- DNS: apex CNAME to `creadev.org`'s fleet shorthand (Rook owns the CF
  zone): `poststruct.creadev.org` → the Pages project via custom domain
  binding.

## Docs site (GitHub Pages via Actions, docs.creadev.org/poststruct)

- Pipeline: `.github/workflows/docs.yml`: docs-truth gates first
  (ported house checkers: frontmatter 5-field law, resolvable links,
  style law incl. no-dashes-in-prose, English-only prose), then
  Jekyll (`docs/`), then `freestruct --strict` (post-render SEO layer,
  basePath-aware: /poststruct; broken links fail the build), then
  `pagefind --site _site` from the proven musl tarball (the npx path
  DIED in CI once - measured in dhaupin/freestruct's docs workflow),
  then the official Pages artifact deploy (upload-pages-artifact →
  deploy-pages, `id-token: write`). Verified against the house
  examples: dhaupin/prestruct (CF/docs shape) + dhaupin/freestruct
  (freestruct + pagefind pipeline); node stages were executed locally
  with real versions (freestruct 1.0.0, pagefind 1.5.2).
- `docs/freestruct.config.yml` pins the URL math:
  site.url + basePath => https://docs.creadev.org/poststruct/<page>.
- First run needs the Pages source flipped to "GitHub Actions" in repo
  settings (Settings → Pages); the workflow triggers on docs/--shaped
  pushes and manual dispatch.

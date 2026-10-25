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

- The landing site (prestruct `/example`-built, rebranded; see the PRD's
  site plan) deploys as a **Cloudflare Pages project** named `poststruct`
  with the production custom domain `poststruct.creadev.org`.
- HONEST STATUS: the landing build has not landed yet. `wrangler.toml` pins
  `dist/` but no build emits it until the prestruct `/example` rebrand is
  created: do not wire the Pages project/DNS before that build exists.
  `functions/api/health.js` is ready for the first deploy.
- `wrangler.toml` pins the contract: `pages_build_output_dir = "dist"`:
  whatever builds the site must emit to `dist/` and exit; serving is Pages'
  job.
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

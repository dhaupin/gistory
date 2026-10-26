# DEPLOY.md - __NAME__ release runbook

__NAME__ is an npm tool. Deploy = publish. The ladder follows the proven
fleet convention:

1. **0.9.x is manual.** While the major is 0.x, publish by hand
   (`npm publish`). The workflow refuses 0.x versions.

## Release atomicity (ruled 2026-10-24 on crashtest#20)

- CHANGELOG `[Unreleased]` flips to the dated version header in the same
  commit that carries the tag.
- Never mint a patch version for a docs-only change. Prefer retagging
  that same commit.

## Ladder to automated publishes

1. Bump `package.json` + `CHANGELOG.md` to 1.0.0 (Unreleased, then dated).
2. `npm test` + `npm pack --dry-run` locally. Tag `v1.0.0`, push.
3. publish.yml: tags `v*` + `workflow_dispatch`, idempotent
   already-published check (`npm view __NAME__@<version>`), `npm test`,
   provenance publish (`id-token: write`). Refuses 0.x refs.

## Landing site (Cloudflare Pages, __SITE_URL__)

- `wrangler.toml` pins `pages_build_output_dir = "FORGE-TODO:dist-or-site"`:
  whatever builds the site must emit there. (The author wires the real
  build; Forge doctor flags this slot until it is filled.)
- `functions/api/health.js`: `GET /api/health` canary ships ready.

## Docs site (GitHub Pages via Actions, __DOCS_URL__)

- `.github/workflows/docs.yml`: docs-truth gates first (the four ported
  checkers), Jekyll, `freestruct --strict` (basePath-aware), `pagefind`
  from the proven musl tarball, official artifact deploy. First run needs
  the Pages source set to "GitHub Actions" in repo settings.

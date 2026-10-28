# Changelog

All notable changes to poststruct will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- The scheduled `linkcheck.yml` workflow: it invoked a `linkcheck` CLI mode that does not exist in 0.9.0, so the weekly lane would have gone red on the first push. The weekly external-link gate returns with the links module + `--check-external` (M1, tracked in labs/TASKS.md).

## [0.9.0] - 2026-10-23

### Added
- Audit engine over baked HTML (`src/core.mjs` walk + page model): the **head** module (title present + length band, description present + band, canonical present + absolute, OG(7) + Twitter(4) sets, og:image raster-format FAIL on SVG + dims warn, JSON-LD parse + LocalBusiness recommended fields, h1 sanity, the 404 noindex contract) and the **site** module (sitemap.xml existence + loc entries + lastmod, robots.txt `Sitemap:` pointer).
- Findings schema `{page, id, level, message}` with `{counts, findings}` under `--json`; exit contract: 0 clean/warns, 1 any FAIL, 2 usage error.
- CLI: `poststruct audit [dir] [--json]` (`bin/cli.mjs`).
- Self-audit fixture engine: `test/fixtures/good` must audit clean, `test/fixtures/bad` must hit exactly the expected FAIL ids (+ warn list); `test/run.mjs` asserts the exact sets (`npm test`).
- `package.json` ships `bin/`, `src/`, `LICENSE` in the tarball.

### Notes
- 0.9.x is the manual npm release ladder; `publish.yml` refuses 0.x versions at the gate. 1.0.0 flips OIDC trusted publishing (`id-token: write` provenance).
- Docs run on Jekyll + Pagefind + Freestruct at `docs.creadev.org/poststruct` via `.github/workflows/docs.yml`. Landing host is `poststruct.creadev.org` (Cloudflare Pages): the landing is shipped and live (web/ prerendered, `npm run site:build` bakes it), and its output is the first dogfood target (`npx poststruct audit dist/` gates clean on it).

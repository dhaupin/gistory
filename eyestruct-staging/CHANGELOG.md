# Changelog

All notable changes to eyestruct will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- `look`, `diff`, and `walk` light up behind the pinned browser capture
  (`engine.capture` wiring) - the honest-refusal surfaces already shipped
  flip to live reads.
- `packs/eye-shapes` self pack + the crashtest harness plan, wired to
  `packstruct lint:packs` (the family check-profile contract).
- MCP stdio surface over the same call functions as bin dispatch.

## [0.9.0] - 2026-10-26

The first cut, grown in the gistory staging ecosystem end to end
(eyestruct-staging mount, its own nested git history, tar-ferry
provenance). Receipts: `labs/TASKS.md` in-repo; the vaulted PRD rides
the family horcrux.

### Added
- CLI spine per the PRD (`labs/prd-eyes.md`): `bin/eyestruct.js` dispatch
  over `lib/` with the exit contract 0-1-2 and a named code on every
  refusal - diagnostics carry reasons, never bare crashes ("NO
  bare/errors").
- `manifest`: pin + route matrix via the strict hand-editable subset
  parser; `ledger`: append-only and atomic, corruption refuses loudly;
  `gate`: crashledger semantics (unexplained drift exits 1, capability
  trouble exits 2).
- `adopt`: note required at write time; a local adopt is an unratified
  proposal - canon is CI-cut.
- `look`, `diff`, `walk`: engine seam declared; refuses honestly until
  the pinned browser image exists (never fake-passes).
- `raster`: strict parse + render + byte sanity.
- `mcp`: post-MVP surface; honest refusal until it lands.
- 13/13 smoke tests; `lint:docs` 5/5 gates.
- Web landing rebrand (12 fields: ssr identity block, Home copy + CTAs,
  nav brand/links/badge, footer, manifest, theme key both ends, package
  name) - `prestruct build` green with zero flowforge strings in dist,
  `inject-brand` populating the eyestruct identity.
- Own CI: `.github/workflows/test.yml` (node 20, `npm ci` hermetic,
  `npm test` + `npm run check`) - the first standalone push after the
  move is gated by this repo's own battery.
- docs/ on the family Jekyll + Freestruct rig: identity pages in hyphen
  voice (the PRD keeps em-dash voice at `labs/`), `docs/verbs.md` usage
  lines matching bin dispatch exactly, plus the frontmatter/style/language
  gates.
- `package.json` + `package-lock.json` agree on the eyestruct name; the
  lock landed byte-exact (origin blob 3518984fe... == disk).

### Notes
- 0.9.x is the manual release ladder at move time; the family publish
  workflow refuses 0.x tags, and 1.0.0 flips trusted publishing.
- docs voice law survived the write: locations and surfaces state facts
  in one voice per surface (em-dash PRD, hyphen docs).

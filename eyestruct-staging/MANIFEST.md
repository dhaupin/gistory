# eyestruct MANIFEST - the receipts

Every file here is either extracted from the flowforge rig (see the rig's
MANIFEST for its own extraction receipts), copied from the magpie staging
stone, or written new for this repo. Row-per-file provenance, so rig bumps
are deliberate reviews.

## From the flowforge rig (dhaupin/flowforge @ 91e52e0)

| file | receipt |
|---|---|
| `web/` | the prestruct landing shell, untouched engine files; identity rows are eyestruct's data |
| `docs/` | the rig Jekyll layout + nav starter + checker gates |
| `scripts/check-docs-*.cjs`, `check-fiction-signatures.cjs`, `check-jekyll-filters.cjs` | rig checker gates; `check-docs-links.cjs` SITE_PREFIX mirrored to `/eyestruct` (and docs/_config.yml baseurl) |
| `packs/README.md`, `LICENSE` | rig starters |

## From the magpie staging stone (gistory)

| file | receipt |
|---|---|
| `labs/prd-eyes.md` | the canonical PRD (the stone's `labs/prd-eyes.md` block, verified byte-identical at cut time) |
| `horcrux/magpie-p_mirror-eyes-2026.svg` | the transfer stone itself (rasterizes; refactor-of-record for the seed brain) |
| `models/private/magpie/*.md` | the seed brain (never shipped in the package) |

## New for eyestruct (this scaffold pass)

| file | receipt |
|---|---|
| `bin/eyestruct.js` + `lib/*.js` | the CLI spine per the PRD: exit contract 0-1-2, named reason-codes, process-per-look, crashledger semantics for the gate |
| `tests/smoke.test.js` | 13 behavior tests over the browserless spine (exit codes, ledger rules, gate rules, raster honesty) |
| `docs/index.md`, `docs/_data/nav.yml` | the docs identity (PRD deliberately stays unstyled at labs/: PRD voice is em-dash, docs voice is hyphen-only) |

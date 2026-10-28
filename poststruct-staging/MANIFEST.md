# poststruct MANIFEST - the receipts

Every file here is either cut from the poststruct prd horcrux stone (the
engine proper), copied from the flowforge rig shell (via eyestruct, whose
rig MANIFEST carries its own extraction receipts), adopted from the family
lanes, or written new for this mount. Row-per-file provenance, so rig bumps
are deliberate reviews. (gistory#23 item 2: poststruct's provenance receipt,
same shape as monoforge's.)

## From the prd horcrux (upstream line, the cut lane)

| file | receipt |
|---|---|
| `bin/cli.mjs`, `src/*.mjs` | the engine proper: runAudit (head + site checks), the verb dispatch (audit / lint-packs), zero-dep Node ESM |
| `test/run.mjs`, `test/shapes-run.mjs` | the node:test spine + the adversarial shapes campaign (baseline-gated) |
| `packs/` | the committed pack verdicts (REFUSED / BOUNDED / EXPLOITED) and the eye-ledger |
| `package.json`, `LICENSE`, `README.md`, `CHANGELOG.md`, `DEPLOY.md`, `AGENTS.md` | the package records |
| `docs/` | the product docs tree, jekyll + freestruct + pagefind (frontmatter normalized to the rig contract) |

## From the flowforge rig shell (via eyestruct)

| file | receipt |
|---|---|
| `web/` | the prestruct landing shell, untouched engine files; identity rows are poststruct's data (ssr.config, pages, icons, og-image) |
| `docs/_layouts/default.html`, `docs/_config.yml`, `docs/_data/` | rig docs engine (jekyll defaults + baseurl math); poststruct brand as data |
| `scripts/check-docs-frontmatter.cjs`, `check-docs-links.cjs`, `check-docs-style.cjs` | rig checker gates |

## Family-adopted lanes

| file | receipt |
|---|---|
| `scripts/check-language.cjs` | the English-only prose gate, byte-identical across the mounts |
| `scripts/check-fiction-signatures.cjs` | the flowforge rig fiction scanner, adopted at gistory#23 (generic seeded signatures; house law: a fiction caught twice becomes a gate) |
| `scripts/check-jekyll-filters.cjs` | the two-argument Liquid filter trap gate (crashtest#23 class; packstruct's live example is cited in the header) |
| `scripts/ship-from-download.cjs` | the eyestruct phone publish lane, byte-identical copy (zero repo imports), behavior test at `test/ship-from-download.test.cjs` |
| `scripts/adopt-icons.mjs` | the family icon lane (gistory#17/eyestruct's proven pipeline), poststruct FAMILY defaults (olive, docs face) |
| `scripts/brand-mark.json` | the authored seal, written by the adopt run from the owner's uploaded art (7f19a39) |
| `web/scripts/build-og.mjs` + the og PNGs | the family og card lane (gistory scripts/build-og.mjs shape), Liberation Sans via resvg |

## New for this mount

| file | receipt |
|---|---|
| `MANIFEST.md` | this file (gistory#23 item 2) |
| `.github/workflows/docs.yml` + `test.yml` | the mount's own lanes: docs build with the full rig-pass gate chain, test battery one verb (`npm run check`) |
| `horcrux/` | the lock stones: poststruct-0.9.0-rig-lock.tar.gz + the identity art (+ poststruct-p_*.svg stamps) |
| `web/src/pages/Terms.jsx`, `Privacy.jsx` | the struct-family canonical terms/privacy form (poststruct bakes it, audited 2026-10-27) |

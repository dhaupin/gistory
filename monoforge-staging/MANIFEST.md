# monoforge MANIFEST - the receipts

Every file here is either extracted from the factory's own 0.9.0 lock
archive (the tarball-first ferry), copied from the flowforge rig (see the
rig's MANIFEST for its own extraction receipts), or written new for this
mount pass. Row-per-file provenance, so rig bumps are deliberate reviews.

## From the 0.9.0 lock archive (upstream lineage f8e45fb)

| file | receipt |
|---|---|
| `bin/forge.mjs`, `src/*.mjs` | the factory proper: new / doctor / cut / lock, zero-dep Node ESM |
| `templates/` | the stamp blocks (extracted from poststruct + packstruct as of 2026-10-24) |
| `test/run.mjs` | the negative test: bad config refused, stray dir refused, unfilled doctor FAIL, refilled doctor PASS |
| `package.json`, `LICENSE`, `README.md`, `CHANGELOG.md`, `DEPLOY.md`, `AGENTS.md` | the 0.9.0 package records |
| `site/index.html` | the 0.9.0 static landing (retired in the rig pass below; the landing is `web/` now) |
| `scripts/check-docs-*.cjs`, `build-docs.sh`, `docs/` | the 0.9.0 docs lane (earlier gate generation; superseded in the rig pass below) |

## From the flowforge rig (dhaupin/flowforge @ 91e52e0, via eyestruct)

| file | receipt |
|---|---|
| `web/` | the prestruct landing shell, untouched engine files; identity rows are monoforge's data (ssr.config, pages, icons, og-image) |
| `docs/_layouts/default.html` | the rig docs engine (pagefind modal search, sidebar nav from _data, theme switch); monoforge brand as data |
| `docs/_data/nav.yml`, `docs/icon.svg` | rig nav source + the monoforge mark |
| `scripts/check-docs-frontmatter.cjs`, `check-docs-style.cjs`, `check-fiction-signatures.cjs`, `check-jekyll-filters.cjs` | rig checker gates (this mount's earlier `pass 153` generation retired) |
| `scripts/check-docs-links.cjs` | rig link checker; `SITE_PREFIX` mirrored to `/monoforge` |

## New for this mount (the rig pass, 2026-10-27)

| file | receipt |
|---|---|
| `MANIFEST.md` | this file |
| `.github/workflows/test.yml` | the mount's own battery (zero-dep: no install step; self-test + docs gates + language gate) |
| `web/public/*.png` + `icon.svg` | the monoforge mark, rendered with the family og tooling (@resvg/resvg-js, text-free like the sibling mounts) |
| `docs` frontmatter normalized | rig contract: baseurl-relative permalinks, layout + title + description; no leading slash except the reserved home `/` |
| `docs/index.md`, `docs/verbs.md`, `docs/packs.md`, `docs/search.md` | bodies kept; frontmatter + the home page's usage block made truthful to the CLI |

# AGENTS.md - poststruct

## Identity
- **Name:** poststruct (bake auditor)
- **Species:** third leg of the struct family: prestruct (source) -> your build -> poststruct (baked)
- **Repo:** dhaupin/poststruct
- **Core law:** the core enforces the physics (head hygiene, site contract); packs enforce the vibes (language, tone, client shapes)
- Complements, never replaces: prestruct audits source; poststruct audits what actually shipped.

## Relationship rules
- **poststruct audits baked HTML.** It never edits source or config files.
- Its findings are terminal - the facts prestruct's source-side audits cannot see (compression changes, template leftovers, head damage).
- In CI, poststruct gates on exit code; findings block the deploy, not open a PR thread.

## Mechanical conventions (this repo)
- Layout: `src/core.mjs` (walk + page model), `src/checks/head.mjs` + `src/checks/site.mjs` (the check modules), `src/index.mjs` (`runAudit`, the programmatic entry), `bin/cli.mjs` (CLI: two verbs, `audit [dir] [--json] [--module x]` and the pack lint lane `lint-packs [--deep] [--json] [--against <lib>] [dir]`). Keep `package.json` `exports`/`bin` pointing at both entry files.
- **Fixtures are law.** `test/fixtures/good/` must audit clean. `test/fixtures/bad/` must hit EXACTLY the FAIL id list (plus warn list) asserted in `test/run.mjs`. If you change a check or an id, update the fixtures and the assertion list in the same commit, and run `npm test` FIRST to see whether the change is planned or a regression you just caught by accident.
- Findings schema is stable: `{page, id, level, message}` grouped into `{counts: {fail, warn}, findings}` under `--json` (`schema: 1`). Schema changes are breaking by semver - additive first.
- Packs are NOT in the 0.9.0 core. When the M1 loader lands it follows packstruct SPEC v1: `packs/public/<name>/` (manifest + entry), check profile default export `{ checks: [...] }`, ids namespaced by pack slug, instant nameable refusals, and `packstruct lint packs/` before any merge that touches packs.
- **Packs ARE realized here** (the gistory#14 battery landed with the lint-packs wrapper verb): `packs/public/eyes-reference/` ships the reference-shape pack and `packs/public/eyestruct-shapes/` ships the canon-audit pack over an eyestruct-shaped lab tree (poststruct#19: seven pure file checks, zero network; the hosted target resolves as `EYESTRUCT_TREE`, else the nearest canon-carrying tree found walking OUT from ROOT (gistory's tree carries the family record at labs/.eyes), else one BOUNDED docket, never a fake pass). Both against the committed `packs/eye-ledger.json` baseline, packstruct rides an exact devDependency pin (1.0.0, next to eyestruct 0.9.0), the battery is `npm run check` = test + `lint:packs` (the wrapper, repo's own install) + `conform:packs` (audit-conformance through the campaign runner), and `packstruct lint --deep` runs inside the wrapper. The test verb carries the three-part spine: the audit fixtures (8 exact FAIL ids), `test/shapes-run.mjs` (the shapes pack's good canon + ten bad fixtures), and `node --test test/ship-from-download.test.cjs` (the copied phone publish lane, 21 behavior tests, the script itself is `scripts/ship-from-download.cjs` byte-as-is from eyestruct@9744c76). Adding a pack or touching pack ids must keep the ledger green in the same commit.
- The walk-exit rule (the promotion rule, family law 2026-10-28, eyestruct@70dfbea): a manual walk is not done until nothing it found is uncommissioned. A probe that only ever lived in prose is a one-mortem; the walk's exit criterion is that every finding became permanent in the same session (a battery leg, a pack verdict row, or a named docket row) so future walks only see fresh ground. Walks DISCOVER classes; the battery REMEMBERS them.
- All prose in shipped templates, fixtures, README and AGENTS submits to the voice law: zero dashes-of-any-kind, no AI-cliche constructions, plain declarative sentences only.

## Release
- 0.9.0 = current manual npm. Bump to 1.0.0 -> tag v1.0.0 -> `publish.yml` runs (see DEPLOY.md; same OIDC trusted publishing as prestruct; the workflow refuses 0.x versions at the gate).
- CHANGELOG.md is Keep-a-Changelog. The `[Unreleased]` section is staged content: it flips to the dated version header in the same commit that carries the tag (the crashtest#20 release-atomicity ruling). Never mint a patch version for a docs-only change.
# AGENTS.md - poststruct

## Identity
- **Name:** poststruct (bake auditor)
- **Species:** third leg of the struct family: prestruct (source) -> your build -> poststruct (baked)
- **Repo:** dhaupin/poststruct
- **Core law:** the core enforces the physics (head hygiene, site contract);
  packs enforce the vibes (language, tone, client shapes)
- Complements, never replaces: prestruct audits source; poststruct audits
  what actually shipped.

## Relationship rules
- **poststruct audits baked HTML.** It never edits source or config files.
- Its findings are terminal - the facts prestruct's source-side audits
  cannot see (compression changes, template leftovers, head damage).
- In CI, poststruct gates on exit code; findings block the deploy, not
  open a PR thread.

## Mechanical conventions (this repo)
- Layout: `src/core.mjs` (walk + page model), `src/checks/head.mjs` +
  `src/checks/site.mjs` (the check modules), `src/index.mjs`
  (`runAudit`, the programmatic entry), `bin/cli.mjs` (CLI: one mode,
  `audit [dir] [--json]`). Keep `package.json` `exports`/`bin` pointing
  at both entry files.
- **Fixtures are law.** `test/fixtures/good/` must audit clean.
  `test/fixtures/bad/` must hit EXACTLY the FAIL id list (plus warn list)
  asserted in `test/run.mjs`. If you change a check or an id, update the
  fixtures and the assertion list in the same commit, and run
  `npm test` FIRST to see whether the change is planned or a regression
  you just caught by accident.
- Findings schema is stable: `{page, id, level, message}` grouped into
  `{counts: {fail, warn}, findings}` under `--json` (`schema: 1`). Schema
  changes are breaking by semver - additive first.
- Packs are NOT in the 0.9.0 core. When the M1 loader lands it follows
  packstruct SPEC v1: `packs/public/<name>/` (manifest + entry), check
  profile default export `{ checks: [...] }`, ids namespaced by pack
  slug, instant nameable refusals, and `packstruct lint packs/` before
  any merge that touches packs.
- All prose in shipped templates, fixtures, README and AGENTS submits to
  the voice law: zero dashes-of-any-kind, no AI-cliche constructions,
  plain declarative sentences only.

## Release
- 0.9.0 = current manual npm. Bump to 1.0.0 -> tag v1.0.0 -> `publish.yml`
  runs (see DEPLOY.md; same OIDC trusted publishing as prestruct; the
  workflow refuses 0.x versions at the gate).
- CHANGELOG.md is Keep-a-Changelog. The `[Unreleased]` section is staged
  content: it flips to the dated version header in the same commit that
  carries the tag (the crashtest#20 release-atomicity ruling). Never mint
  a patch version for a docs-only change.

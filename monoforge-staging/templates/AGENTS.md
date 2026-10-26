# AGENTS.md - __NAME__

## Identity
- **Name:** __NAME__ (__SPECIES__)
- **Repo:** dhaupin/__NAME__
- **Core law:** FORGE-TODO:truth (the one-line law this tool enforces; the doctor reads this section down, so fill it, never stub it)

## Mechanical conventions (this repo)
- Source lives in `src/`, CLI in `bin/`. Keep `package.json` exports/bin
  pointing at both.
- Fixtures are law: the negative test in `test/` asserts exact expected
  ids. Update fixtures and assertions in the same commit as a check change,
  and run `npm test` FIRST to see whether the change is planned or a
  regression you just caught by accident.
- All prose submits to the voice law: zero dashes of any kind, no
  AI-cliche constructions, plain declarative sentences only. The doctor
  enforces the dash part mechanically.

## Release
- 0.9.0 = current manual npm. Bump to 1.0.0, tag v1.0.0, publish.yml runs
  (see DEPLOY.md; OIDC trusted publishing; the workflow refuses 0.x
  versions at the gate).
- CHANGELOG.md is Keep-a-Changelog. The `[Unreleased]` section is staged
  content: it flips to the dated version header in the same commit that
  carries the tag. Never mint a patch version for a docs-only change.

## Landing & docs
- Landing: __SITE_URL__ (Cloudflare Pages; functions under `functions/`)
- Docs: __DOCS_URL__ (Jekyll + Pagefind + Freestruct via docs.yml)

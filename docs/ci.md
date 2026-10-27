---
version: '1.0'
permalink: /ci
layout: default
title: CI Pipeline
nav_order: 9
---

# CI pipeline

Gistory's `.github/workflows/ci.yml` gates every push and PR. This page is
the operator prose for what the battery runs and what each failure means;
the guard shapes live in `DEPLOY.md` and the workflow files themselves.

## The CI battery, in order

1. **Typecheck** - `bun run typecheck`, three deliberate passes:
   `tsc -b` for `src/` (looser: the app opts out of `strictNullChecks`, so
   discriminated unions narrow only outside it), then
   `tsconfig.functions.json` and `tsconfig.test.json` for the relay and the
   sync smoke (strict, because a type error there is a 500 for every user).
2. **Lint** - `bun run lint` = ESLint (high-value rules only) + the
   English-only prose gate (`lint:language`) + the docs consistency gate
   (`lint:docs`: 5 frontmatter fields per page, nav vs permalink 1:1, internal
   links resolve, exactly one h1 per page).
3. **Sync smoke** - `bun run sync:smoke`: real agent crypto + real merge +
   real Pages Functions on in-memory SQLite; no account needed.
4. **Migration + maintenance self-checks** - `db:migrate:check` and
   `db:maintain:check` pin the SQL against a real SQLite fixture.
5. **Transport landing gates** - `framework:gate` then
   `transport:lands` (every byte-carry shape the repo tracks must decode to
   the bytes its manifests claim; the committed counterpart to the local
   read-back parity gate).
6. **Crashtest** - the adversarial pack (`crashtest:run`), committed
   `labs/crashledger.json` baseline: fails on a new EXPLOITED or an
   EXPLOITED vs REFUSED regression.
7. **Pack lint** - `lint:packs` (packstruct `--deep` over `packs/`).

What the battery deliberately does **not** run: the browser suites
(`test:ui`, `ui:audit`). They need a Chromium download and a dev server -
run them locally before pushing a UI change (see contributing).

## The docs lane (`.github/workflows/docs.yml`)

ruby/jekyll build > `lint:docs` > freestruct `--strict` (post-render SEO
layer, pinned `freestruct@1.1.0` in the ferry) > pagefind indexed LAST over
the final injected output > GitHub Pages. The lane fails closed: a broken
internal link or a head-hygiene miss refuses the publish instead of shipping
it.

## The mounts' CI battery (family shape)

The staging mounts riding this repo pass through gistory ferries for their
CI receipts; the mounts spec (gistory#14) keeps four independent legs a
mount's own `test.yml` composes when its rig lands:

1. `npm ci` (hermetic, exact-pinned devDeps)
2. `npm test` (node:test spine)
3. `npm run check` (lint gates + packs campaign + packstruct `--deep`)
4. `npx crashtest run` (baseline-gated adversarial lane)

The legs are independent - any of them can light up first - and both lanes
are deterministic: fixed seed, fixed attack batches, committed baselines.

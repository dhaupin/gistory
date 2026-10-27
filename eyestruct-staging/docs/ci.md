---
version: '1.0'
permalink: ci/
layout: default
title: CI
description: The eyestruct CI battery - the node:test spine, the packs campaign, and the committed ledger baseline that gates every run.
nav_order: 4
---

# CI

## The battery (eyestruct@91928a7 + cd135a9 shape)

One job, four legs, run in `test.yml`; any can light up alone:

```yaml
- run: npm ci                  # hermetic, exact-pinned devDeps
- run: npm test                # node:test spine
- run: npm run check           # lint:docs + packs campaign + packstruct --deep
- run: npx crashtest run       # baseline-gated (labs/crashledger.json)
```

Determinism contract: the eye camera rides behavior tests with REAL P-256
key material and the crash lane rides fixed attack batches with a fixed
seed, so both are re-runnable to identical verdicts.

## The pack lane

The packstruct lint lane is a wrapper verb, not a raw script:
`<tool> lint-packs [--deep] [--json] [--against <lib>] [dir]`. The repo's
own install only (node_modules/.bin then PATH, never a download); missing
packstruct exits 2 naming the exact devDep fix; exit codes pass through
verbatim. Default dir is the packs ROOT, never a subdirectory alone.

## The ledger baseline

`labs/crashledger.json` is committed and CI fails on a new EXPLOITED row or
an EXPLOITED regression of a previously REFUSED one. Adopt new bounds by
re-running the campaign locally, then landing the ledger row together with
the code that changes the verdict.

## The docs lane

`npx jekyll build` then `npx --yes freestruct@1.1.0 --strict` (refuses an
SSG source tree, unknown flags fail loudly), then pagefind indexed over the
final injected output. `npm run lint:docs` is the cheap pre-flight: the 4
frontmatter fields, nav-pages 1:1, links resolve, one h1 per page.

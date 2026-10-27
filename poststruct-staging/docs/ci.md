---
title: "CI"
description: "The poststruct CI battery, the docs build lane with freestruct 1.1.0, and the pack verdict rules that gate the adversarial lane."
author: "Creadev.org"
lang: "en"
date: 2026-10-27
last_modified_at: 2026-10-27
nav_order: 6
layout: default
version: 0.9.0
permalink: /ci
---

# CI

## The battery (gistory#14 mount spec)

One job, four independent legs, any of which can land first:

```bash
npm ci               # hermetic, exact-pinned devDeps
npm test             # the node:test spine
npm run check        # lint gates + packs campaign + packstruct --deep
npx crashtest run    # baseline-gated adversarial lane
```

Deterministic end to end: fixed seed, fixed attack batches, committed
baseline. CI fails on a new EXPLOITED verdict or an EXPLOITED regression of
a REFUSED row; adopt new bounds by re-running the campaign locally.

## The docs lane (`docs.yml`, the flowforge#9 chain)

```bash
npx jekyll build                     # ruby half
npx --yes freestruct@1.1.0 --strict  # post-render SEO layer, fails closed
npx pagefind --site dist             # index LAST, over the final html
```

freestruct 1.1.0 contract worth knowing: unknown CLI flags now fail
loudly (a flag-looking string can no longer ride as an output path), and
the injector refuses an SSG source tree, so point it at the built output
(`dist/`) and not at the checkout.

## The gates in this repo

The check battery rides `.github/workflows/test.yml` and the same file set
is runnable locally: `check-docs-frontmatter.cjs` (all 5 fields + format on
every page), `check-docs-style.cjs` (fence language tags, heading skips,
trailing whitespace, dash and glyph voice rules, pipe-table shape),
`run-packs.mjs` over the committed packs, and the language gate
(`check-language.cjs`) keeping the prose English-only.

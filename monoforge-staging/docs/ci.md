---
version: '1.0'
permalink: ci/
layout: default
title: CI
description: The battery a stamped monoforge repo should compose, the docs build lane, and the ferry receipts the mount rides in gistory.
nav_order: 5
---

# CI

## The battery (gistory#14 mount spec)

One job, four independent legs, any of which can land first:

```yaml
- run: npm ci                    # hermetic, exact-pinned devDeps
- run: npm test                  # the node:test spine
- run: npm run check             # lint + packs + packstruct --deep
- run: npx crashtest run         # baseline-gated adversarial lane (labs/crashledger.json)
```

Both lanes are deterministic end to end: fixed seeds, fixed batches,
committed baselines. A fork cannot walk the seed.

## The docs lane (`.github/workflows/docs.yml`)

```bash
npx jekyll build                 # ruby/jekyll half
npx --yes freestruct@1.1.0 --strict   # post-render SEO layer, fails closed
npx pagefind --site dist         # index LAST, over the final injected html
```

The engine refuses an SSG source tree (point it at the built output, not
the checkout), unknown flags fail loudly (v1.1.0 contract), and pagefind
indexes over the freestruct-injected html, never the bare build.

## Ferry receipts (the mount's own tree)

`monoforge-staging` rides gistory's `monoforge-ferry.yml`: fetch the
sha-gated lock archive, converge a delta, self-test the unpacked tool
(`node test/run.mjs` - the stamp/doctor/lock-refusal battery), gate the
re-derived overlay with a second fresh unpack, and no-op commit when main
already carries the converged tree. Run the same four receipts locally
before pushing a UI or template change; the ferry lanes are the mount's
smoke test.

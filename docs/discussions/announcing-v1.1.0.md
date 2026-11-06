---
version: 1.1.0
permalink: /discussions/announcing-v1.1.0
layout: default
title: "Announcing gistory v1.1.0"
comments: false
nav_order: 23
---

# gistory 1.1.0

gistory is a local-first project history that syncs as a mergeable chain. v1.1.0 is the hardening round since v1.0.0: the app's hash router learned to survive a malformed shared link, and the docs lane folded into the family's one reusable workflow. Every fix is battery-pinned.

## What landed

**The hash router no longer crashes on a malformed URL.** `parseRoute` decoded each query value with a bare `decodeURIComponent`, which throws `URIError` on a bad percent-escape. That made a shared link like `#/project?id=100%` throw at app init and again on every `hashchange`, uncaught, straight into a white screen - a link anyone can paste is enough to take the app down until reload. Decoding now goes through a `safeDecode` that falls back to the raw text (the same guard the serve and probe layers already carry), so a pasted URL degrades to a literal value instead of a crash. `test/router.test.cjs` pins it against the real source (transpiled with the repo's own TypeScript) and bites both ways: the guard fails when removed, passes when restored.

**The docs lane is one lane.** The family built docs from four topologies and the reusable lanes had drifted (ruby 3.2 vs 3.4, pagefind `latest` scrape vs npm pin). The lane is now one canonical reusable workflow in `dhaupin/freestruct`, and this repo is a thin caller of it. A prestruct-pin floor guard joined the battery alongside it.

**The release ladder's `verify` job waits for `release`.** `verify` declares `needs: [publish, release]` (was a bare `needs: publish`), closing a race where it ran CONCURRENTLY with the release mint: on a fresh cut the registry read replicas had not settled and the tarball was not yet attached, so a publish that in fact succeeded failed red and needed a manual re-run (first seen on the packstruct 1.1.0 cut). The release-attach poll widened 120s -> 300s and the registry poll 120s -> 360s, and the release-lane test pins the dependency so a regression fails by name.

## Quality layer

The full suite passes at 44 tests, plus `typecheck` and `lint`. The router fix was reproduced first (a failing pin), then corrected, then re-pinned.

## Links

- Repo and docs: https://github.com/dhaupin/gistory / https://docs.creadev.org/gistory
- App: https://gistory.creadev.org
- Changelog: https://github.com/dhaupin/gistory/blob/main/CHANGELOG.md
- Issues: https://github.com/dhaupin/gistory/issues

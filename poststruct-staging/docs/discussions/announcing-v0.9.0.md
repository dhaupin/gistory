---
version: 0.9.0
permalink: /discussions/announcing-v0.9.0
layout: default
title: Announcing v0.9.0
nav_order: 21
description: v0.9.0 ships the auditor spine - the head and site modules over baked HTML, the findings schema and exit contract, and the self-audit fixtures that gate regressions.
---

# Announcing v0.9.0

poststruct is the auditor that walks the HTML that actually ships. The deployed page is the artifact; poststruct checks it against a contract and exits non-zero on a FAIL finding, so CI gates the regressions instead of an eyeball. v0.9.0 is the auditor's first npm release line, installed like every other dev dependency in the family.

## Install

```shell
npm install --save-dev poststruct
```

Then the first audit:

```text
npx poststruct audit dist/
npx poststruct audit dist/ --json
```

## What ships

- **The head module.** Title present and in its length band, description present and banded, canonical present and absolute, the full OG(7) and Twitter(4) sets, og:image raster-format checks (SVG FAILs, dimensions warn), JSON-LD parse with the LocalBusiness recommended fields, h1 sanity, and the 404 noindex contract.
- **The site module.** `sitemap.xml` existence with loc entries and lastmod, and the `robots.txt` `Sitemap:` pointer.
- **Findings you can gate on.** `{page, id, level, message}` with `{counts, findings}` under `--json`; the exit contract is 0 clean or warns, 1 on any FAIL, 2 usage error.
- **The auditor checks itself.** The self-audit fixture engine makes `test/fixtures/good` audit clean and makes `test/fixtures/bad` hit exactly the expected FAIL ids, so the check catalog cannot drift silently. `npm test` runs the exact sets.

## What the tarball carries

`bin/`, `src/`, and `LICENSE` ship in the npm tarball; the release ladder makes 0.9.x the manual path while `publish.yml` refuses 0.x versions at the gate, and 1.0.0 flips npm Trusted Publishing (`id-token: write`).

## Where to go next

- [Check catalog](/checks) - every check and its id
- [Packs](/packs) - the packstruct pack lane over this audit
- The repo with the full CHANGELOG is [dhaupin/poststruct](https://github.com/dhaupin/poststruct)

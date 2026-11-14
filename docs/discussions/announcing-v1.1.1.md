---
version: '1.1'
permalink: /discussions/announcing-v1.1.1/
layout: default
title: Announcing gistory v1.1.1
comments: false
nav_order: 20
---

# Announcing gistory v1.1.1

gistory is a local-first, offline-capable gist store with a device-sync lane. v1.1.1 is a patch on the 1.1.0 line - the sync engine, the hash router, and the wire format are unchanged. This cut carries two honesty fixes to the test and ledger surfaces, the family floor moves, and the site-shell catch-up. This post ships with the v1.1.1 tag: npm has the tarball by the time you read it.

```bash
npm i gistory-sync
```

## What landed

**The `sync-smoke` legacy first-byte check no longer flakes.** `tests/sync-smoke.ts` asserted that a legacy blob's first byte is never the tag byte by reading the first byte of the *ciphertext* - but AES-GCM output is indistinguishable from random, so it landed on `0x01`/`0x02` about 0.8% of runs and reddened `CI/verify` on a clean tree (two consecutive failures on the pin-advance PR). The tag byte (`TAG_RAW 0x01` / `TAG_DEFLATE 0x02`) rides at the front of the *plaintext*, and legacy plaintext is JSON starting with `{` (`0x7b`), so the invariant holds by construction. The check now reads the plaintext fixture it already builds - deterministic, same intent, and it still bites if the engine's legacy framing ever collides.

**Two legacy `labs/.eyes` ledger rows point at the artifact, not the slot directory.** `row-0005` and `row-0006` named slot *directories* (the pre-`adopt <route>/current.png` form). eyestruct 1.1.0's gate reads the ledger with lstat truth, so a row pointing at a non-file is `DANGLING_ROW` - a latent defect the pin advance turned into a red `eyes-mem` leg on a clean tree. Both rows now name `<slot>/current.png`, the shape their sibling rows already use.

**The family floors move.** The `prestruct` declaration floor is `^1.3.0` (the SSRF-guard security round), refused below by `scripts/check-prestruct-pins.cjs`. The crashtest CI action moves off the v1.0.0 action ref to the v1.3.0 commit and now passes `version: '1.3.0'` (without it the action installed `crashtest` latest - a float the gate could drift under). The committed `labs/crashledger.json` + `labs/run-meta.json` were regenerated under crashtest 1.3.0: the verdict set gains three REFUSED rows and nothing regresses.

**The site follows the family shell.** The docs and product sites gain the breadcrumb trail (`breadcrumb: true`), and the PWA manifest's chrome color moves to the light default the rest of the family already wears.

## Also in this round

The `.gitignore` docs block carries the in-tree Jekyll and pagefind products, so a local docs build leaves no untracked noise. `.github/dependabot.yml` lands with the family flow (weekly Monday, grouped minor/patch, the `github-actions` ecosystem).

## Links

- Repo and docs: https://github.com/dhaupin/gistory / https://docs.creadev.org/gistory
- npm: https://www.npmjs.com/package/gistory-sync
- Changelog: https://github.com/dhaupin/gistory/blob/main/CHANGELOG.md
- Issues: https://github.com/dhaupin/gistory/issues

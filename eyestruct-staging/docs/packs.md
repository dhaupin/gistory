---
version: '1.0'
permalink: packs/
layout: default
title: Packs
description: The extension surface - self-contained adversarial packs that attack eyestruct through its real CLI, judged by the REFUSED / BOUNDED / PASSED / EXPLOITED verdict taxonomy, gated by a committed packledger.
nav_order: 3
---

# Packs

This page documents eyestruct's own pack lane: what the packs shipped under
`packs/public/` attack, how the runner judges them, and how to write or adopt a
pack. For the manifest grammar itself, see [Verbs](/{% link docs/verbs.md %})'s
sibling spec at [dhaupin/packstruct](https://github.com/dhaupin/packstruct).

A pack is a self-contained bundle that loads into the shell's runner, uses the
host's real CLI as its vocabulary, and hosts hostile scenarios against it.
Nothing inside a pack imports the target. A collection of packs is a packdir -
the unit CI audits.

## What ships today

eyestruct ships three packs plus a committed verdict ledger:

| Pack | What it attacks |
|---|---|
| `eye-shapes` | The CLI's browserless surface: ledger tampering (corrupt JSON, duplicate ids, control-char payloads), manifest corruption, unexplained and dangling visual memory, unexplained-note enforcement, missing-baseline and capability refusals. Browser-class captures are a documented accepted-risk bound, never a silent skip. |
| `eye-ci-gate` | The crashledger-semantics gate itself, in disposable fixture repos: unexplained drift fails, dangling canon fails louder, schema integrity is enforced, and an explained tree passes. Any repo implementing the eye gate passes unchanged. |
| `eye-text-leg` | The poststruct integration. Text is the cheaper diff so it gates first: control characters are refused at the ledger write surface, clean notes round-trip through the CLI's own reader, and the manifest stays strict-family schema. |

The verdict ledger is `packs/eye-ledger.json` - one row per recorded scenario,
pinned to its nonce so an adopted row cannot silently change verdict later.

## Running the lane

```bash
npm run packs               # run every pack, enforce the packledger
npm run packs -- --adopt    # adopt new rows (never rewrites existing verdicts)
npm run lint:packs          # manifest + entry + id-census grammar (packstruct)
npm run conform:packs       # conformance audit against the family runner shape
```

The runner (`scripts/run-packs.cjs`) is zero-dependency: it drives the real
`bin/eyestruct.js` as a subprocess inside disposable fixture dirs, then checks
the result. The exit contract is `0` on green, `1` on findings.

## The verdict taxonomy

Every scenario lands in exactly one of four buckets:

| Verdict | Meaning |
|---|---|
| `REFUSED` | The CLI said no, cleanly, with its named code. A regression here is loud. |
| `BOUNDED` | The damage was contained to a documented limit (a byte cap, a fixture lifespan). Adopted bounds live in the packledger, not in prose. |
| `PASSED` | The safe path works end to end - captures, merges, gates, roundtrips. |
| `EXPLOITED` | The attack landed. A new EXPLOITED or a regression of any previously recorded row fails CI. |

Adoption is explicit: a new verdict only enters the ledger through
`npm run packs -- --adopt` in a reviewed commit. Nothing rebuilds the ledger
silently.

## Writing a pack

A pack is a directory under `packs/public/<name>/` with a `pack.json` manifest
(schemaVersion 1: kebab-case `name` matching the directory, `schemaVersion`,
dotted semver `version` of the PACK's own release cadence, `description`, a
relative `entry` path, optional `armedByKey` plus host-owned keys). The entry
is an ES module loaded by the runner regardless of where it lives - `packs/public/`
is tracked and shipped, `packs/local/` is gitignored with identical loading
semantics. The manifest grammar is validated once, at load, by the same rules
`packstruct lint --deep` reports, so a pack that fails lint cannot quietly run.

The rest is scenario authorship against the moduleCtx vocabulary:

```js
// packs/public/<name>/entry.mjs - shape
// 1. build a disposable fixture (the runner hands you a fresh tmp root)
// 2. do the hostile thing through the host's own entry point (subprocess)
// 3. observe and classify against the verdict taxonomy
// 4. return a structured finding; the runner records and enforces it
```

Rules that keep packs load-bearing:

- Each pack drives the CLI as a subprocess, never in-process mocks of its
  internals - phony capture surfaces need the real exit codes.
- Every scenario gets a structured nonce in the packledger; method text lives
  beside the verdict row, not in a module-side channel.
- Browser-class expectations without a pinned headless image are docketed
  bounds, not skips.

## What the lane is for

The pack lane is the adversarial half of eyestruct's CI battery, the same
position crashtest holds in gistory and poststruct holds its checker packs
under. It exists so the git-hostile surface of the daemon - ledger writes,
manifest parsing, baseline gating - is attacked on every push, not audited
annually.

## Roadmap

`packs/public/` is intentionally small. Queued, not yet shipped: a capture
correctness pack that uses the pinned headless browser in CI, and any host-side
pack that appears when a real adopter needs it. A pack lands when a failure
class does.

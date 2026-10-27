---
version: '1.0'
permalink: playbooks/
layout: default
title: Playbooks
description: Task-first recipes for the forge and the stamp lane - the tar-to-mount ferry, doctor receipts, and the CI battery a stamped repo inherits.
nav_order: 4
---

# Playbooks

Task-first recipes, each naming the commands it invokes and the receipts it
checks, so a recipe that drifts from flow throws the failure it documents
rather than silently guessing (the eyestruct family shape, gistory#15).

## 1. Stamp a fleet repo

```bash
monoforge new <dir>
```

Driven by a `factory.json` in `<dir>` (`__NAME__`, `__SPECIES__`, `__PITCH__`,
`__DESCRIPTION__`, `__SITE_DOMAIN__` and friends are validated hard before
anything is written). Receipts:

- a half-specified factory is refused, never half-created;
- a directory holding anything besides `factory.json` is refused,
  never half-merged.

## 2. Cut and lock a deploy tree

```bash
monoforge doctor <dir>   # pass over the stamped tree; refuses generated green
monoforge cut <dir>      # deploy artifacts
monoforge lock <dir>     # lock archive the ferry fetches
```

Doctor receipts worth knowing: an unfilled `FORGE-TODO` slot refuses; a
stray directory in the tree refuses; and a config with unfilled carry slots
refuses with the named refusal, never a bare stack trace. The doctor fix
also walks `.gitignore`-aware (scratch trees do not land in the battery).

The lock archive is the ferry's payload: `horcrux/<name>-<v>-lock.tar.gz`,
sha-pinned wherever a stage (the gistory mount, a CI lane) consumes it. All
stages gate on the exact archive sha before unpacking anything.

## 3. The tar-to-mount ferry

A mount derives its tool tree from the lock archive by construction:

- fetch the pinned `tar.gz` from the owning repo, verify the sha;
- unpack over the mount's tracked bytes;
- converge: any tracked file the unpack clobbered resets to HEAD, then the
  standing rig overlay re-derives from that exact delta and a second fresh
  unpack dry-runs the patch byte-exact before anything commits.

Receipts (gistory `a76ac3a9`, ferry runs 168-170): HEAD's bytes are the rig
generation; a committed patch carries no authority over them, so stale
hunks retire inside the ferry's own commit.

## 4. The battery a stamped repo inherits

Four independent legs (gistory#14 spec), any of which can land alone:

```bash
npm ci                 # hermetic, exact-pinned devDeps
npm test               # the node:test spine
npm run check          # lint + packs campaign + packstruct --deep
npx crashtest run      # baseline-gated adversarial lane
```

The docs lane rides the same four shapes through
`scripts/build-docs.sh`: jekyll build, then `frestruct@1.1.0 --strict`
(refuses an SSG source tree, a broken link, or a head miss), then pagefind
indexed last over the final output.

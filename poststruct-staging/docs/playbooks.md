---
title: "Playbooks"
description: "Task-first recipes for the audit lane: walk a shipped tree, read the check catalog, author a pack, and the CI battery the rig inherits."
author: "Creadev.org"
lang: "en"
date: 2026-10-27
last_modified_at: 2026-10-27
nav_order: 6
layout: default
version: 0.9.0
permalink: /playbooks
---

# Playbooks

Task-first recipes, each naming the commands it invokes and the receipts it
checks, so a recipe that drifts from flow throws the failure it documents
rather than silently guessing (the family shape, gistory#15).

## 1. Audit a shipped tree

```bash
npx poststruct audit dist/          # walks a baked tree, head + site modules
npx poststruct audit dist/ --json   # machine output for a CI step
```

Receipts: a verdict per check (bleed-vs-fit), pointed at the file and line
of the miss; `exit 1` names the failing check, `exit 2` names the setup
trouble. Never a bare stack trace. Point the audit at the built output
(`dist/`, `docs/_site`), never at a source checkout.

## 2. Read the check catalog first

Every finding binds to a named check in the catalog (checks.md), so an
audit result is reproducible prose, not a one-off warning. When a finding
looks wrong for your tree shape, check the catalog entry before changing
anything else: each check documents what it assumes and what a clean tree
looks like for it.

## 3. Author a pack

Packs are adversarial batches (prestruct-shapes, freestruct-shapes at M1)
run through the packstruct lane:

```bash
npx packstruct run packs                    # verdicts per pack
poststruct lint-packs --deep                # manifest + entry + field census
npx packstruct lint packs --deep            # the same lane, called directly
```

The wrapper verb follows crashtest's `lint-packs` shape: the repo's own
install, never downloaded; a missing packstruct is a loud exit 2 naming
the exact fix, never a silent skip.

Receipts: a pack table carries its committed verdicts (REFUSED,
BOUNDED/PASSED, EXPLOITED); the landing rule is a new EXPLOITED or an
EXPLOITED regression of a REFUSED row fails the lane; adoption happens by
re-running the campaign locally and landing the ledger row with the change.

## 4. The battery a poststruct-rigged repo inherits

Four independent legs (gistory#14 shape), any of which can land first:

```bash
npm ci               # hermetic, exact-pinned devDeps
npm test             # the node:test spine
npm run check        # lint gates + packs campaign + packstruct --deep
npx crashtest run    # baseline-gated adversarial lane
```

The docs lane rides `scripts/build-docs.sh`: jekyll build, then
`freestruct@1.1.0 --strict` (point it at the built output; it refuses a
source checkout), then pagefind indexed last over the final injected html.

---
version: '1.0'
permalink: /playbooks
layout: default
title: Playbooks
nav_order: 8
---

# Playbooks

Task-first recipes, each naming the commands it invokes and the receipts it
checks - the eyestruct@fa97161 shape: a recipe that drifts from flow throws
the failure the recipe itself documents rather than silently guessing.

## 1. Cut a staging tar snapshot

The three mount staging trees (`monoforge-staging/`, `poststruct-staging/`,
`eyestruct-staging/`) snapshot into deterministic tarballs via the ferry.

    bash scripts/make-staging-tars.sh

Receipts:

- every tar is rebuilt twice and the byte digests must agree (determinism).
- `scripts/verify-staging-tars.sh` re-verifies each committed tar against a
  fresh rebuild of the current tree - a mismatch reads as "stale snapshot /
  seed-chain gap", never "determinism broken".
- the `staging-tars.yml` workflow runs the same gate after every ferry
  landing, so old tars never outlive the tree that produced them.

## 2. Run the monoforge ferry by hand

The mount's tool tree derives from its lock archive the fetch lane runs
upstream-first:

    gh workflow run monoforge-ferry.yml

or locally, mirroring the steps:

    curl -fsSL https://raw.githubusercontent.com/dhaupin/monoforge/main/horcrux/monoforge-0.9.0-lock.tar.gz -o /tmp/mf-lock.tar.gz
    sha256sum /tmp/mf-lock.tar.gz   # must match the sha gated in the workflow
    tar -xzf /tmp/mf-lock.tar.gz -C monoforge-staging --strip-components=1    # converge derives from this delta
    ( cd monoforge-staging && node test/run.mjs )

Receipts:

- the fetch is sha-gated against the pinned archive hash before anything
  unpacks (a hostile or broken upstream cannot unpack a wrong lock).
- the converge resets every tracked file the unpack clobbered back to HEAD,
  then re-derives `horcrux/rig-overlay.patch` from that same delta and gates
  it with a second fresh unpack (patch + cmp byte-exact).
- HEAD's tracked bytes are the rig generation - a committed patch carries
  no authority over them (the derive-don't-carry law, receipts gistory
  `a76ac3a9` and ferry runs 168-170).

## 3. Re-cut a stone into a mount

Stones (`horcrux/stones/`) are verified copies; adopt one into a mount with a
byte gate, never a bare copy:

    python3 scripts/cut-stones.py          # regenerates stones + builds SVG heads
    bun run crashtest:run                  # the relay pack must stay clean

Receipts:

- stone SHA gate ids flow from `cut-gistory.py` labels - regenerating is
  filename-independent by construction (the `label=` kwarg pins each
  stone's birth name into the SVG header).
- a renamed stone family never drifts its own sequence: bare digit suffixes
  are gone; `r1`/`r2` naming is carried by the renamer's label pins.
- landed mount copies verify by git blob sha, not by trusting the carrier -
  compare `git hash-object` of the local file against the origin blob
  before declaring the landing done.

## 4. The docs publish ride-along

    npm run lint:docs      # frontmatter + nav + links + one h1 per page (check-docs.mjs)
    npx --yes jekyll build # the source half of the CI lane's docs build

Receipts:

- `scripts/check-docs.mjs` gates every page: the 5 frontmatter fields, one
  entry in `_data/nav.yml` per permalink (a page the nav forgets is a page
  nobody reaches), internal links resolving, and exactly one h1 per page.
- after the build, `npx --yes freestruct@1.1.0 --strict` refuses an SSG
  source tree, a broken link, or a head hygiene miss (v1.1.0 contract).
- pagefind indexes LAST, over the final freestruct-injected output.

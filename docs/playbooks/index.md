---
version: '1.0'
permalink: /playbooks
layout: default
title: Playbooks
nav_order: 8
---

# Playbooks

Task-first recipes, each naming the commands it invokes and the receipts it checks - the eyestruct@fa97161 shape: a recipe that drifts from flow throws the failure the recipe itself documents rather than silently guessing.

## 1. Re-cut gistory's own stone

Stones (`horcrux/stones/`) are the brain lineage. gistory's own refresh stone regenerates from committed sources, byte-deterministically:

    python3 scripts/cut-gistory.py

Receipts:

- the CI-cut lane (`.github/workflows/stone-ferry.yml`) sha-gates the assembled stone against its offline blob id (`2779552f`) and refuses to commit on any mismatch - a corrupt stone cannot reach main.
- regenerating is filename-independent by construction (the `label=` kwarg pins the stone's birth name into the SVG header), so a rename never moves the bytes or the gate id.
- the committed family stones (magpie pair, poststruct transfer) are delivered lineage, raster-gated by `framework-gate.mjs`; they are no longer regenerated here (the forge-role cutter retired 2026-11-02).

## 2. The docs publish ride-along

    npm run lint:docs      # frontmatter + nav + links + one h1 per page (check-docs.mjs)
    npx --yes jekyll build # the source half of the CI lane's docs build

Receipts:

- `scripts/check-docs.mjs` gates every page: the 5 frontmatter fields, one entry in `_data/nav.yml` per permalink (a page the nav forgets is a page nobody reaches), internal links resolving, and exactly one h1 per page.
- after the build, `npx --yes freestruct@1.2.0 --strict` refuses an SSG source tree, a broken link, or a head hygiene miss.
- pagefind indexes LAST, over the final freestruct-injected output.

## 3. The family self-audit gate

    npm run framework:gate

Receipts:

- EYES-ART raster-gates every committed renderable (the horcrux stones, `public/favicon.svg`) via the eyestruct npm pin - loads-vs-renders are separate gates, and only the second is sight.
- EYES-MEM walks `labs/.eyes/`: 0 unexplained drift, every row explained.
- skips are NAMED, never fake passes; the exit contract is 0 green / 1 failed / 2 setup.

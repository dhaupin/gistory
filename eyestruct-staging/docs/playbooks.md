---
version: '1.0'
permalink: playbooks/
layout: default
title: Playbooks
description: Task-first recipes for the eye camera - hostless captures, the route by theme matrix, and the walk-adopt-gate cycle.
nav_order: 3
---

# Playbooks

Task-first recipes, each naming the commands it invokes and the receipts it
checks (the eyestruct@fa97161 family shape, gistory#15).

## 1. Hostless capture (no browser, no fonts, no root)

The engine is environment-free by construction: tiered discovery finds a
browser cache with zero flags, and launch blockers surface honestly. Getting
to a working capture on a bare VM follows this recipe:

```bash
npx --yes @puppeteer/browsers install chrome@<PIN>
```

Then extract the runtime deps the chrome binary needs:

```bash
# ~16 shared libraries (curl/libxml/xcb/bit-3 triad and friends) plus an
# Ubuntu font set (fonts-dejavu; a zero-font host produces a glyph-free,
# CAPTURE_TOO_SKELETAL-adjacent shot). Extract the .debs into a home-local
# prefix, never system-wide, and point the loader at them:
export LD_LIBRARY_PATH="$HOME/.root/usr/lib/x86_64-linux-gnu"
export FONTCONFIG_FILE="$HOME/.root/etc/fonts/fonts.conf"
```

Receipts:

- `eyestruct look` still runs nothing privileged: the gate refuses without a
  renderer and never fake-passes (`raster row` refuses without a renderer).
- 3 artifacts / 3 rows, `exit 0` means the camera went green honestly.

## 2. Shooting both themes

The manifest's route x theme matrix emulates `prefers-color-scheme` at
capture time, which is honest only for sites painted from the media query:

- day-rig sites (flowforge template): the matrix works as authored.
- persist-attr rigs (`html[data-theme]` persisted across visits): both
  captures collapse to identical bytes, because first paint honors the media
  query and the persisted attribute then repels emulation. Known spec gap
  (gistory#9 D1): a `--evaluate`-style pre-seed on `look` so the camera sets
  `localStorage['data-theme']` before navigation.

Today's workaround recipe: capture each theme in its own run against a
machine that starts cold, seeding the persisted attribute manually outside
`look` on the second run. The ledger rows carry the finding in-band.

## 3. The walk-adopt-gate cycle

```bash
eyestruct walk .                    # inventory candidate images (scratch-aware)
eyestruct look <target>             # capture + compare
eyestruct diff                      # what moved between two looks
eyestruct adopt <row>               # morph the ledger, not the target
eyestruct ledger                    # the committed receipt chain
eyestruct gate                      # exit contract: 0 green, 1 drift, 2 setup
```

`.eyes/` is the only surviving state, and it is committed so the chain
shares it. `ratify` re-cements canon and reports "no .eyes/ change" runs as
nothing to commit.

## 4. The MCP surface

`eyestruct mcp` exposes the same verbs over MCP for clients that want
camera receipts without a shell: look, diff, ledger, gate. One process, no
daemon; the exit contract and named refusals are all identical.

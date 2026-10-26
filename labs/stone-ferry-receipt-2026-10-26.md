# Receipt: stone ferry (2026-10-26)

The magpie r2 (`horcrux/magpie-p_mirror-eyes-2026-2.svg`) and poststruct
seed (`horcrux/poststruct-p_wordprint-2026.svg`) stones are on main,
byte-exact, landed by CI rather than the hand lane.

## What is on main (git blob ids, verifiable with `git hash-object`)

| File | Blob |
|------|------|
| `horcrux/magpie-p_mirror-eyes-2026-2.svg` | `0bde5b6db94edac65636a34648db13f116cb436e` |
| `horcrux/poststruct-p_wordprint-2026.svg` | `295e5a170c6761e14e71cff0e9b34f70f08327ee` |
| `scripts/cut-stones.py` | `c5e6d4cce650303b328203a909d559e511486073` |
| `.github/workflows/stone-ferry.yml` | `6cb948074430275879b71d33301362f63fb72b56` |

Ferry commit: `1f2725c` (assembled + sha-gated + swept `.cut-tmp/parts/*`).

## What broke and the rule now

- The hand lane (chat-actor transcription of 20KB+ base64) corrupted
  single-word bytes in three separate lands tonight; a 21.7KB base64
  upsert drifted 3 words (`RooOk`/`silente`/`dard`), and the ferry run
  before the script existed failed fast with a loud missing-file error.
  RULE NOW: big blobs do not ride the chat lane. The RECIPE rides
  (`scripts/cut-stones.py`, sources already on main byte-exact); CI
  regenerates the bytes and sha-gates them against offline blob ids.
  A refusal never commits (run 40262829658 vs the green assemble in
  1f2725c prove both halves of that contract).
- The wrapped-base64 layout (76-char rows, targets `b54c1565`/`0b91e0ef`)
  was a workaround for the hand lane and is retired; both stones carry
  the single-line payload cut (`0bde5b6d`/`295e5a17`), and the raster
  gate passes on exactly those bytes (`raster OK`, opaque pixels).

## How the ride works

Stones are now assembled by `.github/workflows/stone-ferry.yml` from
`scripts/cut-stones.py`, which regenerates from parts already on main
(r1 magpie stone + `poststruct-staging/labs/prd-poststruct.md`, both
byte-exact verified against disk). The workflow self-silences on later
pushes (no `.cut-tmp/parts` -> early exit), so this is a one-shot lane
staying green, not recurring CI minutes.

#!/usr/bin/env bash
# mounts-adopt prepare: manufacture monoforge's og card lane from the family
# mold (poststruct's committed build-og.mjs), palette + copy swapped via the
# pinned delta - never a hand-carried blob (labs/transport.md: the 4KB+ text
# lane corrupted twice). The manufactured bytes are blob-gated BEFORE anything
# renders, so a drifted delta refuses the pass.
set -euo pipefail
OUT=monoforge-staging/web/scripts/build-og.mjs
[ -f poststruct-staging/web/scripts/build-og.mjs ] || { echo "missing family mold"; exit 2; }
mkdir -p "$(dirname "$OUT")"
python3 - "$OUT" <<'PY'
import sys
out = sys.argv[1]
old = open('poststruct-staging/web/scripts/build-og.mjs').read()
pairs = [
 ("// (system TTFs) via @resvg/resvg-js, mirroring dhaupin/gistory\n// scripts/build-og.mjs (the family's proven card lane).",
  "// (system TTFs) via @resvg/resvg-js, the family's proven card lane\n// (poststruct web/scripts/build-og.mjs / gistory scripts/build-og.mjs).", 1),
 ("// The card shell: bake-studio palette (ink #0c0f0a .. #14180f), olive accent\n// bar, one soft radial glow. Same structure as the gistory lane's shell.",
  "// The card shell: mint-library palette (ink #10131a .. #131a22), mint accent\n// bar, one soft radial glow. Same structure as the poststruct/gistory shell.", 1),
 ('<stop offset="0" stop-color="#0c0f0a"/>', '<stop offset="0" stop-color="#10131a"/>', 1),
 ('<stop offset="1" stop-color="#14180f"/>', '<stop offset="1" stop-color="#131a22"/>', 1),
 ('<stop offset="0" stop-color="#a8c000" stop-opacity="0.22"/>', '<stop offset="0" stop-color="#7dd3a8" stop-opacity="0.20"/>', 1),
 ('<stop offset="1" stop-color="#a8c000" stop-opacity="0"/>', '<stop offset="1" stop-color="#7dd3a8" stop-opacity="0"/>', 1),
 ('width="${W}" height="6" fill="#a8c000"', 'width="${W}" height="6" fill="#7dd3a8"', 1),
 ('fill="#a8c000">walk baked html | head hygiene | site contract</text>', 'fill="#7dd3a8">stamp repos | doctor truth | lock bytes</text>', 1),
 ('fill="#e6e8dd" letter-spacing="-2">poststruct</text>', 'fill="#e7eaf1" letter-spacing="-2">monoforge</text>', 1),
 ('fill="#b9bfae">Audit what actually shipped, not what you meant to build.</text>', 'fill="#aeb7c2">Stamp fleet repos from proven template blocks.</text>', 1),
 ('fill="#b9bfae">FAIL findings exit non-zero, so CI gates regressions.</text>', 'fill="#aeb7c2">The doctor refuses unfilled slots; the lock verifies bytes.</text>', 1),
 ('width="468" height="64" rx="12" fill="#14180f"', 'width="452" height="64" rx="12" fill="#131a22"', 1),
 ('fill="#a8c000">poststruct.creadev.org</text>', 'fill="#7dd3a8">monoforge.creadev.org</text>', 1),
 ('fill="#79816c">npm i -g poststruct | Creadev.org</text>', 'fill="#717c88">npm i -g monoforge | Creadev.org</text>', 1),
 ('fill="#4a513c">v0.9</text>', 'fill="#4a545e">v0.9</text>', 2),
 ('fill="#79816c" letter-spacing="6">DOCS</text>', 'fill="#717c88" letter-spacing="6">DOCS</text>', 1),
 ('fill="#e6e8dd" letter-spacing="-2">Poststruct Docs</text>', 'fill="#e7eaf1" letter-spacing="-2">Monoforge Docs</text>', 1),
 ('fill="#b9bfae">The check catalog, the pack system, and usage</text>', 'fill="#aeb7c2">The verb catalog, the stamp factory, and rig</text>', 1),
 ('fill="#b9bfae">for the bake auditor.</text>', 'fill="#aeb7c2">mechanics for the emitted repos.</text>', 1),
 ('width="540" height="64" rx="12" fill="#14180f"', 'width="536" height="64" rx="12" fill="#131a22"', 1),
 ('fill="#a8c000">docs.creadev.org/poststruct</text>', 'fill="#7dd3a8">docs.creadev.org/monoforge</text>', 1),
 ('fill="#79816c">maintained by dhaupin | Creadev.org</text>', 'fill="#717c88">maintained by dhaupin | Creadev.org</text>', 1),
]
for o, n, want in pairs:
    c = old.count(o)
    if c != want:
        print(f'delta not unique/missing ({c} want {want}): {o[:60]}'); sys.exit(1)
    old = old.replace(o, n)
open(out, 'w').write(old)
print('manufactured', out)
PY
got="$(git hash-object "$OUT")"
want="320cfcad47dfab6bf898615c3a5c04c8d94f5263"
if [ "$got" != "$want" ]; then echo "PREPARE GATE FAIL $OUT = $got != $want"; exit 1; fi
echo "prepare ok: $OUT = $got (blob gate)"

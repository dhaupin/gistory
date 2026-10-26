# Stone ferry receipt - gistory brain r2 (2026-10-26)

The host's own refresh stone joined the standing CI-cut lane.

## What landed

- `d722d8a` (weisync rider commit): `scripts/cut-gistory.py` (blob
  `600f93d7`), sha-gated ferry gate + dual-cutter run line
  (`.github/workflows/stone-ferry.yml`, blob `1cf8792f`), framework-gate
  EYES-ART list with the r2 stone (`5dbb313a`), `horcrux/README.md`
  receipt (`8ee89ac2`).
- `abc7aec` (stone-ferry's CI-cut commit): all three stones cut on the
  runner from committed sources and sha-gated against the offline ids
  - magpie r2 `0bde5b6d`, poststruct wordprint `295e5a17`, gistory r2
  `a1a01c2d` - before anything was committed.

## Verification receipts

- Local battery: both cutters regenerate byte-exact (0bde/295e/a1a0);
  raster gate over 5 stones + favicon all `raster OK` (resvg, r2 stone
  5327 bytes opaque); framework gate PASS 4/4 legs; birth gate PASS 3/3
  on the landed ferry yml.
- Transport audit: 3/4 blobs byte-true on arrival; the stone-ferry.yml
  delta was a comment-only wrap (main's three-line wrap adopted as
  canon, pulled to disk, hash-verified `1cf8792f`).
- CI at tip `d722d8a`: 6 runs, CI #138 + Crashtest gate success; ferries
  success; zero failures, zero in-progress. The ferry's own commit at
  `abc7aec` is a GITHUB_TOKEN snapshot push (no CI by design).
- Stone on main at the EXACT gated id:
  `git rev-parse origin/main:horcrux/gistory-p_gistory-castles-2026-2.svg`
  = `a1a01c2d6bd46225b5178437f5e0e8de0536cd64`.

## The loop that is now closed

The gistory brain refresh is CI-cut and sha-gated like the mounts' own
stones: seal never needed, offline id pinned in the ferry gate, raster
gated in the framework's EYES-ART leg. Next stone refresh is only ever:
edit the cutter's committed texts, recompute the offline id, land.

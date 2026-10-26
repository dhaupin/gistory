# TASKS — rolling work log

Living file. Update it **before and after every pass** so a fresh session (or a
crash) can see where we are.

Conventions
- `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked
- One line per item; keep detail in the item itself, not here.
- Newest work at the top of **Now**. Move finished items down to **Done**.
- Keep **Done** short — collapse old entries into a date line once they ship.

---

## Now

- **Brain r2 stone ferry closed (2026-10-26).** Gistory's own brain reset now
  rides the standing CI-cut lane, same shape as the mounts' stones. The
  pass: `scripts/cut-gistory.py` (blob `600f93d7`, self-contained so the
  24KB `cut-stones.py` stays byte-untouched), the ferry gains the dual-cutter
  run line + the sha gate pinning `a1a01c2d` (blob `1cf8792f`), the
  framework gate's EYES-ART list takes the r2 stone (`5dbb313a`), the
  horcrux README carries the receipt (`8ee89ac2`) - rider commit `d722d8a`.
  The runner then cut all three stones and pushed the stone itself as
  `abc7aec`; `git rev-parse origin/main:horcrux/gistory-p_gistory-castles-2026-2.svg`
  = `a1a01c2d...` - the EXACT offline id, CI-cut, never hand-carried.
  - Stale-id catch: `429c8597` was the contaminated first draft; found in the
    transport audit and pinned out everywhere before landing.
  - Transport audit: 3/4 blobs byte-true; the stone-ferry.yml delta was a
    comment-only wrap (main's three-line wrap adopted as canon).
  - Battery locally: both cutters byte-exact, raster gate over 5 stones +
    favicon all OK, framework gate 4/4 legs, birth gate 3/3.
  - Brain restored from the stone: decode -> models/private/gistory/*.md,
    6/6 files byte-identical against the cutter's parity copies.
  - Full receipt: labs/stone-ferry-receipt-gistory-r2-2026-10-26.md (blob
    `2b7292c3`).

- **OG card tag-row fix (2026-10-25).**
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

- **Family parity pass (2026-10-27).** eyestruct playbook applied to the
  mounts. Icon lane canonical in all three trees: scripts/adopt-icons.mjs
  (parameterized, palette keyed by pkg.name, three identical copies) +
  the icons:adopt npm verb in each package.json. Gistory keeps its
  authored favicon (docsCopy targets are additive docs/icon.svg only).
  Poststruct docs header carries the web link + .brand styling;
  monoforge had both. Gates: gistory check-docs PASS (12 pages),
  monoforge doctor/style/links PASS, poststruct self-test PASS
  (8/8 FAIL ids) + lint-packs --deep PASS. The eyestruct --links
  exit-code defect has no gistory counterpart (no argv parsing), so
  no port needed.

- **Brain r2 stone ferry closed (2026-10-26).**
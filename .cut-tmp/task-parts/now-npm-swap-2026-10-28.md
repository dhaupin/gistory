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

- **eyestruct@npm: the tool swap (2026-10-28).** eyestruct 0.9.0 published
  on npm, so the lanes that still assumed a checkout retire: CI drops both
  upstream checkouts and every `EYESTRUCT_BIN` / `EYESTRUCT_TREE` env pin
  (the EXACT devDep pin `"eyestruct": "0.9.0"` rides `npm ci` in verify +
  staging-hosts; eyestruct's own repo battery leaves for its CI); the
  resolvers walk OUT from ROOT for `node_modules/eyestruct/bin/eyestruct.js`
  (framework-gate + poststruct run-packs, env still outranks); eyes-ratify
  consumes `node_modules/eyestruct/{bin,lib}` directly; mono-web-emit stops
  re-copying eyestruct-era engine bytes (they are monoforge's own committed
  files now; the docs-icon mirror sync survives as its own step). Poststruct
  ledger re-adopted for the new canon posture: the shapes pack's canon leg
  audits the HOST tree (labs/.eyes), so receipt-provenance /
  verdict-count-drift / reason-table-drift pin honestly BOUNDED (gistory
  carries no receipt hall / pack campaign / reason surfaces). Local
  receipts: framework gate 4/4 PASS exit 0 (raster legs real, resvg on the
  root devDeps), poststruct battery exit 0, mono docs links PASS.
  Monoforge carries no runtime eyestruct - no pin there, only its leftover
  eyestruct-branding fixes (robots.txt sitemap/identity, styles.css header
  comment, check-docs-links doubled-prefix class).
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

- **

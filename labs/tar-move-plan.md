# Tar move: staging mounts → the standalone repos (plan, 2026-10-26)

The staging host trees ride their own changes and tar over into the
standalone repos dhaupin owns. That move is manual (a dhaupin-side push
with real git machinery) — this file is the receipts laneway for it: the
inventory, the injected changes, the sequencing, and what gistory keeps
after each repo leaves. Nothing here runs Until the batteries confirm the
tar arrives clean on GitHub's side. Until then the mount trees are the
single source of truth and gistory's lanes keep riding them.

The pairing at a glance:

| from (staging mount) | → to (standalone repo) | remote |
|---|---|---|
| `poststruct-staging/` | dhaupin/poststruct | exists; push needs a dhaupin-side machine (the App never got write grant on it) |
| `eyestruct-staging/` | dhaupin/eyestruct | also dhaupin-side |
| `monoforge-staging/` | dhaupin/monoforge | exists (labs/ + horcrux/ already upstream); mount holds the tool tree |

### Monoforge notes (staging stood up 2026-10-26)

The third family member parked in gistory as `monoforge-staging/` — the
0.9.0 factory (stamp/doctor/cut/lock, zero-dep) unpacked from its own
lock archive, transported tarball-first by the sha-gated monoforge
ferry (sha256 `046908c6…`, full value in the mount's horcrux README).
What move day must respect:

- **The lock carries the history.** `horcrux/monoforge-0.9.0-lock.tar.gz`
  contains monoforge's own nested `.git` (upstream f8e45fb lineage), so
  move day pushes that history onto dhaupin/monoforge and then overlays
  the repo's labs/ + horcrux/ on top — no flattening, no history loss.
- **The mount adds the receipts only:** `labs/TASKS.md` and
  `horcrux/README.md`. The provisioner stone stays upstream-owned
  (3.3MB — a size class the payload lane already burned once).
- **Battery:** the zero-dep self-test (`node test/run.mjs`) runs in
  gistory CI's staging-hosts leg with no install step; the same one
  gate re-runs on move day in the standalone repo's own workflows
  (already inside the lock).
- **No npx-pin swap needed:** monoforge is not yet a gistory consumer —
  gistory's lanes call poststruct/eyestruct, not monoforge. The factory
  PRD's rule-of-three grading (component-family profile) is what rides
  after move day, via cutlists, not via this plan's consumer-swap 
  ladder.


## Why a tar, not a bare push

The two staging trees already ARE git repos (nested `.git` I gitignored
under gistory's own repo on purpose: a bare gitlink confuses every
consumer without its gitmodules). Their `git` histories are canonical
upstream: six-plus real commits on eyestruct's side, the full poststruct
life-with-0.9.0 on the other. Taring them preserves that history instead
of flattening it — the standalone repos keep provenance storied in their
own heads and never carry a gistory-shaped transplant artifact.

## poststruct-staging → dhaupin/poststruct

### What rides the tar

- the whole tree (the mount IS the repo; `packs/`, `src/`, `bin/`,
  `test/`, `scripts/`, docs/labs/PRD, workflows, health function, the
  poststruct-staging lockfile this ecosystem pushed as 841B honest
  bytes). The `.git` dir itself is the repo history: from the standalone
  side it gets pushed as-is once the mount is untarred.
- package-lock.json — the transit-corruption-tolerant lock
  (`packstruct@1.0.0` = `sha512-aUiBe…` triple-verified) lands HERE; the
  staging-tree copy is already correct.

### Injected changes (pre-tar, land in the mount first)

1. **`scripts/run-packs.mjs` path bindings** — three gistory-mountain
   references need HOST-DECISION env knobs so the pack loader survives on
   any checkout:
   - `POSTSTRUCT_DIST` (default `../gistory/dist`): the audited site for
     `--dist` default. On a standalone checkout the honest default is
     `./dist`; the gistory-relative default becomes an ENV-set override
     only when someone audits gistory FROM poststruct.
   - `EYESTRUCT_BIN` (default `../eyestruct-staging/bin/eyestruct.js`):
     the raster leg's reference. Once eyestruct publishes `0.9.0` this
     flips to an npx-resolved path with an honest version pin — never a
     bare `npx eyestruct` (the pin discipline the ecosystem carries
     everywhere else applies here too: same commit → same findings).
    - `EYES_REFRENCES_PROVIDER_TWIN_MAP` stays (env's own shape); the
     twin keys still NAME gistory, deliberately: gistory is this pack's
     first client, and after the tar it is the CLIENT, not the mount.
2. **`scripts/check-language.cjs`** — no mechanical change needed: it
   lists `labs/` in its scan scope, which remains the repo-local labs/
   tree (its own PRD, own TASSK#. The gistory mention in its contract
   comment rides as-is.

### What gistory keeps after poststruct leaves

- `lab receipts` pointing at dhaupin/poststruct (links replace staging
  paths), `labs/` PRD canonical still lives HERE (gistory is the
  integration host; the pack is the pack).
- `npm run lint:packs` (gistory's pack wiring): crashtest's
  `packs/public/sync-relay-shapes` stays in gistory — that is a
  crashtest-shaped pack run by the crashtest harness, not by
  poststruct. Nothing to remove.

## eyestruct-staging → dhaupin/eyestruct

### What rides the tar

- whole tree: `bin/` + `lib/` (CLI spine, ratify, walk, gate, mcp),
  `tests/smoke.test.js`, `packs/` (eye-shapes, eye-text-leg, eye-ci-gate
  + eye-ledger.json), `docs/` (rig Jekyll identity), `web/` (prestruct
  rig shell), `labs/prd-eyes.md`, `models/private/magpie/` (the brain,
  never shipped), `horcrux/` stones, `MANIFEST.md` provenance, `scripts/`
  (run-packs.cjs + docs gates), `package.json` + lockfile.
- `gh-pages`… not carried; poststruct's docs.yml pattern is the
  template when dhaupin first deploys the docs page.

### Injected changes (pre-tar, land in the mount first)

1. **The CI the mount borrows today**: eyestruct currently has NO own
   workflows — its batteries run from gistory's `ci.yml`
   (`staging-hosts` job) and its ratify lane lives at
   `.github/workflows/eyes-ratify.yml` in gistory (gistory is the host
   whose `.eyes` get ratified). After the tar:
   - eyestruct gets its OWN test.yml modeled on poststruct's (setup-node
     20 → `npm test`), plus `conform:packs` in its battery (packstruct
     1.0.0 exact pin already in `devDependencies`).
   - The ratify/host lane STAYS IN GISTORY — it ratifies gistory's
     `.eyes` home (labs/.eyes), and after the tar it resolves the
     eyestruct tool from npx instead of the staging path (see the
     sequencing note below).
2. **`bin/eyestruct.js`** — the host-owned comment ("gistory keeps its
   eyes at labs/.eyes") gets a second sentence tying EYES_HOME to the
   env: the tool stays neutral-less (its default is `.eyes/`); gistory's
   lane and gate carry the labs/.eyes constant, and the EYES_HOME knob
   flows through `--manifest`/`--ledger` exactly as now.
3. **`web/`** stays a subtree with the prestruct rig shell; landing-site
   build for eyestruct.creadev.org is a post-tar job, same shape poststruct's
   DEPLOY.md section describes honestly ("not landed yet; no DNS before
   the build").

### What gistory keeps after eyestruct leaves

- `labs/.eyes/` (manifest + ledger + baselines) — gistory's visual
  memory, ratified by ITS ratify lane, gated by ITS framework gate.
  The lane (and the gate) re-resolve the eyestruct CLI — that is the
  Task-B companion commit the ecosystem does FIRST so the same today
  tools keep gating after move day.
- `labs/crashledger.json` unaffected — crashtest-shaped work stays.

## Sequencing (the honest ladder)

1. **Pin-swap lane ground (before any tar):** gistory's ratify lane
   derives chrome version from the manifest (no hardcoded number), and
   the eyes home is one EYES_HOME constant in both gate and lane. THIS
   change rides gistory today (task B) so move day is not gated on a
   manual path rewrite.
2. **dhaupin inventory day:** untar both mounts into fresh clones of
   `dhaupin/poststruct` and `dhaupin/eyestruct`; push the nested `.git`
   histories to the remotes (the SAME histories that ride the tar):
   - `cd poststruct-staging && git remote add origin
     git@github.com:dhaupin/poststruct.git && git push origin
     HEAD:main`
   - `cd eyestruct-staging && git remote add origin
     git@github.com:dhaupin/eyestruct.git && git push origin HEAD:main`
3. **Standalone batteries green on GitHub:** each repo's CI on its own
   main — poststruct: `npm ci && npm test` (test.yml) and eyestruct:
   the new test.yml + `npm run check` (docs gates and packstruct
   conformance). The npm install must stay hermetic — `npm ci` against
   the shipped lockfile (poststruct's lock: the 841B packstruct-exact
   pin; eyestruct: its lock, built the same day).
4. **Consumer swap in gistory:** framework gate + ratify lane switch
   from `_staging/` paths to npm resolution (`npx poststruct@0.9.0 …`,
   `npx eyestruct@0.9.0 …` — never bare npx; version reveals the finding
   set). The staging trees STAY until this commit runs green in CI, so
   the swap verifies against a running staging tree one commit at a
   time.
5. **Staging mounts leave:** after the swap proves green in gistory CI,
   the `-staging/` dirs come OUT (one commit per tree) and gistory's
   battery gains zero: all legs resolved from the published CLIs.

## Honest regressions to watch (the risky bits)

- **Audit-diff:**
  eyestruct's raster leg gates gistory's horcrux stones + favicon; on
  day’s swap those paths are gistory-relative and must be fed as ARGV
  (they already are — `eyestruct raster [file...]`) so the swap is a
  path argument change, never a tool change.
- **Firmware-lock drift:** poststruct's `packstruct@1.0.0` and
  eyestruct's `packstruct@1.0.0` should bump TOGETHER with the crashtest
  + gistory pins. The ecosystem's exact-pin discipline gets a companion
  receipt row saying the four pins matched on 2026-10-26 — a later bump
  is a deliberate, receipted event per repo.
- **Law of cool: nothing self-heals.** If a standalone battery lapses
  red, that is a red lane in the repo that owns it — gistory carries no
  silent-swap fallbacks and never elsewhere hides the truth.

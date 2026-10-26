# TASKS tail receipts — synced from the session disk (2026-10-26)

These sections are the tail of labs/TASKS.md as it exists on the session
worktree after the eyes-ratify first-run pass and the relocation decision.
Main's copy of TASKS.md ends just above the eyes-ratify story (chunked
merge pending); this file preserves the overflow verbatim, byte-exact.

---

- **EYES-RATIFY FIRST RUN — GREEN, and the canon is CUT (2026-10-25).**
  The ratify dispatch the user kept watching kept failing; every failure
  was a real, distinct cause, each with a receipt:
  1. `oven-sh/setup-node` does not exist (setup-bun and setup-node were
     mangled together in one `uses:`) -> `actions/setup-node@v4`, matching
     the docs/publish/release lanes.
  2. eyestruct-staging's lock never got regenerated after the packstruct
     1.0.0 exact pin -> `npm ci` died on "Missing: packstruct@1.0.0".
     Pushing the 43KB lock through the chat-to-API commit path dropped a
     SINGLE character five times across three attempts (raw JSON:
     quotes; base64: one integrity char, wrong `3NMM5` where the registry
     has `3NNM5`). The first "repair" lane (npm --package-lock-only in
     CI) came back GREEN WHILE STILL WRONG: npm REUSES existing lockfile
     integrity strings when dep specs are unchanged. The fix that worked
     (one-shot v2 lane, deleted itself in the same push): `rm` the
     lockfile FIRST, resolve from scratch against the registry, prove
     with a real `npm ci`, commit via git machinery -> canonical blob
     `a7cb13b` on main. Kept lesson: any byte-exact artifact the size of
     a lockfile must be machine-written, never hand-transcribed; verify
     uploads by re-fetching and diffing the remote; and treat a green
     "regeneration" with suspicion when it can silently reuse the input
     it was asked to fix.
  3. Browser provisioning: bare `@puppeteer/browsers install
     chrome@stable` lands `./chrome` in the WORKTREE (eyestruct's exec
     discovery never looks there) and shoots a version the manifest pin
     does not name (~stable 156 vs pin 154.0.8037.57); `--path` also
     gets its own chrome/ segment appended, so passing the pre-nested
     dir doubled it (`chrome/chrome/linux-...`). The lane now installs
     the manifest pin chrome@154.0.8037.57 into the puppeteer cache root
     and exports EYESTRUCT_BROWSER with the exact exec on record.
  4. The missing adopt loop: NOTHING in the toolchain writes
     `.eyes/<slot>/current.png` (walk keeps candidates in
     .eyes-candidates/, adopt writes ledger rows only), so a drift
     committed from another machine (77934/55881B vs pinned fresh
     80835/61030B) could never bootstrap. The ratify lane now carries an
     adopt-on-drift bootstrap: ratify first; on DRIFT it walks, promotes
     the pinned-env captures into the slots with required-note adopt
     rows (ratified:false), commits them, and a fresh re-dispatch - an
     independent run, as the doctrine wants - cuts canon.
  Receipts: bootstrap run 40245112959 (success) proposed the pinned
  baselines (80835B/61030B + adopt rows); cut run 40245292339 verified
  both slots verified:true BYTE-IDENTICAL at pin
  local-chrome@154.0.8037.57 and appended the ratify rows to
  .eyes/ledger.json (append-only, row-0007/row-0008). Main carries the
  pinned-env baselines; the cross-machine PNGs are retired.

## 2026-10-26x — eyes relocate to labs/.eyes + ecosystem CI green (receipt)

- **Decision:** the eyes move under `labs/` — same ledger home as `labs/crashledger.json`.
  The eyestruct tool's `.eyes/` default stays untouched for the repos that ARE eyes
  (dhaupin/eyestruct, dhaupin/poststruct after the tar move); the *host* decides its
  home via `--manifest`/`--ledger`.
- **Honest patch:** usage() advertised `--manifest`/`--ledger` but nothing parsed them.
  `eyestruct-staging/bin/eyestruct.js` now wires both into ctx; `ledger-cli.js` gets
  adopt's flag-value guard (its bare posArg read `--ledger`'s value as a route filter).
- **Atomic move:** one-shot `relocate-eyes.yml` lane ran a real `git mv .eyes labs/.eyes`
  and self-deleted in the same push (bot commit 64e7b1af). Bytes + ledger history intact.
- **Canon re-cut on the new home:** eyes-ratify dispatched after the move; fresh
  byte-identical reproduction appended its proof rows (bot commit 1c80230e, ledger rows
  appended at labs/.eyes/ledger.json). Pin local-chrome@154.0.8037.57 unchanged.
- **CI (run #81, workflow_dispatch):** verify green incl. "Framework gate (poststruct ×
  eyestruct legs)" against labs/.eyes; new `staging-hosts` job green (poststruct battery,
  eyestruct smoke, eyestruct battery) — the family's own truths now carry their own CI
  receipts. npm lock lottery closed: packstruct 1.0.0 integrity triple-verified
  (tarball bytes = packument = npm ci bytes = aUiBe… sha512); the lock pushed with the
  file's own base64 after the prose-transcription path stored a hallucinated blob once.
- **Remote-blob integrity rule for the future:** chat-to-API pushes must ship base64 +
  explicit encoding, and the push must be followed by a sha256 compare of the fetched
  raw bytes against local. Two single-character corruptions were caught by this gate.

## Tasks: tar-move plan + v1.1 proposal + CI gate (2026-10-26)

- **A: `labs/tar-move-plan.md`** landed on main (`79480221`) and verified
  byte-identical on the FIRST push (`a6e8ed95` sha-equal, API raw bytes
  vs disk). The pairing, injections (POSTSTRUCT_DIST / EYESTRUCT_BIN /
  twin-map), the 5-step sequencing ladder and the keep-leaving inventory
  are all in it now, receited.
- **C: `labs/packstruct-v1.1-proposal.md`** landed solo (`0378bdf7`)
  after the batched push carried half-file transport drift
  (`810d3811` rejected); solo re-push from a fresh disk emission
  verified byte-identical (`dd054546`). The base64-with-explicit-encoding
  upsert is the reliable lane; raw-text content keeps drifting in transit.
- **CI:** dispatched `ci.yml` on `0378bdf7` as the runtime gate; run #88
  completed `success`.
- **poststruct standalone state (answered with receipts):** exists and
  is real but NOT being built by CI — 0 workflow runs ever, last push
  2026-10-25 10:17Z (dhaupin-side manual upload + horcrux cleanup). Its
  PRD (labs/PRD) is on its main with verified sha; App push grant is
  still denied (`pull:true, push:false`), so any injection lands
  dhaupin-side per the tar-move plan.

## Tasks: packstruct#19 filed + poststruct mount build pass (2026-10-26)

- **packstruct#19** filed on dhaupin/packstruct: the SPEC v1 -> v1.1
  extension proposal issue, crosslinked to the labs doc (byte-sha
  dd054546) and CI-gated in gistory. The App grant on packstruct is
  now LIVE (reads + issue writes work; #15's 403 state is superseded).
- **Poststruct mount build pass** (tar-move plan injection #1 + repair
  landing in the mount first):
  - `poststruct-staging/scripts/run-packs.mjs`: POSTSTRUCT_DIST joins
    the audited-site resolution order (env outranks the
    gistory-mount sibling guess) and EYESTRUCT_BIN becomes the raster
    leg's reference-tool host decision; the packstruck@1 typo repaired
    to packstruct@1. check-language.cjs confirmed env-neutral (rides
    as-is per the plan).
  - Batteries verified HERE FIRST: node --check, self-test 8/8 PASS,
    lint:packs clean (1 pack probed), language gate PASS (10 files),
    audit-conformance 8/8, and the full packs campaign green against a
    freshly baked gistory dist (og-image verified 1200x630/127506B via
    local twin). Root deps restored with npm ci; gistory build green.
  - Remote: the first upsert shipped truncat-red (sha-gate caught
    da81817e vs 694f2d5e); full re-land landed 19f1db80 and verified
    BYTE-IDENTICAL (694f2d5e both sides, raw non-API lane - the API
    was rate-limited mid-verify, the 280-byte error body is what the
    first wrong sha hashed).
- **CI:** run #91 success on 19f1db80 (both staging batteries + the
  full framework stack green on the re-landed loader).

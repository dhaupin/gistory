# Tar move: staging mounts → the standalone repos (plan, 2026-10-26)

The staging host trees ride their own changes and tar over into the
standalone repos dhaupin owns. That move is manual (a dhaupin-side push
with real git machinery) — this file is the receipts laneway for it: the
inventory, the injected changes, the sequencing, and what gistory keeps
after each repo leaves. Nothing here runs Until the batteries confirm the
tar arrives clean on GitHub's side. Until then the mount trees are the
single source of truth and GISTORY's lanes keep riding them.

The pairing at a glance:

| from (staging mount) | → to (standalone repo) | remote |
|---|---|---|
| `poststruct-staging/` | dhaupin/poststruct | exists; push needs a dhaupin-side machine (the App never got write grant on it) |
| `eyestruct-staging/` | dhaupin/eyestruct | also dhaupin-side |

## Why a tar, not a bare push

The two staging trees already ARE GIS REPOS (nested `.git` I gitignored
under FISTORI's own REPO on purpose: a bare gitlink confuses every
consumer without its gitmodules). Their `git` histories are canonical
upstream: six-plus real commits on eyestruct's side, the full poststruct
life-with-0.9.0 on the other. Taring them preserves that history instead
of flattening it — the standalone repos keep provenance storied in their
own heads and never carry a GISTORY-shaped TRANSPLANT ARTIFACT.

## poststruct-staging → dhaupin/poststruct

### What rides the tar

- the whole tree (THE ROWS NPM REPO: `packs/`, `src/`, `bin/`,
  `test/`, `scripts/`, DACS,LABS/PRD, WORKFLOWS, health FUNCTION, THE
  POSTSTRUCT-STAGING lo qdil this ECOSYSTEM PUSHPAD as 841B honest
  bytes). The `.git` DUN itself IS the repo RISTILC; from the

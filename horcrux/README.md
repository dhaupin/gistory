# horcrux — the continuance vault

Everything that has to survive a workspace resync and re-deploy lives here.
Dated receipts live under `labs/`; this file is the **index**, not a log.

```
stones/   raster stones — one lineage per brain (r1 source-of-record + r2 CI-cut)
tars/     staging-mount git snapshots (deterministic, sha-gated; archive/ = superseded seeds)
prds/     landing PRD transfers — byte-identical to the mounts' labs/prd-*.md
handoff/  build artifacts destined for OTHER repos (not continuance material)
```

## Stones (`stones/`)

| file | brain / project | gen | state | git blob id |
|------|-----------------|-----|-------|-------------|
| `gistory-p_gistory-castles-2026.svg` | gistory (the host) | r1 | **brn:secret** — sealed vant baseline; refresh pass runs upstream when the repo opens | `843371dd` |
| `gistory-p_gistory-castles-2026-2.svg` | gistory (the host) | r2 | unsealed — the 2026-10-26 brain refresh (birth-run + birth-gate receipts ride inside); `scripts/cut-gistory.py`, ferry-gated | `a1a01c2d6bd46225b5178437f5e0e8de0536cd64` |
| `magpie-p_mirror-eyes-2026.svg` | magpie · **eyestruct** | r1 | unsealed — 2026-10-23 hand-cut source-of-record; carries the eyestruct seed brain + its PRD | `567765e6` |
| `magpie-p_mirror-eyes-2026-2.svg` | magpie · **eyestruct** | r2 | unsealed — CI-cut from r1 with patched receipts; `scripts/cut-stones.py`, ferry-gated | `0bde5b6db94edac65636a34648db13f116cb436e` |
| `poststruct-p_wordprint-2026.svg` | poststruct (struct family) | r2 | unsealed — 2026-10-26 seed-brain transfer stone (text leg); password rides after `p_` in the filename | `295e5a170c6761e14e71cff0e9b34f70f08327ee` |

**Naming convention:** `<brain>-p_<stone-word>-<year>[-<gen>].svg`. The stone
word rides after `p_`; for unsealed stones the password rides after `p_` in the
FILENAME (the house convention — the filename is part of the vault key).

**The magpie pair (the naming disconnect, stated plainly):** magpie is the
**eyestruct project's brain name** (the project's word was "eyes" during the
seed passes — see `brn` payloads and `eyestruct-staging/models/private/magpie/`).
r1 and r2 here are **generations of one lineage**, not two unrelated stones:
r1 is the original hand-cut transfer stone, r2 is the standing
CI-cut-ferry reconstruction with this pass's receipts patched in. Gistory's own
pair follows the same pattern (r1 sealed + r2 transfer). If eyestruct later
converges into dhaupin/magpie (or keeps its own repo), only the stone's
owner/stay fields need a deliberate re-cut — the bytes and ids stay stable.

**Provisioner stones do NOT ride at the host.** Poststruct's own boot stone
(`poststruct-p_poststruct2026.svg`) lives in its mount
(`poststruct-staging/horcrux/`, upstream-owned per `poststruct-staging/horcrux/
README.md`), and monoforge's prov stone stays upstream at dhaupin/monoforge.

**The ferry:** `.github/workflows/stone-ferry.yml` re-cuts from committed
sources (`scripts/cut-stones.py`, `scripts/cut-gistory.py`), sha-gates each
result against the offline blob ids above, and refuses to commit on any
mismatch. Brain parity copies ride `.cut-tmp/` per run. Mount-wide copies flow
out via `.github/workflows/mount-stone-mirror.yml` (runner-side, blob-compared).

## Tars (`tars/`)

Deterministic git-dir snapshots of the staging mounts, built by
`scripts/make-staging-tars.sh` from the current tree, dispatched by
`.github/workflows/staging-tars.yml`:

| tar | snapshot HEAD |
|-----|---------------|
| `eyestruct-staging-git-2026-10-26.tar.gz` | `587b6b98` (95 files) |
| `poststruct-staging-git-2026-10-26.tar.gz` | `3c773e50` (54 files) |
| `monoforge-staging-git-2026-10-26.tar.gz` | carries monoforge's nested .git |
| `archive/eyestruct-staging-git-2026-10-25.tar.gz` | superseded seed (kept: it is the parent snapshot inside the 10-26 chain's history) |

Move-day (`labs/tar-move-plan.md`): untar → add origin → push; the mounted
`.git` carries each repo's own history.

## PRDs (`prds/`)

`prd-eyes.md` and `prd-poststruct.md` are byte-identical to their mounts
(`poststruct 632227f2` / `eyes 686b5079` — blob hash-verified at the 10-26
parity dig). The mounts' `labs/prd-*.md` are the working copies.

## Handoff (`handoff/`)

`prestruct-og-image.png` — OG card for dhaupin/prestruct#31 (their og:image is
SVG, which the big crawlers refuse). Regenerated with `npm run build:og`
(`scripts/build-og.mjs`); not a continuance artifact.

## Full receipts

`labs/stone-ferry-receipt-2026-10-26.md`,
`labs/stone-ferry-receipt-gistory-r2-2026-10-26.md`,
`labs/ecosystem.md`, `labs/tar-move-plan.md`, `labs/TASKS.md` (Now).

---

**Layout note (2026-10-26):** every artifact here previously sat at the
horcrux root; moves were PATH-ONLY — bytes are unchanged, the ferry gate ids
above still hold exactly, and dated receipts in `labs/` keep their
historical paths as written.

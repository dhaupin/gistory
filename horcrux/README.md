# horcrux — the continuance vault (gistory's own)

Everything that has to survive a workspace resync and re-deploy lives here.
Dated receipts live under `labs/`; this file is the **index**, not a log.

2026-11-02 forge-role decouple: the staging mounts and the family registry
(`mounts/`) retired from gistory. poststruct and monoforge graduated to their
own repos (each now owns its tree and CI), so their snapshot tars, lock
archives, handoff carriers and prov stones are gone from here; eyestruct had
already retired upstream 2026-10-27. The stones below stay as delivered
lineage. The forge role moves to railyard.
```
stones/   raster stones — one lineage per brain (r1 source-of-record + r2 CI-cut)
prds/     landing PRD transfers — byte-identical to the mounts' labs/prd-*.md
handoff/  build artifacts destined for OTHER repos (not continuance material)
```

## Stones (`stones/`)

| file | brain / project | gen | state | git blob id |
|------|-----------------|-----|-------|-------------|
| `gistory-p_gistory-castles-2026-r1.svg` | gistory (the host) | r1 | **brn:secret** — sealed vant baseline; refresh pass runs upstream when the repo opens | `843371dd` |
| `gistory-p_gistory-castles-2026-r2.svg` | gistory (the host) | r2 | unsealed — the 2026-10-26 brain refresh (birth-run + birth-gate receipts ride inside); `scripts/cut-gistory.py`, ferry-gated | `a1a01c2d6bd46225b5178437f5e0e8de0536cd64` |
| `magpie-p_mirror-eyes-2026-r1.svg` | magpie · **eyestruct** | r1 | unsealed — 2026-10-23 hand-cut source-of-record; delivered lineage (eyestruct carries its magpie pair upstream; no longer re-cut here) | `567765e6` |
| `magpie-p_mirror-eyes-2026-r2.svg` | magpie · **eyestruct** | r2 | unsealed — delivered lineage (eyestruct carries its magpie pair upstream; the family cutter retired 2026-11-02, no longer re-cut here) | `0bde5b6db94edac65636a34648db13f116cb436e` |
| `poststruct-p_wordprint-2026.svg` | poststruct (struct family) | r2 | unsealed — delivered seed-brain transfer stone (text leg); no longer re-cut here (poststruct owns its tree upstream) | `295e5a170c6761e14e71cff0e9b34f70f08327ee` |

**Naming convention:** `<brain>-p_<stone-word>-<year>[-rN].svg`. The stone
word rides after `p_`; for unsealed stones the password rides after `p_` in the
FILENAME (the house convention — the filename is part of the vault key).
Generation suffixes are `-r1`/`-r2` (bare digit `-2` names retired 2026-10-26,
path-only: each cutter pins its stone's BIRTH name into the SVG header via
`label=`, so bytes — and ferry gate ids — never move on a rename).

**The magpie pair (the naming disconnect, stated plainly):** magpie is the
**eyestruct project's brain name** (the project's word was "eyes" during the
seed passes — see `brn` payloads and the brain tree, now upstream at
`dhaupin/eyestruct` `models/private/magpie/` since the mount retired
2026-10-27).
r1 and r2 here are **generations of one lineage**, not two unrelated stones:
r1 is the original hand-cut transfer stone, r2 is the standing
CI-cut-ferry reconstruction with this pass's receipts patched in. Gistory's own
pair follows the same pattern (r1 sealed + r2 transfer). If eyestruct later
converges into dhaupin/magpie (or keeps its own repo), only the stone's
owner/stay fields need a deliberate re-cut — the bytes and ids stay stable.

**Provisioner stones do NOT ride at the host.** Poststruct's own boot stone
(`poststruct-p_poststruct2026.svg`) and monoforge's prov stone live in their
own repos upstream (`dhaupin/poststruct`, `dhaupin/monoforge`).

**The ferry:** `.github/workflows/stone-ferry.yml` re-cuts gistory's own
stone from committed sources (`scripts/cut-gistory.py`), sha-gates it against
the offline blob id above, and refuses to commit on any mismatch. Brain parity
copies ride `.cut-tmp/` per run. (The family cutter `scripts/cut-stones.py`
and the mount-wide copy lane `mount-stone-mirror.yml` retired 2026-11-02 with
the forge-role decouple; the family stones stay as delivered lineage.)

## Tars (retired 2026-11-02)

The staging-mount snapshot tars retired with the mounts. poststruct and
monoforge graduated to their own repos and carry their own history now; the
deterministic ferry (`scripts/make-staging-tars.sh`) and its registry
(`mounts/`) are gone from this repo.


## PRDs (`prds/`)

`prd-eyes.md`, `prd-poststruct.md`, and `prd-monoforge.md` are the landing
PRD transfers cut at the 10-26/10-27 parity dig. With the mounts retired
2026-11-02 these are frozen vault copies: the live PRDs now live in each
repo's own `labs/` (`dhaupin/eyestruct`, `dhaupin/poststruct`,
`dhaupin/monoforge`).

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

# lane patch pairs for horcrux/README.md (replay-proven)
TARGET = "horcrux/README.md"
PIN = "e8b098b07d82d3cea75a5c23137dbc9ab0eeb41b"
PAIRS = [
  ("""# horcrux — the continuance vault
""", """# horcrux — the continuance vault (gistory's own)
"""),
  ("""Dated receipts live under `labs/`; this file is the **index**, not a log.

""", """Dated receipts live under `labs/`; this file is the **index**, not a log.

2026-10-28 /mounts reorg: horcrux/ returns to gistory-only scope. The
staging mounts' payloads (snapshot tars, lock archives, handoff carriers,
prov stones) moved to the family registry `mounts/public/<mount>/boot/`
(tier spec in `mounts/README.md`) — mirroring vant's /models rigging.
"""),
  ("""tars/     staging-mount git snapshots (deterministic, sha-gated; archive/ = superseded seeds)
""", """"""),
  ("""(`poststruct-p_poststruct2026.svg`) lives in its mount
(`poststruct-staging/horcrux/`, upstream-owned per `poststruct-staging/horcrux/
README.md`), and monoforge's prov stone stays upstream at dhaupin/monoforge.
""", """(`poststruct-p_poststruct2026.svg`) lives in the registry
(`mounts/public/poststruct/boot/stone/`, upstream-owned), and monoforge's
prov stone stays upstream at dhaupin/monoforge.
"""),
  ("""## Tars (`tars/`)
""", """## Tars (moved to `mounts/public/<mount>/boot/tars/`, 2026-10-28)
"""),
  ("""`scripts/make-staging-tars.sh` from the current tree, dispatched by
`.github/workflows/staging-tars.yml`:

| tar | snapshot HEAD |
|-----|---------------|
| `poststruct-staging-git-2026-10-26.tar.gz` | `3c773e50` (54 files) |
| `monoforge-staging-git-2026-10-26.tar.gz` | carries monoforge's nested .git |

(Eyestruct's tar chain retired 2026-10-27 with the mount graduation to
dhaupin/eyestruct — the 10-25/10-26 snapshots were move-day payloads,
their reader is upstream's own git history now.)

Move-day (`labs/tar-move-plan.md`): untar → add origin → push; the mounted
`.git` carries each repo's own history.
""", """`scripts/make-staging-tars.sh` (seed chain + byte-determinism all
preserved — the boot paths resolve through `boot_tars()`), dispatched by
`.github/workflows/staging-tars.yml`, committed under each mount's
`mounts/public/<mount>/boot/tars/`:  
`poststruct-staging-git-2026-10-26.tar.gz` @ `3c773e50`, and monoforge's
chain carrying its nested .git. Move-day per `labs/tar-move-plan.md`:
untar → add origin → push; the mounted `.git` carries each repo's own
history.
"""),
]

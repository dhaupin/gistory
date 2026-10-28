# new registry files (whole-file carries, blob-gated)
NEWFILES = [
  {'path': "mounts/README.md", 'pin': "17732446559e57c8209602cc73aa8aa874563f76", 'content': """# /mounts — the family mount registry (2026-10-28)

Every forked mount in the struct ecosystem lives here, mirroring vant's
`/models` rigging: per-mount, per-tier directories with a `boot/` carry
folder, and one shared `state.json` registry.

    mounts/
      public/<mount>/     # mount whose payload ships upstream (dhaupin/<mount>)
      private/<mount>/    # shared inside the ecosystem (install-visible, not public)
      local/<mount>/      # never pushes anywhere
      state.json          # the registry: tier, tree, repo, boot contents per mount

Each mount's `boot/` is carry space, not content (vant's law: boot is
excluded from listings):

    boot/tars/      # reproducible `<mount>-staging-git-<date>.tar.gz` snapshot
                    # tars (the staging-tars ferry writes here) + the mount's
                    # own lock archives
    boot/handoff/   # transport payloads: chunk/b64 carriers, overlay patches,
                    # og src markup
    boot/stone/     # the mount's own stones (svg)

## Contracts

- **The staging trees stay where they are** (`poststruct-staging/`,
  `monoforge-staging/`); `mounts/` holds PAYLOADS only — boot bytes of
  them, nothing else. Move day untars `boot/tars/<mount>-staging-*.tar.gz`
  into the standalone repos, exactly per `labs/tar-move-plan.md`.
- **gistory's own `horcrux/` returns home**: stones, PRDs, rig-overlay,
  and the ferry artifacts of gistory itself only. Mount payloads landed in
  the registry on 2026-10-28.
- **The ferry is path-blind already**: `make-staging-tars.sh` +
  `verify-staging-tars.sh` resolve each mount's boot through
  `boot_tars()`, and the snapshot-filename chain (today's tar is never
  its own seed) is byte-deterministic, unchanged.
- **Parity ask rides with this layout**: the tier spec is filed to
  dhaupin/vant and dhaupin/packstruct as issues, so the models/mounts/
  packs rigs all speak public/private/local the same way.
"""},
  {'path': "mounts/state.json", 'pin': "911bb68a42b30b5e36b5ade613875a0eb0f16173", 'content': """{
  "schemaVersion": 1,
  "updated": "2026-10-28",
  "tiers": ["public", "private", "local"],
  "mounts": {
    "poststruct": {
      "tier": "public",
      "tree": "poststruct-staging/",
      "repo": "dhaupin/poststruct",
      "boot": {
        "tars": ["poststruct-0.9.0-rig-lock.tar.gz", "poststruct-staging-git-*.tar.gz"],
        "stone": ["poststruct-p_poststruct2026.svg", "poststruct-p_wordprint-2026.svg"]
      }
    },
    "monoforge": {
      "tier": "public",
      "tree": "monoforge-staging/",
      "repo": "dhaupin/monoforge",
      "boot": {
        "tars": ["monoforge-0.9.0-lock.tar.gz", "monoforge-staging-git-*.tar.gz"],
        "handoff": ["chunk.*.part", "identity-*", "lock-archive-overlay.patch", "og-image-src.svg"]
      }
    }
  }
}
"""},
]

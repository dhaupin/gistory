# lane patch pairs for .github/workflows/staging-tars.yml (replay-proven)
TARGET = ".github/workflows/staging-tars.yml"
PIN = "9c6dd4bc06c8dc89caf7e8446863bd4341055e0e"
PAIRS = [
  ("""# snapshots of the struct-family staging mounts (horcrux/tars/<mount>-
# git-<YYYY-MM-DD>.tar.gz) from the CURRENT tracked tree state, using
""", """# snapshots of the struct-family staging mounts (boot tars live under
# mounts/public/<mount>/boot/tars/<mount>-git-<YYYY-MM-DD>.tar.gz since
# the 2026-10-28 /mounts reorg) from the CURRENT tracked tree state, using
"""),
  ("""          TARS=$(ls horcrux/tars/*-git-$(date -u +%F).tar.gz 2>/dev/null || true)
""", """          TARS=$(ls mounts/public/*/boot/tars/*-git-$(date -u +%F).tar.gz 2>/dev/null || true)
"""),
]

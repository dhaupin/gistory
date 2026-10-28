# lane patch pairs for scripts/make-staging-tars.sh (replay-proven)
TARGET = "scripts/make-staging-tars.sh"
PIN = "834dd59e799f1b21291682b77958f38ab237e7b0"
PAIRS = [
  ("""# The result lands under horcrux/tars/<mount>-git-<TODAY>.tar.gz. Byte
""", """# The result lands under mounts/public/<mount>/boot/tars/<mount>-git-<TODAY>.tar.gz.
# Boot layout (2026-10-28 /mounts reorg): every mount payload (snapshot
# tars + lock archives + handoff + stone) lives in the registry tree,
# mirroring vant's /models rigging; gistory's own horcrux/ stayed home. Byte
"""),
  ("""MOUNTS="poststruct-staging monoforge-staging"
""", """MOUNTS="poststruct-staging monoforge-staging"
# The registry strips the -staging suffix: the snapshot tree is
# poststruct-staging/, but its boot registry is mounts/public/poststruct/.
boot_tars() { echo "mounts/public/${1%-staging}/boot/tars"; }
"""),
  ("""for m in $MOUNTS; do
""", """for m in $MOUNTS; do
    boot="$(boot_tars "$m")"
"""),
  ("""    for s in $(ls horcrux/tars/${m}-git-*.tar.gz \\
                    horcrux/tars/archive/${m}-git-*.tar.gz 2>/dev/null | sort -r); do
        if [ "$s" != "horcrux/tars/${m}-git-${TODAY}.tar.gz" ]; then
""", """    for s in $(ls "$boot/"${m}-git-*.tar.gz \\
                    "$boot/archive/"${m}-git-*.tar.gz 2>/dev/null | sort -r); do
        if [ "$s" != "$boot/${m}-git-${TODAY}.tar.gz" ]; then
"""),
  ("""        -cf - -C "$m" .git | gzip -n > "horcrux/tars/${m}-git-${TODAY}.tar.gz"
    echo "tar: horcrux/tars/${m}-git-${TODAY}.tar.gz  $(git -C "$m" log -1 --format=%H)"
""", """        -cf - -C "$m" .git | gzip -n > "$boot/${m}-git-${TODAY}.tar.gz"
    echo "tar: $boot/${m}-git-${TODAY}.tar.gz  $(git -C "$m" log -1 --format=%H)"
"""),
]

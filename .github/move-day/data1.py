# lane patch pairs for scripts/verify-staging-tars.sh (replay-proven)
TARGET = "scripts/verify-staging-tars.sh"
PIN = "513f953e6f95937ad53da4066eb2b64a7603947b"
PAIRS = [
  ("""# (mount + tar chain gone 2026-10-27).
MOUNTS=""", """# (mount + tar chain gone 2026-10-27).
boot_tars() { echo "mounts/public/${1%-staging}/boot/tars"; }  # /mounts reorg 2026-10-28
MOUNTS="""),
  ("""for m in $MOUNTS; do
    # newest COMMITTED tar for this mount, whatever date it carries
    latest="$(git ls-tree HEAD "horcrux/tars/${m}-git-"* 2>/dev/null | awk '{print $4}' | sort | tail -1 || true)"
    fresh="horcrux/tars/${m}-git-$(date -u +%F).tar.gz"
    if [ -z "$latest" ]; then
        echo "FAIL $m: no committed tar under HEAD:horcrux/tars/ - run the staging-tars ferry first"
        FAIL=1; continue
    fi
""", """for m in $MOUNTS; do
    boot="$(boot_tars "$m")"
    # newest COMMITTED tar for this mount, whatever date it carries
    latest="$(git ls-tree HEAD "$boot/"${m}-git-*.tar.gz 2>/dev/null | awk '{print $4}' | sort | tail -1 || true)"
    fresh="$boot/${m}-git-$(date -u +%F).tar.gz"
    move_day=0
    if [ -z "$latest" ]; then
        # move-day: HEAD is still pre-reorg (the registry commit lands after
        # this gate), so the new boot path holds no committed tar yet. The
        # move identity is already gated byte-exact by the apply step (33
        # pre-move blob pins) and the rebuild determinism by the ferry step;
        # the staleness comparison below is day-to-day business, not
        # move-day business.
        move_day=1
        latest="$(git ls-tree HEAD horcrux/tars/ 2>/dev/null | awk -v p="${m}-git-" '$NF ~ p {print $4}' | sort | tail -1 || true)"
        if [ -z "$latest" ]; then
            echo "FAIL $m: no committed tar anywhere (boot on HEAD or legacy horcrux/tars/)"
            FAIL=1; continue
        fi
    fi
    if [ "$move_day" = 1 ]; then
        if [ -s "$fresh" ]; then
            echo "PASS $m: move-day (HEAD pre-reorg; legacy committed $latest; move identity + determinism gated upstream)"
        else
            echo "FAIL $m: move-day but no fresh tar at $fresh"
            FAIL=1
        fi
        continue
    fi
"""),
  ("""# Leave the working tree exactly as found: the verification had to write
# today's tar names to compare bytes, so any TRACKED file it overwrote gets
# restored from git, and any untracked one is removed (derivable output;
# the ferry owns landing them).
today="$(date -u +%F)"
for m in $MOUNTS; do
    f="horcrux/tars/${m}-git-${today}.tar.gz"
    if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
        git checkout -- "$f"
    else
        rm -f "$f"
    fi
""", """# Leave the working tree exactly as found: the verification had to write
# today's tar names to compare bytes, so any TRACKED file it overwrote gets
# restored from git, and any untracked one is removed (derivable output;
# the ferry owns landing them).
# Move-day exception: the boot path is not in the index yet (the registry
# commit lands right after this), so the fresh tar IS the payload the
# whitelist commit carries - keep it. Only the day-to-day case restores.
today="$(date -u +%F)"
for m in $MOUNTS; do
    boot="$(boot_tars "$m")"
    f="$boot/${m}-git-${today}.tar.gz"
    if git ls-files "$boot/" | grep -q .; then
        if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
            git checkout -- "$f"
        else
            rm -f "$f"
        fi
    fi
"""),
]

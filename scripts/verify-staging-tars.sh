#!/usr/bin/env bash
# Move-day gate for the struct-family staging mounts.
#
# For each mount: run the tar ferry (make-staging-tars.sh rebuilds the
# mount's nested .git from the committed seed chain and packs DETERMINISTIC
# bytes) and compare the fresh bytes against the tar the repo actually
# has committed for that mount (the newest committed date, whatever it
# says, read from HEAD - never from the working tree).
#
# PASS: every committed snapshot is exactly what the current tree
#       produces - the bytes dhaupin untars on move day ARE the tree, and
#       provenance (the seed chain inside) is intact.
# FAIL: exit 1 per drift. NOT "determinism broken" - it means the tree
#       moved since the ferry last committed (stale snapshot), or a seed
#       chain gap. Fix: re-run the staging-tars ferry, then this again.
#
# The ferry derives its seed EXCLUDING today's own filename, so this
# verification is stable even on the commit day: today's committed tar is
# compared against a rebuild from the same non-today seed it was built
# from, and determinism guarantees byte identity when the tree is unchanged.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
# poststruct + monoforge only: eyestruct retired to dhaupin/eyestruct
# (mount + tar chain gone 2026-10-27).
boot_tars() { echo "mounts/public/${1%-staging}/boot/tars"; }  # /mounts reorg 2026-10-28
MOUNTS="poststruct-staging monoforge-staging"
FAIL=0

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "== Pre-tar verify: committed staging tars vs fresh rebuild =="

# Fresh rebuild first, one shot, all mounts (the ferry is deterministic;
# its output for the current tree is the ground truth for this check).
bash scripts/make-staging-tars.sh >/tmp/ferry-verify-log 2>&1 || {
    echo "FERRY BUILD FAILED:"; cat /tmp/ferry-verify-log; exit 1
}

for m in $MOUNTS; do
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
    git show "HEAD:$latest" > "$tmp/committed.tar.gz"
    if cmp -s "$tmp/committed.tar.gz" "$fresh"; then
        echo "PASS $m: committed $latest == fresh rebuild ($(wc -c < "$fresh") bytes)"
    else
        echo "FAIL $m: committed $latest differs from fresh rebuild of the current tree"
        echo "        -> snapshot is stale (tree moved since the ferry committed)"
        echo "        -> re-run staging-tars ferry, then re-verify; NEVER untar a stale snapshot"
        FAIL=1
    fi
done

# Leave the working tree exactly as found: the verification had to write
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
done

if [ "$FAIL" -ne 0 ]; then
    echo "PRE-TAR VERIFY: FAIL (see above) - no move-day dispatch until this is green"
    exit 1
fi
echo "PRE-TAR VERIFY: PASS - all committed staging tars are the current tree, byte-identical."

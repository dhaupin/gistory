#!/usr/bin/env bash
# Tar ferry for the struct-family staging mounts.
#
# Rebuilds each staging mount's nested .git from its most recent committed
# seed tarball under horcrux/tars/ (or a fresh init when no seed exists yet),
# commits the mount's current tree as ONE snapshot commit with a fixed
# author/committer/date so the commit hash is byte-reproducible, then
# packs the .git dir itself with deterministic tar flags (sorted paths,
# owner=0/group=0/numeric, epoch mtime) and gzip -n.
#
# The result lands under horcrux/tars/<mount>-git-<TODAY>.tar.gz. Byte
# determinism means a fresh ferry run over an unchanged tree produces the
# exact same tar (no index/hooks/COMMIT_EDITMSG/log churn: all rebuilt
# surfaces are deleted before packing), so a workflow commit that would
# be a no-op simply doesn't happen.
set -euo pipefail

cd "$(dirname "$0")/.."      # repo root
TODAY="$(date -u +%F)"
# poststruct + monoforge only: eyestruct graduated upstream
# (dhaupin/eyestruct) and its mount + tar chain retired 2026-10-27.
MOUNTS="poststruct-staging monoforge-staging"
GIT_NAME="Codebuff"
GIT_EMAIL="noreply@codebuff.com"
GIT_DATE="2026-10-26T00:00:00Z"

REBUILT=".git/hooks .git/description .git/COMMIT_EDITMSG .git/logs .git/branches .git/index .git/packed-refs .git/info"

for m in $MOUNTS; do
    seed=""
    # newest seed tarball by filename suffix (date; lexical sort is enough).
    # The archive/ dir is IN the search: today's own tar is excluded as seed,
    # so on same-day re-runs (e.g. right after a path reorg) the chain must be
    # able to fall back to a superseded seed in archive/ — a fresh init here
    # would silently orphan the mount's snapshot history.
    for s in $(ls horcrux/tars/${m}-git-*.tar.gz \
                    horcrux/tars/archive/${m}-git-*.tar.gz 2>/dev/null | sort -r); do
        if [ "$s" != "horcrux/tars/${m}-git-${TODAY}.tar.gz" ]; then
            seed="$s"; break
        fi
    done
    rm -rf "$m/.git"
    mkdir -p "$m"
    if [ -n "$seed" ]; then
        echo "seed $m from $seed"
        tar -xzf "$seed" -C "$m"
    else
        echo "no seed for $m; fresh init (main)"
        git -C "$m" init -q -b main
    fi
    git -C "$m" symbolic-ref HEAD refs/heads/main
    # A bomb of loose objects from `git add -A` can trip `git gc --auto` at
    # the commit below, and the background gc then holds/creates
    # .git/objects/maintenance.lock while the tar walks that same directory
    # (the exact race that failed the ferry: "tar: .git/objects/maintenance
    # .lock: File removed before we read it"). The mount's .git is rebuilt
    # from seed on every ferry anyway, so auto-maintenance here is pure race
    # surface and zero value: disable it before anything that writes.
    git -C "$m" config gc.auto 0
    git -C "$m" config gc.writeCommitGraph false
    git -C "$m" add -A
    # Day-boundary no-op: on a NEW UTC day the seed loop no longer excludes
    # yesterday's tar, so HEAD (fixed date) may already equal the mount tree.
    # `git commit` would exit 1 there and the whole ferry would die (seen
    # 2026-10-27 01:59Z). Nothing-to-commit is the byte-identical case: skip
    # the commit, the fresh pack below still reproduces the seed exactly.
    if git -C "$m" diff --cached --quiet; then
        echo "snapshot: $m unchanged since seed (no-op commit skipped)"
    else
        GIT_AUTHOR_NAME="$GIT_NAME" GIT_AUTHOR_EMAIL="$GIT_EMAIL" \
        GIT_COMMITTER_NAME="$GIT_NAME" GIT_COMMITTER_EMAIL="$GIT_EMAIL" \
        GIT_AUTHOR_DATE="$GIT_DATE" GIT_COMMITTER_DATE="$GIT_DATE" \
            git -C "$m" commit -q \
                -m "snapshot: pre-tar state of ${m} (2026-10-26, Codebuff-carry)"
    fi
    for r in $REBUILT; do
        rm -rf "$m/$r";
    done
    tar --sort=name --numeric-owner --owner=0 --group=0 --mode=u+rwX,go+rX,go-w --mtime=@0 \
        -cf - -C "$m" .git | gzip -n > "horcrux/tars/${m}-git-${TODAY}.tar.gz"
    echo "tar: horcrux/tars/${m}-git-${TODAY}.tar.gz  $(git -C "$m" log -1 --format=%H)"
done

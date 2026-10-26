#!/usr/bin/env bash
# Tar ferry for the struct-family staging mounts.
#
# Rebuilds each staging mount's nested .git from its most recent committed
# seed tarball under horcrux/ (or a fresh init when no seed exists yet),
# commits the mount's current tree as ONE snapshot commit with a fixed
# author/committer/date so the commit hash is byte-reproducible, then
# packs the .git dir itself with deterministic tar flags (sorted paths,
# owner=0/group=0/numeric, epoch mtime) and gzip -n.
#
# The result lands under horcrux/<mount>-git-<TODAY>.tar.gz. Byte
# determinism means a fresh ferry run over an unchanged tree produces the
# exact same tar (no index/hooks/COMMIT_EDITMSG/log churn: all rebuilt
# surfaces are deleted before packing), so a workflow commit that would
# be a no-op simply doesn't happen.
set -euo pipefail

cd "$(dirname "$0")/.."      # repo root
TODAY="$(date -u +%F)"
MOUNTS="poststruct-staging eyestruct-staging monoforge-staging"
GIT_NAME="Codebuff"
GIT_EMAIL="noreply@codebuff.com"
GIT_DATE="2026-10-26T00:00:00Z"

REBUILT=".git/hooks .git/description .git/COMMIT_EDITMSG .git/logs .git/branches .git/index .git/packed-refs .git/info"

for m in $MOUNTS; do
    seed=""
    # newest seed tarball by filename suffix (date; lexical sort is enough)
    for s in $(ls horcrux/${m}-git-*.tar.gz 2>/dev/null | sort -r); do
        if [ "$s" != "horcrux/${m}-git-${TODAY}.tar.gz" ]; then
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
    GIT_AUTHOR_NAME="$GIT_NAME" GIT_AUTHOR_EMAIL="$GIT_EMAIL" \
    GIT_COMMITTER_NAME="$GIT_NAME" GIT_COMMITTER_EMAIL="$GIT_EMAIL" \
    GIT_AUTHOR_DATE="$GIT_DATE" GIT_COMMITTER_DATE="$GIT_DATE" \
        git -C "$m" add -A
    GIT_AUTHOR_NAME="$GIT_NAME" GIT_AUTHOR_EMAIL="$GIT_EMAIL" \
    GIT_COMMITTER_NAME="$GIT_NAME" GIT_COMMITTER_EMAIL="$GIT_EMAIL" \
    GIT_AUTHOR_DATE="$GIT_DATE" GIT_COMMITTER_DATE="$GIT_DATE" \
        git -C "$m" commit -q \
            -m "snapshot: pre-tar state of ${m} (2026-10-26, Codebuff-carry)"
    for r in $REBUILT; do
        rm -rf "$m/$r";
    done
    tar --sort=name --numeric-owner --owner=0 --group=0 --mode=u+rwX,go+rX,go-w --mtime=@0 \
        -cf - -C "$m" .git | gzip -n > "horcrux/${m}-git-${TODAY}.tar.gz"
    echo "tar: horcrux/${m}-git-${TODAY}.tar.gz  $(git -C "$m" log -1 --format=%H)"
done

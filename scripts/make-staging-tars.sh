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

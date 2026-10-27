# verification is stable even on the commit day: today's committed tar is
# compared against a rebuild from the same non-today seed it was built
# from, and determinism guarantees byte identity when the tree is unchanged.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
# poststruct + monoforge only: eyestruct retired to dhaupin/eyestruct
# (mount + tar chain gone 2026-10-27).
MOUNTS="poststruct-staging monoforge-staging"
FAIL=0

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "== Pre-tar verify: committed staging tars vs fresh rebuild =="

# Fresh rebuild first, one shot, all mounts (the ferry is deterministic;

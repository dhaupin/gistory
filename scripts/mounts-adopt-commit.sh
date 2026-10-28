#!/usr/bin/env bash
# mounts-adopt commit: the whitelisted landing. Only the derived identity set
# plus the three appended work logs may be staged; anything else in the tree
# refuses the commit (the guard that caught the earlier lane-war classes).
set -euo pipefail
git config user.name Codebuff
git config user.email noreply@codebuff.com
git add monoforge-staging/web/public/icon.svg \
        monoforge-staging/web/public/favicon-32.png \
        monoforge-staging/web/public/icon-192.png \
        monoforge-staging/web/public/icon-512.png \
        monoforge-staging/web/public/apple-touch-icon.png \
        monoforge-staging/web/public/og-image.png \
        monoforge-staging/docs/icon.svg \
        monoforge-staging/docs/og-image.png \
        monoforge-staging/scripts/brand-mark.json \
        monoforge-staging/labs/TASKS.md \
        poststruct-staging/docs/icon.svg \
        poststruct-staging/docs/favicon-32.png \
        poststruct-staging/docs/icon-192.png \
        poststruct-staging/docs/icon-512.png \
        poststruct-staging/docs/apple-touch-icon.png \
        poststruct-staging/web/public/icon.svg \
        poststruct-staging/web/public/favicon-32.png \
        poststruct-staging/web/public/icon-192.png \
        poststruct-staging/web/public/icon-512.png \
        poststruct-staging/web/public/apple-touch-icon.png \
        poststruct-staging/scripts/brand-mark.json \
        poststruct-staging/labs/TASKS.md \
        labs/TASKS.md
git status --porcelain > /tmp/changes.txt
bad="$(grep -Ev '^(M |A )' /tmp/changes.txt || true)"
if [ -n "$bad" ]; then echo "UNEXPECTED WORKTREE STATE; refusing:"; echo "$bad"; exit 1; fi
git commit -m "mounts identity adopt: the traced icon sets + labeled og cards + authored brand seals, derived from the committed logos and sha-gated"
git push
echo "landing complete"

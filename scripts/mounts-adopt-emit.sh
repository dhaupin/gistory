#!/usr/bin/env bash
# mounts-adopt emit: run the family adopt lane on both mounts from the
# committed art, then render monoforge's og cards. poststruct runs the lane
# TWICE - docs face (the family-default public dir) and web/public - and the
# two faces must agree byte-for-byte before the pass continues.
set -euo pipefail
( cd monoforge-staging && node scripts/adopt-icons.mjs web/public/monoforge-logo.jpg )
( cd poststruct-staging && node scripts/adopt-icons.mjs web/public/poststruct-logo.jpg )
( cd poststruct-staging && node scripts/adopt-icons.mjs web/public/poststruct-logo.jpg --public-dir web/public )
for f in icon.svg favicon-32.png icon-192.png icon-512.png apple-touch-icon.png; do
  cmp "poststruct-staging/docs/$f" "poststruct-staging/web/public/$f"
done
echo "poststruct face parity ok (docs == web/public)"
( cd monoforge-staging && node web/scripts/build-og.mjs )
echo "emit ok: icon sets + og cards derived from the committed logos"

#!/usr/bin/env bash
# mounts-adopt gate: the 20-file sha contract for the derivation the harness
# ran locally (2026-10-28). Any drift refuses the pass - never commit by
# hand, never guess past the ledger.
set -euo pipefail
gate() {
  got="$(git hash-object "$1")"
  if [ "$got" != "$2" ]; then echo "GATE FAIL $1 = $got != $2"; exit 1; fi
  echo "ok: $1 = $got"
}
# monoforge face + docs copy + og cards + authored seal
gate monoforge-staging/web/public/icon.svg             bd2ab91d8e4c5d6790e046c9fa73c1596a9b8a4e
gate monoforge-staging/web/public/favicon-32.png       2baa3aeabdf97fd6366820bdef42dee4159efba9
gate monoforge-staging/web/public/icon-192.png         628c6ba5cc257f7cfbe49ed50b7aa2f97b8716ce
gate monoforge-staging/web/public/icon-512.png         ef3dfaf25f01e6c0e05b6fca90e0eb1088c2d9af
gate monoforge-staging/web/public/apple-touch-icon.png af6602acd3bd6281bd07afefc38274e68058dacd
gate monoforge-staging/web/public/og-image.png         3d42c2189156691a98a8e79ca9f020839cfb007c
gate monoforge-staging/docs/icon.svg                   bd2ab91d8e4c5d6790e046c9fa73c1596a9b8a4e
gate monoforge-staging/docs/og-image.png               5cb00e7491b3235ecb32f585d666174caafaca35
gate monoforge-staging/scripts/brand-mark.json         ad197eee8ebfb2ca902aba3dc23005b19562dd39
# poststruct: docs face AND web/public re-derive byte-identically
gate poststruct-staging/docs/icon.svg                  2300bc6273e61b14d357be0e416d366f42e817a7
gate poststruct-staging/docs/favicon-32.png            f94874b60a63b7b304a61b7430cd5c90794d6e41
gate poststruct-staging/docs/icon-192.png              6edaca25f2551de8ad2ab2b48dd391d1e888d81f
gate poststruct-staging/docs/icon-512.png              f5f3cc78d4f3c7e6c659582372d1493d5e13f7d4
gate poststruct-staging/docs/apple-touch-icon.png      4960e53f80c383906c5d077f23363b6f49a10ce7
gate poststruct-staging/web/public/icon.svg            2300bc6273e61b14d357be0e416d366f42e817a7
gate poststruct-staging/web/public/favicon-32.png      f94874b60a63b7b304a61b7430cd5c90794d6e41
gate poststruct-staging/web/public/icon-192.png        6edaca25f2551de8ad2ab2b48dd391d1e888d81f
gate poststruct-staging/web/public/icon-512.png        f5f3cc78d4f3c7e6c659582372d1493d5e13f7d4
gate poststruct-staging/web/public/apple-touch-icon.png 4960e53f80c383906c5d077f23363b6f49a10ce7
gate poststruct-staging/scripts/brand-mark.json        bb2ede81eb4f5a219690497903f8a26d50f5b3b5
echo "gate: the whole derived set is byte-identical to the harness contract"

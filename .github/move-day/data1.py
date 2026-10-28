# lane patch pairs for scripts/verify-staging-tars.sh (replay-proven)
TARGET = "scripts/verify-staging-tars.sh"
PIN = "ed1a21cd3401c589d75feb70fbcf28d1604b1815"
PAIRS = [
  ("""# (mount + tar chain gone 2026-10-27).
""", """# (mount + tar chain gone 2026-10-27).
boot_tars() { echo "mounts/public/${1%-staging}/boot/tars"; }  # /mounts reorg 2026-10-28
"""),
  ("""}

for m in $MOUNTS; do
""", """}

for m in $MOUNTS; do
    boot="$(boot_tars "$m")"
"""),
  ("""    latest="$(git ls-tree HEAD "horcrux/tars/${m}-git-"* 2>/dev/null | awk '{print $4}' | sort | tail -1 || true)"
    fresh="horcrux/tars/${m}-git-$(date -u +%F).tar.gz"
""", """    latest="$(git ls-tree HEAD "$boot/"${m}-git-*.tar.gz 2>/dev/null | awk '{print $4}' | sort | tail -1 || true)"
    fresh="$boot/${m}-git-$(date -u +%F).tar.gz"
"""),
  ("""        echo "FAIL $m: no committed tar under HEAD:horcrux/tars/ - run the staging-tars ferry first"
""", """        echo "FAIL $m: no committed tar under HEAD:$boot - run the staging-tars ferry first"
"""),
  ("""    f="horcrux/tars/${m}-git-${today}.tar.gz"
""", """    boot="$(boot_tars "$m")"
    f="$boot/${m}-git-${today}.tar.gz"
"""),
]

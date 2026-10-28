# lane patch pairs for .github/workflows/mount-stone-mirror.yml (replay-proven)
TARGET = ".github/workflows/mount-stone-mirror.yml"
PIN = "97dd8530e1fa038afc4b7b10ac9823e061ecfc6d"
PAIRS = [
  ("""          # mirrors in its own horcrux/ now.
""", """          # mirrors in the boot registry now (the /mounts reorg, 2026-10-28).
"""),
  ("""                 poststruct-staging/horcrux/poststruct-p_wordprint-2026.svg
""", """                 mounts/public/poststruct/boot/stone/poststruct-p_wordprint-2026.svg
"""),
]

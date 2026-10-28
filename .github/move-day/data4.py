# lane patch pairs for .github/workflows/mono-web-emit.yml (replay-proven)
TARGET = ".github/workflows/mono-web-emit.yml"
PIN = "1a74137c6fbae84ab0a216b4f040333d2f4f61e1"
PAIRS = [
  ("""          const og = fs.readFileSync('monoforge-staging/horcrux/handoff/og-image-src.svg', 'utf8')
""", """          const og = fs.readFileSync('mounts/public/monoforge/boot/handoff/og-image-src.svg', 'utf8')
"""),
]

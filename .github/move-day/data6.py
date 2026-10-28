# lane patch pairs for .github/workflows/mono-rig-emit.yml (replay-proven)
TARGET = ".github/workflows/mono-rig-emit.yml"
PIN = "37a1adfb53a42ad2cd246b61e734c2c2818f852c"
PAIRS = [
  ("""          tar -xzf monoforge-staging/horcrux/monoforge-0.9.0-lock.tar.gz -C /tmp/lockbase
""", """          tar -xzf mounts/public/monoforge/boot/tars/monoforge-0.9.0-lock.tar.gz -C /tmp/lockbase
"""),
  ("""          tar -xzf monoforge-staging/horcrux/monoforge-0.9.0-lock.tar.gz -C /tmp/locktest
""", """          tar -xzf mounts/public/monoforge/boot/tars/monoforge-0.9.0-lock.tar.gz -C /tmp/locktest
"""),
]

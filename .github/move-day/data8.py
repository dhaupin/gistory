# lane patch pairs for .github/workflows/doctor-fix-emit.yml (replay-proven)
TARGET = ".github/workflows/doctor-fix-emit.yml"
PIN = "0771f36d74e398c5aced017c6d22cee675472165"
PAIRS = [
  ("""          actual="$(sha256sum monoforge-staging/horcrux/monoforge-0.9.0-lock.tar.gz | cut -d' ' -f1)"
""", """          actual="$(sha256sum mounts/public/monoforge/boot/tars/monoforge-0.9.0-lock.tar.gz | cut -d' ' -f1)"
"""),
  ("""          tar -xzf monoforge-staging/horcrux/monoforge-0.9.0-lock.tar.gz -C /tmp/lockbase
""", """          tar -xzf mounts/public/monoforge/boot/tars/monoforge-0.9.0-lock.tar.gz -C /tmp/lockbase
"""),
  ("""          tar -xzf monoforge-staging/horcrux/monoforge-0.9.0-lock.tar.gz -C /tmp/locktest
""", """          tar -xzf mounts/public/monoforge/boot/tars/monoforge-0.9.0-lock.tar.gz -C /tmp/locktest
"""),
]

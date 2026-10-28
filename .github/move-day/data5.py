# lane patch pairs for .github/workflows/monoforge-ferry.yml (replay-proven)
TARGET = ".github/workflows/monoforge-ferry.yml"
PIN = "b0cf68ffff1616861574ee84913c070b78f6cd33"
PAIRS = [
  ("""# adds on top - labs/, horcrux/README - are not in the lock, so they
""", """# adds on top - labs/, boot tars (the /mounts registry) - are not in the lock, so they
"""),
  ("""          cp /tmp/mf-lock.tar.gz monoforge-staging/horcrux/monoforge-0.9.0-lock.tar.gz
""", """          cp /tmp/mf-lock.tar.gz mounts/public/monoforge/boot/tars/monoforge-0.9.0-lock.tar.gz
"""),
]

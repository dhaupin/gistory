# lane patch pairs for .github/workflows/identity-emit.yml (replay-proven)
TARGET = ".github/workflows/identity-emit.yml"
PIN = "d37624cf0ca25e5c398d39d9a61844fa6bb24467"
PAIRS = [
  ("""            cat "monoforge-staging/horcrux/handoff/identity-tail.$c.part"
""", """            cat "mounts/public/monoforge/boot/handoff/identity-tail.$c.part"
"""),
  ("""            cat "monoforge-staging/horcrux/handoff/identity-layout.$c.part"
""", """            cat "mounts/public/monoforge/boot/handoff/identity-layout.$c.part"
"""),
]

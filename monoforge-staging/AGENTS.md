# AGENTS.md - monoforge

## Identity
- **Name:** monoforge (the fleet factory)
- **Repo:** dhaupin/monoforge
- **Core law:** generated green is never shipped; the doctor refuses
  placeholder text, missing entries, and broken gates; the lock refuses a
  dirty or failing tree.

## Mechanical conventions (this repo)
- Four factory verbs, one package, plus one opt-in lane: `new`
  (stamp from templates/), `doctor` (the truth battery), `cut`
  (release cuts: component-family workspace from a cutlist against a
  living lib), `lock` (doctor then archive), and `lint-packs` (the
  packstruct passthrough over the repo's own install, ready now as a
  loud refusal until the factory's own packs land). All zero-dep Node
  >=20 ESM in `src/`, CLI in `bin/forge.mjs`.
- The cut law: an unmapped internal dependency refuses loudly; shortfall
  lazies must be declared in cutlist.json and ship as documented call-site
  degrades (per-package README carries the list: absence is honest).
- Templates are extracted from PROVEN trees (poststruct + packstruct as
  of 2026-10-24). Add a block only when two instances prove it; a
  template block with a single instance is a bet, and the doctor cannot
  verify bets.
- The negative test in `test/run.mjs` asserts the refusal paths (bad
  config, stray dir) and the doctor fail (unfilled) / pass (filled) pair.
  Update the test in the same commit as any check change; run
  `npm test` first.
- The battery is one verb for CI and humans: `npm run check` (test +
  docs gates + language gate). The packstruct leg is deliberately not
  wired into check until the factory's own packs land; until then
  `monoforge lint-packs` answers exit 2 as the readiness probe.
- The icon lane is the family's parameterized one: `npm run icons:adopt`
  (scripts/adopt-icons.mjs + scripts/brand-mark.json authored seal),
  same contract as gistory#17/eyestruct. Derived icon bytes are
  generated, not hand-drawn: the seal + the source art are the record.
- All prose submits to the voice law: zero dashes of any kind, no
  AI-cliche constructions, plain declarative sentences only.

## Release
- 0.9.0 = current manual npm. 1.0.0 flips OIDC; publish.yml refuses 0.x.vè(
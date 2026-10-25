# packs/ - the extension-surface directory

This directory is the shell's slot for **packs**: optional, self-contained
extension bundles that adopters (or you) drop in to teach a host new
behaviors. It ships EMPTY on purpose - the `packs/` contract is a family
spec, not shell content.

## The shape (the 30-second version)

```
packs/public/<pack-name>/     tracked, shipped packs
packs/local/<pack-name>/      gitignored, private packs (same semantics,
                              different visibility - nothing about a pack's
                              loading changes based on where it lives)
  pack.json                   REQUIRED manifest (schemaVersion 1)
  <entry file>                REQUIRED - the module pack.json's "entry" names
```

`pack.json` at SPEC v1: `schemaVersion` (must be 1), `name` (kebab-case,
MUST match its directory name), `description`, `version` (the pack's OWN
semver - never bump it for shell releases), `entry` (relative path, must
exist), optional `armedByKey`, plus acknowledged host-owned keys
(`env` claims block, `plugins`, `package`). Extra keys/files are allowed.

## Who owns what (the struct family)

- **The spec** lives in SPEC v1,
  [dhaupin/packstruct](https://github.com/dhaupin/packstruct) - the frozen
  manifest table, entry profiles, lifecycle norms, and the `implements:
  packstruct@1` pin convention.
- **packstruct** is also the linter: `packstruct lint <packs-dir>` enforces
  the manifest grammar + directory contract (exit 0 conforming / 1
  violations / 2 usage error). Adopting repos pin the SPEC commit and wire
  the lint lane in CI - see dhaupin/crashtest's lane for the working shape
  (pinned-SHA clone, lint + receipt byte-compare).
- **dhaupin/crashtest** is the `scenario`-profile reference implementation:
  its loaders execute hostile scenarios in-process against a fake transport
  (the fake transport IS the product - zero sockets), and its docs + packs
  (`packs/public/*/pack.json`) double as the real-world corpus packstruct
  lints against.
- **dhaupin/poststruct** is the `check`-profile sibling: declarative,
  pure-reading verifiers over files on disk. It is queued on the same SPEC;
  its birth thread reserves its column in the shared refusal matrix.

## Shell rules for this directory

- One manifest grammar: manifest shape validates ONCE. If your host adds
  meaning to a key, that is a host-owned extension - the spec's host-owned
  list extends in a patch revision, not a schemaVersion bump.
- Adopters wire a lint lane against a PINNED packstruct commit; a floating
  linter is a random CI. When the pinned SPEC moves, re-derive in one
  reviewed commit.
- Conformance is LIVE here: the loader (scripts/run-packs.cjs) passes
  `packstruct audit-conformance . --loader "node scripts/run-packs.cjs
  {packs}"` 8/8 - it enforces the SECTION 2 grammar AT LOAD (kebab name +
  dir match + collision, schemaVersion, dotted version, description,
  relative entry), accepts ESM-default entries, and runs the campaign
  with the same exit contract the audit reads. The lane rides `npm run
  conform:packs` (packstruct pinned 1.0.0 as an exact devDependency, the
  crashtest convention).
- Pack semver is per-pack: minor shell version bumps don't drag packs along
  (crashtest's house policy, now yours).

Related docs: [../AGENTS.md](../AGENTS.md) (map + house rules),
[../MANIFEST.md](../MANIFEST.md) (the receipts this rig copied),
[../CHANGELOG.md](../CHANGELOG.md) (version history - and note packs are
versioned independently of it).

## The packs eyestruct itself ships (2026-10-25)

Same shape as this spec declares (pack.json spec v1, entry module, moduleCtx
vocabulary, nothing imported from the target), the crashtest verdict
taxonomy, and a committed verdict baseline:

- **`public/eye-shapes/`** - the daemon's own adversarial pack. Attacks the
  CLI's browserless surface: ledger tampering (corrupt JSON, duplicate ids,
  control-char payloads), manifest corruption, unexplained and dangling
  visual memory, unexplained-note enforcement, missing-baseline and
  capability refusals. Browser-class captures are a DOCUMENTED accepted-risk
  bound (`bounds['browser-class-in-ci']`), never a silent skip - the bound
  is docketed or the pack refuses to skip.
- **`public/eye-ci-gate/`** - the crashledger-semantics verifier for any
  repo's gate. Builds disposable fixture repos, attacks the gate, judges by
  the exit contract alone: unexplained drift fails, dangling canon fails
  louder, schema integrity is enforced, and an explained tree passes. Any
  struct-leg repo implementing the eye gate passes unchanged.
- **`public/eye-text-leg/`** - the poststruct integration. Text is the
  cheaper diff so it gates first: control characters refused at the ledger
  write surface (UNSAFE_TEXT - DEL rides argv, so the app guard is the last
  line), clean notes round-trip through the CLI's own reader, and the
  manifest stays strict-family schema.

The runner is `scripts/run-packs.cjs` (`npm run packs`): zero-dependency,
moduleCtx-armed, drives the REAL CLI as a subprocess, and enforces
`packs/eye-ledger.json` - a new EXPLOITED fails, a verdict change against a
previously recorded row fails, new rows adopt explicitly with
`npm run packs -- --adopt`. `.eyes/` artifacts are out of the pack's scope:
the gate (and its CI lane) owns those.


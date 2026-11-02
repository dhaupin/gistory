# Changelog

All notable changes to `gistory-sync` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and
this project adheres to [Semantic Versioning](https://semver.org/). Old synced
payloads stay mergeable within the same major: optional fields added in a
minor keep old copies mergeable, so devices running different package
versions converge in one chain.

## [Unreleased]

### Fixed

- **The expected-set probe no longer parses `npm pack --dry-run --json`.** The
  phone's npm answers that probe with empty stdout even under `--loglevel=error`,
  so the ladder's `JSON.parse` failed and read as a capability failure on a clean
  tree (the `always-auth` warning was a red herring on stderr). The ladder now
  derives the expected set from a REAL `npm pack` of the checkout, listed by the
  same `tarList` the served tarball already goes through - the code path the
  forbidden scan proved works on the phone.

- **The staged publish `.npmrc` no longer writes the deprecated `always-auth`
  line.** npm >=9 warns `Unknown project config "always-auth"` on it, and that
  warning reaches the child processes the `prepublishOnly` gate spawns. The
  staged file is now exactly one line (the `${NPM_TOKEN}` expansion).

### Added

- **An offline test for the vendored phone publish lane
  (`scripts/ship-from-download.cjs`).** The lane itself was already committed
  byte-identical from the family copy source; it had no test here. This adds
  `test/ship-from-download.test.cjs` (temp dirs + an injected runner, no
  network) and runs it in CI, proving the lane assembles + refuses correctly
  and that the publish token never lands in a staged file, in argv, or in the
  log. The wrong-folder-zip case (`NOT_A_PACKAGE_TREE`, the Android
  `<repo>-main/<repo>-main` extraction shape) is one of the named refusals it
  covers.

### Changed

- **Changelog + release-notes standardized to the family shape.** `CHANGELOG.md`
  is now Keep-a-Changelog end to end (a `## [Unreleased]` block over
  `## [version] - date` sections) and `scripts/release-notes.cjs` is the
  family's single superset extractor: it reads the KAC heading, still reads the
  older bare (`## 1.2.0`) and v-prefixed (`## v1.2.0`) forms, closes the
  version token so `## [1.2.0]` never matches a `## [1.2.0-rc.1]`, and refuses
  a version with no section by name. One extractor across the family means one
  release-body shape everywhere.

### Fixed

- **The release ladder no longer races registry propagation, nor false-flags a
  branch-name `target_commitish`** - both surfaced by the crashtest 1.2.0 live
  cut. `scripts/verify-release.cjs` polls `dist-tags.latest` **and** the version
  entry through npm's post-publish propagation window instead of reading once
  (the first read saw the old `latest`), and the `release` job retries
  `npm pack <pkg>@<ver>` the same way (it read `ETARGET: no matching version`
  seconds after publish). The release check now accepts GitHub's
  `target_commitish` default-branch name and treats only a 40-hex SHA as a
  commit claim (a branch name is not drift; the tag is the identity). Two pins
  in the release-verify leg hold both fixes.

### Changed

- The publish lane adopts the family release ladder (eyestruct@4e2b552): one
  `publish.yml` with three jobs — `publish` (0.x refused, tag==version gate,
  `npm publish --provenance`) → `release` (the GH release body extracted from
  the changelog via `scripts/release-notes.cjs`, refused if empty) → `verify`
  (`scripts/verify-release.cjs` re-asserts the served tarball's sha512 against
  the registry integrity, provenance presence, the full pack ladder, and the
  release object's target commit). The separate `release.yml` folds into the
  ladder's `release` job. The `release` job also attaches the served tarball
  to the GitHub release (`npm pack gistory-sync@<version>`), and `verify`
  asserts the asset's sha512 equals the registry integrity - the GH release
  and the npm artifact are the same bytes. The pack ladder also runs offline
  every push (`test/release-verify.test.cjs`, wired into `prepublishOnly` as
  `release:verify`).
- gistory is no longer the family's factory (forge-role decouple). The
  staging mounts (`monoforge-staging/`, `poststruct-staging/`) and the family
  registry (`mounts/`, incl. the snapshot tars) are removed — poststruct and
  monoforge graduated to their own repos and are the source of truth, each
  with its own CI. The forge-role workflows retire (`monoforge-ferry`,
  `staging-tars`, `mount-stone-mirror`, `mono-web-emit`, `mono-rig-emit`,
  `doctor-fix-emit`, `identity-emit`) along with the dead tar scripts and the
  family-stone cutter. `ci.yml` drops the `staging-hosts` job and the
  `poststruct-staging` install step; `framework-gate.mjs` drops the poststruct
  TEXT/TEXT-REF legs; `stone-ferry.yml` now re-cuts gistory's own stone only.
  Every gistory self-CI lane (the verify job, docs, crashtest, migrate, the
  eyestruct EYES-ART/EYES-MEM legs, `birth-gate.mjs`) stays. The factory role
  moves to railyard; the other forge machinery is left in place for now.

### Fixed

- The docs lane goes green again: `docs.yml`'s `build` job had failed on
  every push since 2026-10-27 because the ferry pinned `freestruct@1.1.0`,
  whose `--strict` internal-link checker resolved a root-absolute nav href
  (`/gistory/why`) against the output root instead of stripping the
  configured `basePath`, so every nav link on the baseurl'd docs site read
  as broken and `--strict` exited 1. freestruct 1.2.0 lands the fix (the
  checker now strips the exact configured `basePath` before resolving;
  freestruct#32). The pin rides to `^1.2.0` and the `docs/ci.md` ferry claim
  tracks it.

### Added

- The staging integration branch is now a permanent CI surface (gistory#30):
  `ci.yml` runs on push to `staging` as well as `main`, `docs.yml` watches
  both but its deploy job is gated to `main` (`if: github.ref ==
  'refs/heads/main'`) so a green build on staging never publishes the live
  docs site, and a new `staging-ff-sync.yml` fast-forwards `staging` to
  `main` after every promotion (non-destructive refspec; a divergence fails
  the job instead of rewriting history). The remaining write-side workflows
  (`migrate.yml`, `stone-ferry.yml`, `mono-web-emit.yml`, `staging-tars.yml`,
  `monoforge-ferry.yml`, `mount-stone-mirror.yml`, `tasks-insert.yml`) keep
  their `main`-only triggers deliberately: widening them would let a
  staging-era commit reach D1 or a live surface before promotion, which is
  the trap the issue named.
- **The lint lane goes green (gistory#30).** The vendored family scripts
  (`scripts/unwrap-prose.cjs`, `scripts/ship-from-download.cjs`) are copied
  byte-as-is from the eyestruct copy source, but the flat ESLint config was
  still grading them as this repo's TS/React code - 9 errors (CJS `require`,
  the sanitizer's deliberate control-character regexes, dead buffer vars) had
  left `staging`'s CI red on the Lint step, which undercuts the point of a
  permanent CI surface. They are ignored now (the copy contract needs the
  bytes identical, so editing them is not an option); the lane reports
  0 errors, 5 advisory warnings.

- The supporting trio lands on both surfaces: the landing site gains
  `/why` (the problem: good prompts are written once and lost), `/what`
  (what Gistory is, as its parts: library, templates, organization,
  sync), and `/about` (who builds it, the struct family, the license) -
  wired through `ssr.config.js` + `src/AppLayout.tsx`, linked from the
  lander nav. The docs tree gains `docs/why.md`, `docs/what.md`, and
  `docs/about.md`, reachable from a new docs nav "About" section.

### Changed

- **The rig rides prestruct `^1.2.0`** (was `^1.1.0`), taking the
  react-router 7 prerender seam fix (prestruct#68). The root app pins
  react-router-dom 7 (`^7.18.4`, real ESM) and sets
  `ssr.noExternal: ['react-router-dom', 'react-router']` - exactly the shape
  that hit the two-instance seam (the engine's `StaticRouter` and the app's
  router loading as separate module instances, each with its own React
  contexts). 1.2.0 loads `StaticRouter` through the app's own Vite SSR
  registry, so the two now share one instance; `ssr.noExternal` is kept
  (still required to keep the app's `react-router-dom` in Vite's SSR module
  graph). The root app runs React 19, and 1.2.0 deliberately bounds its
  react peer to `>=18 <19` (prestruct#58 ask 1; the react-19 lane is
  prestruct 1.3.0), so a targeted `overrides` entry
  (`prestruct.react: "$react"`) lets the proven-good React 19 tree satisfy
  the peer while the ceiling stays honest. The lock is edited in place
  (fetch-don't-transport; the registry-derived form churns 400+ unrelated
  optional/peer lines under a newer npm). Build re-verified end to end with
  the prerender cache cleared: `Done. 6/6 pages rendered`, audit 0 failures.

- `Message` edits carry their own timestamp: merge compares
  `updatedAt ?? createdAt` for both the tombstone check and the win
  check, so a content edit wins by recency regardless of which device
  made it. Older payloads without the optional field stay mergeable
  unchanged (the fallback keeps them on the shared base).

## [0.9.0] - 2026-10-22

The engine's first npm release, published from the gistory monorepo
([dhaupin/gistory](https://github.com/dhaupin/gistory)) where the app, relay,
and red-team suite share one verify battery with it.

### Added

- **E2EE sync engine** — `SyncAgent`: PBKDF2 (`passphrase + chainId`) →
  AES-GCM-256 key derivation, full-state encrypted push/pull against a blind
  relay, `GS1-…` pairing tokens (chain id + write secret), and the storage
  seam (IndexedDB, localStorage fallback) that runs in Node ≥ 18, web
  workers, and the browser.
- **Pure merge rules** — `mergePayload` & friends: timestamped
  last-write-wins with a deterministic deviceId tie-breaker, tombstones so
  deletes sync and never resurrect, per-key merges for settings, variables,
  and synced view-state (drag order + collapse).
- **QoS scheduling** — `SyncQos`: debounced pushes, mid-push coalescing into
  one follow-up, exponential backoff with jitter honoring the server's
  `Retry-After`, terminal-failure awareness so refused pushes idle instead
  of looping.
- **Shared models & helpers** — threads/projects/messages, deleted
  registries, variable pools with dead-scope sweeping, view-state maths
  (`pruneView`, `rankBetween`, `moveWithinSubset`), and sync error shaping.
- **TypeScript declarations** — one self-contained ESM bundle
  (`dist/lib/index.mjs`) plus declaration output in the same tarball.

### Security

- Write auth on every chain: the write secret is minted by the creating
  device, travels in the pairing token, and is stored server-side only as a
  SHA-256 hash — the relay never holds anything derived from the passphrase.
- The relay is blind by design: it sequences and stores ciphertext it cannot
  decrypt; unsecured-chain takeover paths are closed at creation time.

### Notes

- The React app and the relay ship from the monorepo, not from this package.
- Self-hosting the relay, pairing flows, and maintenance runbooks live in
  [DEPLOY.md](https://github.com/dhaupin/gistory/blob/main/DEPLOY.md); user
  documentation at [docs.creadev.org/gistory](https://docs.creadev.org/gistory).
- Releases run on version tags via npm Trusted Publishing (OIDC) — see the
  repo's `AGENTS.md` for the release runbook.

[0.9.0]: https://github.com/dhaupin/gistory/releases/tag/v0.9.0

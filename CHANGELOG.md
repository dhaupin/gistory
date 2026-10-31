# Changelog

All notable changes to `gistory-sync` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and
this project adheres to [Semantic Versioning](https://semver.org/). Old synced
payloads stay mergeable within the same major: optional fields added in a
minor keep old copies mergeable, so devices running different package
versions converge in one chain.

## [Unreleased]

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

- The supporting trio lands on both surfaces: the landing site gains
  `/why` (the problem: good prompts are written once and lost), `/what`
  (what Gistory is, as its parts: library, templates, organization,
  sync), and `/about` (who builds it, the struct family, the license) -
  wired through `ssr.config.js` + `src/AppLayout.tsx`, linked from the
  lander nav. The docs tree gains `docs/why.md`, `docs/what.md`, and
  `docs/about.md`, reachable from a new docs nav "About" section.

### Changed

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

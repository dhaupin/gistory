# Changelog

All notable changes to `gistory-sync` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and
this project adheres to [Semantic Versioning](https://semver.org/). Old synced
payloads stay mergeable within the same major: optional fields added in a
minor keep old copies mergeable, so devices running different package
versions converge in one chain.

## [Unreleased]

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

- **E2EE sync engine** â€” `SyncAgent`: PBKDF2 (`passphrase + chainId`) â†’
  AES-GCM-256 key derivation, full-state encrypted push/pull against a blind
  relay, `GS1-â€¦` pairing tokens (chain id + write secret), and the storage
  seam (IndexedDB, localStorage fallback) that runs in Node â‰¥ 18, web
  workers, and the browser.
- **Pure merge rules** â€” `mergePayload` & friends: timestamped
  last-write-wins with a deterministic deviceId tie-breaker, tombstones so
  deletes sync and never resurrect, per-key merges for settings, variables,
  and synced view-state (drag order + collapse).
- **QoS scheduling** â€” `SyncQos`: debounced pushes, mid-push coalescing into
  one follow-up, exponential backoff with jitter honoring the server's
  `Retry-After`, terminal-failure awareness so refused pushes idle instead
  of looping.
- **Shared models & helpers** â€” threads/projects/messages, deleted
  registries, variable pools with dead-scope sweeping, view-state maths
  (`pruneView`, `rankBetween`, `moveWithinSubset`), and sync error shaping.
- **TypeScript declarations** â€” one self-contained ESM bundle
  (`dist/lib/index.mjs`) plus declaration output in the same tarball.

### Security

- Write auth on every chain: the write secret is minted by the creating
  device, travels in the pairing token, and is stored server-side only as a
  SHA-256 hash â€” the relay never holds anything derived from the passphrase.
- The relay is blind by design: it sequences and stores ciphertext it cannot
  decrypt; unsecured-chain takeover paths are closed at creation time.

### Notes

- The React app and the relay ship from the monorepo, not from this package.
- Self-hosting the relay, pairing floÜË[™XZ[[˜[˜ÙH[˜›ÛÚÜÈ]™H[‚ˆÑTÖK›YJÎ‹ËÙÚ]X‹˜ÛÛKÙ]\[‹ÙÚ\İÜKØ›Ø‹ÛXZ[‹ÑTÖK›Y
NÈ\Ù\‚ˆØİ[Y[][Ûˆ]ÙØÜË˜Ü™XY]‹›Ü™ËÙÚ\İÜWJÎ‹ËÙØÜË˜Ü™XY]‹›Ü™ËÙÚ\İÜJK‚‹H™[X\Ù\È[ˆÛˆ™\œÚ[ÛˆYÜÈšXHœH\İYX›\Ú[™È
ÒQÊH8 %ÙYHBˆ™\ÉÜÈQÑS•Ë›Y›ÜˆH™[X\ÙH[˜›ÛÚË‚‚–ÌKŒNˆÎ‹ËÙÚ]X‹˜ÛÛKÙ]\[‹ÙÚ\İÜKÜ™[X\Ù\ËİYËİŒKŒ
# gistory-sync

[![npm](https://img.shields.io/npm/v/gistory-sync)](https://www.npmjs.com/package/gistory-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.creadev.org%2Fgistory-blue)](https://docs.creadev.org/gistory)
[![app](https://img.shields.io/badge/app-gistory.creadev.org-blue)](https://gistory.creadev.org)

The sync engine behind [Gistory](https://gistory.creadev.org) — a proven,
privacy-first prompt keeper — packaged for reuse: **E2EE multi-device push/pull,
pure merge rules, QoS scheduling, and a storage seam that runs anywhere**.

```ts
import {
  SyncAgent,          // key derivation, E2EE push/pull, pairing tokens
  mergePayload,       // pure LWW + tombstone merge for SyncData
  SyncQos,            // debounced, coalescing, back-off push scheduler
  ensureStorageReady, // IndexedDB storage, localStorage fallback
  pruneView,          // synced arrangement: ranks + collapsed states
  emptyVariables,     // global + per-thread {{variable}} pools
} from 'gistory-sync'
```

## What this is

This package is the **sync engine only** — the exact code the app and its
service worker run, shipped as one ESM bundle with TypeScript declarations:

- **`SyncAgent`** — derives your AES-GCM key from `passphrase + chainId`
  (PBKDF2), encrypts full state, pushes/pulls opaque blobs against a relay,
  and mints/parses `GS1-…` pairing tokens.
- **`mergePayload`** — pure last-write-wins merge (timestamps, with a
  deterministic deviceId tie-breaker), tombstones for safe deletes, and
  view-state for synced drag-order/collapse.
- **`SyncQos`** — the client scheduler: debounced pushes, mid-push coalescing,
  exponential backoff that honors the server's `Retry-After`, never drops a
  failed push.
- **Storage seam** — IndexedDB with a localStorage fallback; reads
  `typeof indexedDB` / `typeof localStorage` at call time, so the same bundle
  runs in Node ≥ 18, any web worker, and the browser.
- **Shared models** — `Thread`, `Project`, `Message`, variables, deleted
  registries, and the settings/variables/view merge helpers.

**Not included:** the React app and the sync relay (Cloudflare Pages Functions
+ D1). They live in [the repo](https://github.com/dhaupin/gistory) and deploy
from it — the package needs nothing they carry.

### The staging mounts in this repo

`eyestruct`, `poststruct`, and `monoforge` are being ferried into their own
standalone repos from **staging trees that live here** (`*-staging/`), because
this repo's CI is the battery each project must pass before move day. Until a
target repo goes online, its `*-staging` tree is that family's source of truth;
this file describes the gistory-sync package, not those trees.

## Install

The release ladder is tag-driven (`0.9.0` first, then OIDC takes over), so the
plain install line resolves from npm **only once the `0.9.0` tag is published**
— until then it can 404 on the registry:

```bash
npm i github:dhaupin/gistory   # git-sourced; works before the npm tag exists
npm i gistory-sync             # after the 0.9.0 tag is up
```

## Quick start

```ts
import { SyncAgent } from 'gistory-sync'

const agent = new SyncAgent({ name: 'Headless backup node' })

// Join an existing chain (passphrase never leaves the device)
await agent.sync({ passphrase, pairingToken })

const { blobs } = await agent.pull()   // receive others' changes, decrypt, merge
await agent.push(myState)              // push full encrypted state
```

The pairing token carries the chain id **and** the chain's write secret —
never the passphrase. The relay stores ciphertext it cannot read and sequences
blobs it cannot interpret; correctness never depends on trusting it.

## Security in one breath

`passphrase + chainId → PBKDF2 → AES-GCM key`, derived on your device and
never shipped. Writing to a chain additionally needs a write secret the server
only ever sees as a SHA-256 hash. Deletes ride as tombstones that merge by
timestamp. The [docs](https://docs.creadev.org/gistory/sync-and-security)
cover the model, the merge rules, and every trade-off the relay accepts.

## Docs

The full documentation lives at **[docs.creadev.org/gistory](https://docs.creadev.org/gistory)**:

- [Getting started](https://docs.creadev.org/gistory/getting-started) — first prompt, pairing a device
- [Features](https://docs.creadev.org/gistory/features)
- [Sync & security](https://docs.creadev.org/gistory/sync-and-security)
- [The npm package](https://docs.creadev.org/gistory/npm)
- [FAQ](https://docs.creadev.org/gistory/faq)
- **The workshop** → [Creadev.org](https://creadev.org) (gistory is made by Rook @ Creadev.org — the same home as the docs and app surfaces above)

## Development

The engine is developed inside the
[gistory monorepo](https://github.com/dhaupin/gistory) — the React app, the
relay, the red-team suite, and this package all share one tree and one verify
battery (typecheck ×3 passes, lint, a real-crypto sync smoke test, a headless
browser harness, and a crashtest pack against the relay).
[`AGENTS.md`](https://github.com/dhaupin/gistory/blob/main/AGENTS.md) records
the deep mechanics; `DEPLOY.md` is the full setup and operations runbook.

**Releases run on version tags** (npm Trusted Publishing, OIDC — no stored
token): bump `version`, update [`CHANGELOG.md`](CHANGELOG.md), then
`npm version patch|minor|major && git push --follow-tags`. The workflows gate
on typecheck + lint + the lib build, publish, smoke the registry artifact, and
attach the tarball to a GitHub release.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) — written in
[Keep a Changelog](https://keepachangelog.com) format so release tooling can
parse it.

## License

[MIT](LICENSE)

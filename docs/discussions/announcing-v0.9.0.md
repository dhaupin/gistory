---
version: 0.9.0
permalink: /discussions/announcing-v0.9.0
layout: default
title: "Announcing gistory v0.9.0"
comments: false
nav_order: 21
---

# gistory 0.9.0

gistory is a personal prompt manager that runs in your browser with no
account. Write prompts with variable placeholders, copy them filled in,
organize with tags and projects, and sync across devices end to end
encrypted. v0.9.0 is the first release line, and it ships the sync engine
as its own installable package alongside the app:

```npm
npm i gistory-sync
```

The app runs at [gistory.creadev.org](https://gistory.creadev.org/) with no
install at all; the package is for developers who want the same encrypted
push/pull engine outside the browser. Repo links at the end.

## What the package ships

The engine is the exact code the app and its service worker run, as one
ESM bundle with TypeScript declarations:

- `SyncAgent`: key derivation, encrypted full-state push and pull, pairing
  tokens. The pairing token carries the chain id and the chain's write
  secret, never the passphrase.
- `mergePayload`: pure merge for sync payloads, timestamp based with a
  deterministic device id tie breaker, tombstones for deletes.
- `SyncQos`: debounced and coalescing push scheduler with backoff that
  honors the server's Retry-After.
- A storage seam that runs in the browser without a bundler, in web
  workers, and in Node.
- Shared models and helpers: threads, projects, messages, variable pools,
  deleted registries, and synced arrangement (drag order and collapse).

```javascript
import { SyncAgent, mergePayload, SyncQos } from 'gistory-sync'

const agent = new SyncAgent({ name: 'backup node' })
await agent.sync({ passphrase, pairingToken })
```

The React app and the sync relay stay parts of the monorepo, not the
package. They deploy as one Cloudflare Pages project.

## What 0.9.x promises

Synced payloads keep old copies mergeable. Fields added after a release
are optional and merge so that devices running different package versions
converge in one chain. Merges take the newer timestamp, deletes ride as
tombstones, and optional additions never change how an existing field
resolves.

The npm release pipeline runs on version tags only, through npm Trusted
Publishing: the registry verifies the workflow's identity against a
Trusted Publisher entry, so no token is stored anywhere. 0.9.x is the
manual bootstrap ladder; tag-driven publishing takes over from 1.0.0.

## How sync works

The encryption key derives on your device from your passphrase and the
chain id. The passphrase never leaves the device. The relay stores
ciphertext it cannot read, sequences it, and hands out diffs; it never
holds anything derived from your passphrase, and writing to a chain
additionally requires a write secret the relay only ever sees as a hash.
Deletes merge like edits.

The relay is a few small functions over SQLite. It defends itself in-app
with throttles, a circuit breaker, and shape checks, and the runbook for
deployment lives in the repository. There is deliberately no delete
endpoint for real chains: the server cannot tell a quiet device from an
abandoned one, so only client-side tombstones and exported JSON backups
touch content.

## Where to start

The [getting started guide](/gistory/getting-started) covers the app in ten
minutes; the [npm guide](/gistory/npm) covers the package. The repo with the
full runbook is [dhaupin/gistory](https://github.com/dhaupin/gistory).

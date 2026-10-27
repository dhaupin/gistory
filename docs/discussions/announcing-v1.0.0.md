---
version: 1.0.0
permalink: /discussions/announcing-v1.0.0
layout: default
title: "Announcing gistory v1.0.0"
comments: false
nav_order: 22
---

# gistory 1.0.0

gistory is a personal prompt manager that runs in your browser with no
account. Write prompts with variable placeholders, copy them filled in,
organize with tags and projects, and sync across devices end to end
encrypted. v1.0.0 is the first stable release line, and the first line under
which the sync engine ships as its own package:

```npm
npm i gistory-sync
```

This post covers what the engine package gives you, what the stable line
promises, how sync works, and where to run it. Repo links at the end.

## What ships

The package is the sync engine, the exact code the app and its service worker
run, as one ESM bundle with TypeScript declarations:

- `SyncAgent`: key derivation, encrypted full state push and pull, pairing
  tokens. The pairing token carries the chain id and the chain's write secret,
  never the passphrase.
- `mergePayload`: pure merge for sync payloads, timestamp based with a
  deterministic device id tie breaker, tombstones for deletes.
- `SyncQos`: debounced and coalescing push scheduler with backoff that honors
  the server's Retry-After.
- A storage seam that runs in Node 18 or newer, web workers, and the browser
  without a bundler.
- Shared models and helpers: threads, projects, messages, variable pools,
  deleted registries, and synced arrangement (drag order and collapse).

The React app and the sync relay are parts of the monorepo, not of the
package. They deploy as one Cloudflare Pages project with no separate worker.

```javascript
import { SyncAgent, mergePayload, SyncQos } from 'gistory-sync'

const agent = new SyncAgent({ name: 'backup node' })
await agent.sync({ passphrase, pairingToken })
```

## What the stable line promises

Synced payloads keep old copies mergeable. Fields added after a release are
optional and merge so that devices running different package versions
converge in one chain. That rule is enforced in merge code and in review, and
it is the reason the line bumps to 1.0.0 and beyond without breaking old
payloads: merges take the newer timestamp, deletes are tombstones, and
optional additions never change how an existing field resolves.

The npm release pipeline runs on version tags only, through npm Trusted
Publishing: the registry verifies the workflow's identity against a Trusted
Publisher entry, so no token is stored anywhere. Each tag also attaches the
exact tarball to a GitHub release after re-proving it from a clean install.

## How sync works

The encryption key derives on your device from your passphrase and the chain
id. The passphrase never leaves the device. The relay stores ciphertext it
cannot read, sequences it, and hands out diffs; it never holds anything
derived from your passphrase, and writing to a chain additionally requires a
write secret the relay only ever sees as a hash. Deletes ride as tombstones
and merge like edits.

The relay is four small functions over one SQLite table set. It defends
itself in-app with throttles, a circuit breaker, and shape checks, and there
is a runbook for the whole deployment in the repository. There is
deliberately no delete endpoint for real chains: the server cannot tell a
quiet device from an abandoned one, so only client-side tombstones and
exported JSON backups touch content.

The relay's abuse surface is exercised, not assumed: an in-process
adversarial campaign (the crashtest pack surface) runs against the four
relay routes on every CI run and fails on a new exploit or a regression of a
previously refused case.

## Run it

The app is free, needs no account, and runs at https://gistory.creadev.org.
Pair a second device by scanning the QR code in Settings, enter the same
passphrase on both devices, and the chain converges. A full JSON export lives
in Settings, and import merges by id rather than duplicating.

Docs: https://docs.creadev.org/gistory
Repository: https://github.com/dhaupin/gistory
Releases: https://github.com/dhaupin/gistory/releases

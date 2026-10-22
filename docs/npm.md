---
version: '1.0'
permalink: /npm
layout: default
title: The gistory-sync npm package
nav_order: 5
---

# The gistory-sync npm package

[gistory-sync](https://www.npmjs.com/package/gistory-sync) publishes the sync
engine as one ESM bundle with declarations — the exact code the app and its
service worker run. Not included: the React UI and the relay (they are parts
of the product, not of the package).

```ts
import {
  SyncAgent,           // key derivation, E2EE push/pull, pairing tokens
  chainIdFromToken,    // parse a pairing token (chain id + write secret)
  mergePayload,        // pure LWW + tombstone merge for SyncData
  SyncQos,             // debounced, coalescing, back-off push scheduler
  ensureStorageReady,  // IndexedDB storage with localStorage fallback
} from 'gistory-sync'
```

## What to know

- **Runtime**: Node ≥ 18, any web worker, no React, no bundler required.
  Storage reads `typeof indexedDB` / `typeof localStorage` at call time and
  degrades the same way it does inside the service worker.
- **Exports**: the engine only — agent crypto, merge rules, QoS scheduling,
  sync error shaping, view-state arrangement maths, the storage seam, and the
  shared data models.
- **House rule**: synced fields keep old payloads mergeable. Optional fields
  added later must merge so that devices running older package versions stay
  in the same chain — blobs travel between package versions.
- **Release flow**: version tags only — `npm version patch && git push
  --follow-tags` publishes via npm Trusted Publishing and attaches the
  tarball to a GitHub release whose install-and-load battery gates it.

## A minimal client script

```ts
import { SyncAgent, chainIdFromToken } from 'gistory-sync'

// The pairing token carries the chain id and the write secret — never the
// passphrase. Legacy tokens (no secret) fail every write by design.
const { chainId, writeSecret } = chainIdFromToken(pairingToken)

const agent = new SyncAgent({
  passphrase,              // required; never leaves the device
  chainId,                 // required; also the key-derivation salt
  deviceName: 'Headless backup node',
  baseUrl: 'https://your-relay.example', // optional; default: same-origin /sync
  writeSecret,
})

await agent.init()       // derive the key, hydrate/restore this device's identity
await agent.handshake()  // register with the chain (creates it when none exists)

const { blobs } = await agent.pull() // receive others' changes (encrypted blobs)
await agent.push(myState)            // push a full encrypted snapshot; returns seq
```

A push is full-state: every device's client merges snapshots by
newest-edit-wins, so order and delivery timing do not matter. See
[Sync & Security](/gistory/sync-and-security) for what the relay can and
cannot see.

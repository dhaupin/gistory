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
  SyncAgent,         // key derivation, E2EE push/pull, pairing tokens
  mergePayload,      // pure LWW + tombstone merge for SyncData
  SyncQos,           // debounced, coalescing, back-off push scheduler
  ensureStorageReady // IndexedDB storage with localStorage fallback
} from 'gistory-sync'
```

## Whatisto know

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

## A minimal two-device script

```ts
import { SyncAgent } from 'gistory-sync'

const agent = new SyncAgent({
  name: 'Headless backup node'
  // baseUrl points at your relay (default: same-origin /sync)
})

await agent.sync({ passphrase, pairingToken })   // join an existing chain
const { blobs } = await agent.pull()             // receive others' changes
await agent.push(myState)                        // push full encrypted state
```

The pairing token carries the chain id and the write secret — never the
passphrase. See [Sync & Security](/gistory/sync-and-security) for what the
relay can and cannot see.

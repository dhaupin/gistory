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
import { SyncAgent, mergePayload, SyncQos } from 'gistory-sync'
```

## What to know

- **Runtime**: modern browsers and any web worker; Node ≥ 18 also works.
  Storage reads `typeof indexedDB` / `typeof localStorage` at call time and
  degrades the same way it does inside the service worker. No React, no
  bundler required.
- **Refresh model**: every device holds the full decrypted data locally and
  pushes snapshots. The relay stores only encrypted blobs and assigns
  sequence numbers; conflict resolution happens client-side.
- **House rule**: synced fields keep old payloads mergeable. Optional fields
  added later must merge so that devices running older package versions stay
  in the same chain — blobs travel between package versions.
- **Release flow**: version tags only — `npm version patch && git push
  --follow-tags` publishes via npm Trusted Publishing and attaches the
  tarball to a GitHub release whose install-and-load battery gates it.

## Agent

The agent is one object per chain. Construct it with the user's passphrase
and the chain's pairing data, initialize, then push and pull. The passphrase
never leaves the device and neither does the derived key.

### `SyncConfig`

| Field | Type | Required | Meaning |
|-------|------|----------|--------|
| `passphrase` | `string` | yes | The user's passphrase. Never transmitted; it derives the AES-GCM key. |
| `chainId` | `string` | yes (from token) | Identifies the chain and salts key derivation — the same passphrase with the same `chainId` yields the same key on every device. |
| `writeSecret` | `string` | for new chains | Authorises writing. The creating device mints it (`newWriteSecret()`); other devices learn it from the pairing token. The relay stores only its SHA-256. |
| `deviceName` | `string` | optional | The label other devices see for this device. |
| `baseUrl` | `string` | optional | Relay root URL. Defaults to same-origin (production means the app and relay share an origin). |

### `new SyncAgent(config)`

| Member | Returns | Meaning |
|--------|---------|--------|
| `init()` | `Promise<void>` | Derives the decryption key and restores this device's persisted identity (device id and sequence watermark) from storage. Call it before anything else. |
| `handshake()` | `Promise<ChainStatus>` | Registers with the relay. Creating a chain requires a `writeSecret`; joining one takes the secret from the pairing token. |
| `setDeviceName(name)` | `void` | Renames this device for the chain's other members. |
| `push(data)` | `Promise<number>` | Encrypts the full state and pushes it. Resolves with the server-assigned sequence number. A push whose merge is a no-op locally is still a fresh server blob — the QoS layer deduplicates, not the relay. |
| `pull()` | `Promise<PullResult>` | Downloads blobs newer than the local watermark (never returning blobs this device pushed itself), decrypts them, merges into the passed base state, and returns the result. |
| `putAttachment(attId, bytes)` | `Promise<boolean>` | Uploads one attachment's encrypted bytes through the payload-external channel. Resolves `true` on success, `false` when the daily per-chain byte budget is spent. |
| `getAttachment(attId, size)` | `Promise<ArrayBuffer>` | Downloads and decrypts one attachment. Throws if the fetched ciphertext length disagrees with the expected size. |
| `status()` | `Promise<ChainStatus \| null>` | Current watermark, version, and device list. `null` when the chain does not exist yet. |
| `getDeviceId()` / `getChainId()` / `getDeviceName()` / `getLastSeq()` | getters | Useful for UI and tests. |

### `PullResult`

| Field | Meaning |
|-------|--------|
| `blobs` | The decrypted, merged payload objects. |
| `serverSeq` | The relay's latest sequence number, whether or not any payload applied locally. Only advance your stored watermark to this once you have persisted the merge. |
| `failures` | Payloads that could not be decrypted. `describeDecryptFailures` explains what sender they came from. |

### `ChainStatus`

| Field | Meaning |
|-------|--------|
| `chainId` | The chain. |
| `serverSeq` | Highest server sequence. |
| `version` | Schema version counter of the chain (payloads carry theirs; a mismatch reads as a merge with an older client). |
| `devices` | The label, device id, and last-seq of every device in the chain. |

### Token helpers

Pairing rides a single string — `GS1-<chainId>.<writeSecret>` — carried by the
QR code a creating device shows. The dot is unambiguous because base64url
never contains one.

| Helper | Meaning |
|--------|--------|
| `newChainId()` | Fresh random chain id. |
| `newWriteSecret()` | Fresh random 32-byte write secret in base64url. |
| `pairingTokenFromChain(chainId, writeSecret?)` | Builds the pairing token. Omitting the secret produces a read-only legacy token. |
| `chainIdFromToken(token)` | Parses a token; returns `null` on wrong shape. |
| `suggestDeviceName()` | A human-friendly default like "Anne's laptop". |

### `SyncError`

Every non-2xx from the relay (or a network failure) throws `SyncError`, a
plain `Error` with three extras: `status` (the HTTP code), `retryAfterMs` (from
the relay's `Retry-After` header, already capped by the client's max retry), and
a `throttled` getter — `true` for 429/503, the cases where retrying later is
exactly right because the data is safe locally and the scheduler is holding it.

## Merge

`mergePayload(local, remote, myDeviceId, myBase?)` folds one incoming payload
into local state. The rules are the same used inside `pull()`, exposed so
import and service-worker paths run the identical logic:

- Threads, projects, and messages replace whole items when the remote side is
  newer — `updatedAt ?? createdAt` compared on each item, falling back to a
  lexicographic device-id tie-break on equal timestamps.
- Deletions are tombstones (`id → deletedAt`) merged by max timestamp; a newer
  edit resurrects a deleted item, and a message whose thread is gone is dropped
  rather than floated as an orphan.
- Settings and variables merge per key with the same LWW rules, so an
  optional field added in a newer package version merges into an older
  client's copy instead of fighting it.

Exported helpers worth knowing: `emptyDeleted`, `normalizeDeleted`,
`mergeRegistry`, `mergeSettings`, `mergeVariables`.

## Variables

The `Variables` module powers prompt templates: `VarEntry` records hold a
value plus metadata, keys are `varKey(scope, name)` pairs, and helpers cover
`normalizeVariables` (coerces junk to the schema), `liveVariables` (scope a
thread's own vars on top of `GLOBAL_SCOPE`), `lookupVariable` (resolution
order), and `tombstoneDeadScopes` (clean pools whose owning thread no longer
exists).

## QoS — `SyncQos`

A scheduler that sits between "the user typed" and "we pushed", so a burst of
edits produces one push of the newest state instead of a queue of stale ones:

- Constructor: `new SyncQos(options)` with `{ onPush, debounceMs?, retryBaseMs?,
  retryMaxMs? }` plus injected clock/timer hooks for tests. Keep the
  instance in a ref or module scope — it owns a timer that must survive
  re-renders (it is deliberately not a React hook).
- Call `schedule()` whenever local state changes; it debounces (1.5 s by
  default) and coalesces, and if a push is already in flight it sets a
  pending flag instead of queueing a second call.
- `flush()` pushes immediately and is also what a periodic refresh should go
  through, so an in-flight push is never fighting a scheduled one.
- `setRetryAfter(ms)` feeds a server `Retry-After` into the curve; `reset()`
  clears the failure counter after a success; `stop()` tears the scheduler
  down; `getState()` exposes `QosState` for surfacing status in a UI.
- Failures back off exponentially (`backoffDelay` — `min(base × 2^(attempt-1),
  max)` plus jitter) while re-setting pending, so the retry always carries
  the newest data. A failure is never dropped.

Top-level constants: `PUSH_DEBOUNCE_MS`, `RETRY_BASE_MS`, `RETRY_MAX_MS`, plus
`isTerminalPushFailure` and the `QosState`/`QosStatus` types for surfacing
status in a UI.

## View state

The arrangement layer behind dragging rows, pinning, and collapsing: a
`ViewState` map of per-item `rank`/`collapsed` entries merged with the same
LWW-plus-tie-break rules as content, with fractional ranks so two devices
reordering different rows do not fight. Relevant exports: `applyOrder`,
`applyFullOrder` (the filtered-view variant), `moveItem`, `moveWithinSubset`,
`sequentialRanks`, `rankBetween`, `needsRebalance`, `viewKeyItem` (the
key-namespacing helper everything touching the map must use), `pruneView`,
`mergeView`, `normalizeView`, and the `ItemView`/`ViewState` types.

## Storage (`idb`)

The storage seam every payload rides: `ensureStorageReady`, `getAttachmentBytes`
/ `putAttachmentBytes` / `deleteAttachmentBytes`, `allAttachmentIds`,
`stGetString` / `stSetString` / `stKeyList` for plain key values, `SYNC_KEYS`
and `isSyncKey` for namespacing, `storageMode()` (reports `idb` vs
`localstorage`), and `resetStorageSync` for tests. IndexedDB with a
localStorage fallback means the same code runs in a browser, web worker, or
service worker.

## Attachments

Message images ride `putAttachment`/`getAttachment` on the agent and their
metadata (ids, byte counts) rides the normal payload merge:

- `IMAGE_MIME_ALLOWLIST` and `isAllowedImageMime` bound what may be stored.
- `buildAttachment` and `newAttachmentId` create the record; `collectAttachmentIds`
  extracts referenced ids from any payload; `attachmentUrl` turns one into an
  object URL for the UI.
- `sweepAttachmentBytes` drops locally cached bytes whose owning message is gone.

## Models

`lib/models` exports the shared shapes — `Thread`, `Project`, `Message`
(each with `MessageAttachment` inside it when an image is present) and
`MessagesByThread` — and the two constants that bound attachments:
`MAX_ATTACHMENTS_PER_MESSAGE` (6) and `MAX_ATTACHMENT_BYTES` (4 MB). These
are the shapes `SyncData`, `SyncPayload`, and `SyncSettings` (all exported
from the merge module) are built from.

## Errors

`describeDecryptFailures` turns a `PullResult.failures` count into a
user-facing explanation of which sender's payloads could not be read.
`errorMessage` maps any sync error to prose; a `SyncError.throttled` error
reads as "your changes are saved locally and will upload shortly", because
that is true — the scheduler holds them.

## Security in one line

The user's passphrase and the chain-derivation salt stay in the device.
The server sees ciphertext, sequence numbers, device names, and upload
sizes — nothing readable, ever. The relay is blind by construction: it never
holds a key, and every blob it stores is decrypted nowhere except the client
deriving the key from `passphrase + chainId`.

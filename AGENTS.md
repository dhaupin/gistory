# Gistory - Agent Knowledge

This file documents deep mechanics for anyone working on the codebase.

## Sync Architecture

### The Core Problem
Browser-based apps can't maintain server state. Every device has the full data locally and pushes to sync. This creates challenges:

1. **Offline editing** - Device makes changes while offline
2. **Race conditions** - Two devices edit simultaneously 
3. **Data loss** - Without persistence, server deploy drops data

### How It Works

#### Encryption Layer
```
passphrase + chainId → PBKDF2 → CryptoKey (never leaves device)
data → AES-GCM encrypt → encrypted blob → server
```

The encryption key is derived from your passphrase **and the chainId** (which is also the PBKDF2 salt). The chainId travels in the pairing code/QR, so every device with the same passphrase and the same chainId derives the SAME key — that is what makes cross-device decryption possible. The passphrase itself never leaves the device.

#### Sequence Protocol
```
Device A (seq 10): edits prompts → push() → server (seq 11)
Device B: pull() ← server → receives A's blob → merge
```

Each push sends **full state**. Server doesn't know what's in the blob - just stores and sequences it. Client is the smart part.

### Filtering Trick

Worker filters on pull to avoid re-downloading your own changes:

```typescript
// functions/sync/pull.ts
SELECT seq, device_id, data, created_at FROM blobs
WHERE chain_id = ? AND seq > ? AND device_id <> ?
ORDER BY seq ASC LIMIT ?
```

This means:
- You push at seq 100
- You pull → get seq 100's diff (other devices' blobs), NOT your own
- You see their changes, they don't re-see yours

### Conflict Resolution

When two devices have the same item modified:

```typescript
// src/sync/merge.ts (incomingWins)
if (incomingTs > localTs) return incoming
if (incomingTs < localTs) return local
return senderDeviceId > myDeviceId ? incoming : local   // deterministic tie-break
```

Rules:
1. **Later timestamp wins** (trusts clock)
2. **Tie-breaker**: lexicographically larger deviceId wins (deterministic)

Deletions are carried as tombstones (`id → deletedAt`) that merge by max
timestamp; a newer edit resurrects a deleted item. Merge lives in
`src/sync/merge.ts` and is pure (unit-tested by `bun run sync:smoke`).

Drawback: Clock skew can cause issues. Future: vector clocks could fix.

## Data Flow

### Initial Sync
```
Settings → Enable Sync →
  1. Generate identity (deviceId from crypto.random)
  2. Create or receive the chainId (new random id, or read from the pairing code)
  3. Derive encryption key (passphrase + chainId)
  4. Handshake → register device, create chain if new
  5. Pull (join) then push full state
```

### Ongoing Sync
```
Manual Refresh → 
  pull() → decrypt → merge → 
  push() with updated data

Auto-sync option: 
  push(data, autoPull=true) → if serverSeq > lastSeq → pull first → push
```

## Key Interfaces

### SyncAgent
```typescript
class SyncAgent {
  config: { workerUrl, syncKey, deviceName }
  identity: { id, name, pubkey } | null
  key: CryptoKey | null
  chain: { id, devices[], version } | null
  lastSeq: number
  
  async init()
  async handshake(existingChainId?)
  async push(data, autoPull=false)
  async pull(): object[]
  async checkStatus(): { serverSeq, hasUpdates }
  getDeviceId(): string
}
```

### Worker API
```
POST /sync/handshake { chainId, deviceId, deviceName } → { chainId, serverSeq, version, devices[] }
POST /sync/push      { chainId, deviceId, data }       → { seq, serverSeq }   // seq is server-assigned
GET  /sync/pull      ?chain=X&since=Y&deviceId=Z       → { blobs[{seq,deviceId,data,createdAt}], serverSeq }
GET  /sync/status    ?chain=X                          → { chainId, serverSeq, version, devices[] }
```

The client never assigns `seq`. It inserts with `INSERT ... SELECT MAX(seq)+1 ... RETURNING seq`
so sequence numbers are unique per chain even when devices push at the same time.

## Interesting Patterns

### 1. In-Memory → D1 Migration
Earlier versions stored blobs in a `Map` and then KV. Both were replaced: the
current server is a Pages Function writing to D1 (SQLite), which persists across
deploys and lets us allocate sequence numbers atomically.

Every route depends on the `GISTRY_DB` binding and degrades loudly when it is
missing (never silently):
```typescript
if (!env.GISTRY_DB) return errorResponse('Sync storage is not configured', 500)
```

### 2. Device-Aware Filtering
Only pushed in later commit. Originally all devices got all blobs. Now:

- Each blob tagged with deviceId
- Pull filters excluding sender
- Prevents re-downloading own changes

### 3. Full State Push
Current design sends entire state each push. Trade-offs:

Pros:
- Simple (no operational transform)
- Works with gaps (any point-to-any sync)
- Offline-friendly (queue locally, push when online)

Cons:
- Larger payloads
- Later timestamp wins (not operational CRDT)
- No undo/redo from historical

Future could switch to incremental operations or CRDT.

## Gotchas

### 1. Same Passphrase + Same chainId = Same Key
Derivation salts with the **chainId**, never the deviceId:
```typescript
key = await deriveKey(passphrase, chainId)
// chainId is shared (via the pairing QR) → all devices in the chain share a key
```

Historically this salted with the deviceId, which made every device derive a
different key and broke sync entirely (each device could only decrypt its own
blobs). If you ever need per-device keys again, you need a key-wrapping step
first — do not simply change the salt back.

The deviceId is still used for: identifying the author of a blob (so pulls can
filter out your own changes) and as the deterministic tie-breaker in merges.

### 2. Sequence Watermarks
Pulls are a single indexed query, not a per-sequence walk:

```sql
SELECT seq, device_id, data, created_at FROM blobs
WHERE chain_id = ? AND seq > ? AND device_id <> ?
ORDER BY seq ASC LIMIT ?
```

- `since` is the client's watermark, persisted per chain as `gistory_seq_<chainId>`.
- Because own blobs are filtered out, the client must be able to jump the
  watermark to `serverSeq` even though the skipped rows included its own writes.
  It does that only once a page comes back short (`blobs.length < limit`).
- A full page (500 by default) means "there is more" — the client loops with
  `since = last returned seq` until a short page, so gaps are impossible.
- If a blob fails to decrypt, the watermark stops *before* it so the blob is
  retried on a later sync rather than silently dropped.

### 3. Clock Dependency
Conflict resolution uses timestamps. If devices have wrong clocks:
- Device A at 10:00 → edits itemX
- Device B at 09:55 → edits same itemX  
- Later: B's clock is wrong, thinks 09:55 < 10:00
- Resolution: B accepts A's change (correct)
- Reverse: If A's clock shows 09:55, B's shows 10:00 → A accepts B's (also correct per clocks)

Winners follow clock. Future: vector clocks or Lamport timestamps can fix.

## Files Quick Ref

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main state, sync lifecycle, merge wiring |
| `src/sync/agent.ts` | Client encryption, push/pull, pairing codes |
| `src/sync/merge.ts` | Pure merge logic (LWW + tie-break + tombstones) |
| `functions/sync/push.ts` | Accept encrypted blobs → D1, assign seq |
| `functions/sync/pull.ts` | Return filtered blobs ← D1 |
| `functions/sync/status.ts` | Chain health checkpoint |
| `functions/_shared/sync.ts` | D1 helpers/validation shared by the routes |
| `schema.sql` | D1 schema (chains, devices, blobs) |
| `tests/sync-smoke.ts` | End-to-end smoke test (bun + in-memory SQLite) |
| `scripts/ui-audit.mjs` | Headless UI audit: every route x 2 themes x 2 viewports |
| `scripts/ui-browsers.mjs` | Installs the headless browser on demand |
| `scripts/lib/*.mjs` | Shared launch/fixture/collector helpers for the harness |
| `tests/ui/*.mjs` | Browser tests (interaction flows, export/import round trip, snapshot metrics) |
| `.puppeteerrc.cjs` | `skipDownload` so installs/builds never fetch Chromium |
| `wrangler.toml` | Local-dev-only Wrangler config (placeholder D1 id, **no** `pages_build_output_dir`); prod bindings live in the Pages dashboard |
| `wrangler.deploy.example.toml` | Template for the gitignored private config holding the real D1 id |

## Testing Notes

- Sync smoke test: `bun run sync:smoke` (real agent crypto + real merge + real
  Pages Functions on in-memory SQLite — no account needed)
- Full stack locally: `bun run db:init:local` then `npx wrangler pages dev dist`
- Deploy: Cloudflare Pages Git integration; `/sync` binding is configured in the
  Pages dashboard (Settings -> Bindings -> D1 database -> `GISTRY_DB`), never in git
- Tail logs: `npx wrangler pages deployment tail`
- Frontend: vite builds to `dist/`; Pages serves it alongside `functions/`

### The browser harness

The UI scripts are dev-only tooling and are deliberately kept out of the build.
`.puppeteerrc.cjs` sets `skipDownload: true`, so `npm install` — which the
Cloudflare Pages build also runs — never pulls Chromium. Fetch a browser once
per machine with `bun run ui:browsers` (it re-enables the download for its own
child process via `PUPPETEER_SKIP_DOWNLOAD=false`).

- `bun run ui:audit` — walks every route in both themes on desktop + mobile and
  reports console/page errors, horizontal overflow, off-viewport elements,
  WCAG-AA contrast failures, text under 12px, targets under 32px, controls with
  no accessible name, unlabeled inputs, clipped text, duplicate ids, and
  blank/crashed pages. Screenshots go to `.ui-audit/` (gitignored). Exits
  non-zero on findings so it can gate a change; `--soft` overrides.
- `bun run test:ui` — runs every `tests/ui/*.mjs` suite: interaction flows
  (create/edit/delete/search/rename), the export→import round trip through real
  downloads, and snapshot control metrics.
- Both resolve the preview origin automatically (an explicit URL wins, then
  `PREVIEW_URL`, then a probe of ports 5173–5180) and warn when more than one
  dev server is answering.

**Gotcha:** a stale dev server is the fastest way to get a misleading audit. If
an edit does not show up, verify what the server actually serves before trusting
the results:

```bash
curl -s http://localhost:5173/src/components/BurgerMenu.tsx | grep -c aria-label
```

If that disagrees with the file on disk, restart the managed preview; a plain
`?t=<ts>` URL always re-transforms, so comparing the two isolates the cause.

## Future Improvements

Seen from working on this:
1. **Vector clocks** - Replace timestamp-only conflict
2. **Incremental ops** - Instead of full state push
3. **CRDT** - For automatic conflict-free merges  
4. **History** - Undo/redo from old states
5. **Offline queue** - Better offline handling
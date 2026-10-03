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

Messages whose thread is not in the merged thread list are **dropped**. Without
this, every device that had not yet seen the delete kept re-pushing that
thread's messages and they accumulated in every later payload forever.

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

### 4. The chain has no auth — knowing the chainId is enough to write to it
This is inherent to the “blind server” design, but the blast radius is worth
stating plainly. The `chainId` travels in the pairing QR, and the server
validates it only by *shape* (`/^[A-Za-z0-9-]{8,64}$/`). So anyone holding a QR
can:

- **read** every blob — mitigated, they are ciphertext without the passphrase;
- **write** blobs — push is guarded only by “the chain exists”.

A blob written under a different key is the dangerous case. The watermark rule
(Gotcha 2) parks the watermark *below* the first undecryptable blob so it can be
retried, which is correct for a transient wrong-passphrase case but means **one
poisoned blob blocks every legitimate change behind it, permanently**. There is
no way to skip past it without changing chains.

This is why the sync error names both causes — “wrong passphrase, or this chain
was tampered with” — instead of sending the user round in circles retyping a
passphrase that is already right. Real fixes would be a per-chain write
capability (e.g. pairing also provisions a push secret hashed server-side) or
per-blob MACs so a bad blob can be skipped rather than blocking. Both change the
sync protocol, so neither is in scope without a decision.

Also unbounded: push size is capped at `MAX_PAYLOAD_BYTES` but push *rate* is
not, so a chain can be filled with junk. Rate limiting belongs at the edge
(Cloudflare), not in these functions.

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

### 4. Message edits carry their own `updatedAt`
Threads and projects have always had `updatedAt`, but `Message` originally only
had `createdAt`. Since `updateMessage` changed `content` without touching any
timestamp, two devices holding the same message compared equal times and the
merge fell back to the deviceId tie-break — so a content edit only won when the
editor's deviceId happened to sort higher, and could be silently reverted.
`Message` now has an optional `updatedAt`, `updateMessage` sets it, and
`mergeMessages` compares `updatedAt ?? createdAt` (for both the tombstone check
and the win check). The fallback keeps messages saved before this change
mergeable.

### 5. Import merges by id, and never resurrects a tombstone
`importData` merges threads/projects/messages by id. Messages used to be
concatenated, so re-importing the same backup duplicated every message; they are
now folded into an id-keyed map (keeping the most recently edited copy).
`importData` also accepts the local tombstone registry so importing a backup does
not resurrect something deleted on this device.

### 6. Arrangement (pin, drag order, collapse) is generic and synced
Threads, messages, and projects can all be **pinned**, **reordered by dragging**,
and **collapsed**. Two different mechanisms back that:

**Pinning** is not a separate channel: `togglePinThread`, `togglePinMessage`,
and `togglePinProject` each flip `pinned`, set or clear `pinnedAt`, and bump
`updatedAt`. The merge already replaces whole items by LWW on
`updatedAt ?? createdAt`, so the newest pin state wins on every device with
**no merge change**. Keep that invariant if you add another pinnable kind; a
toggle that forgets to bump `updatedAt` looks correct locally and loses the
merge.

**Drag order and collapse** live in `src/sync/view-state.ts` — a `ViewState`
keyed by item id, shipped inside the normal sync payload as `SyncData.view`.
Each entry is replaced **as a whole** by LWW on its own `updatedAt`, with the
same deviceId tie-break as content. It is deliberately *not* on the item
models: a reorder rewrites one map key, so it can never clobber a concurrent
rename of that thread.

Keys are **namespaced by the surface that owns them**, not all bare item ids:

| Key | Owned by | Holds |
|-----|----------|-------|
| `<threadId>` | home board, projects grid, project detail | `rank` |
| `<messageId>` | thread view | `rank` |
| `message:<messageId>` | thread view | `collapsed` |
| `<projectId>` | projects grid | `rank` |
| `project:<projectId>` | sidebar group | `collapsed` |
| `section:home-projects` | home board | `collapsed` |

A thread is arranged in several places at once, so rank and collapse for the
same item need different keys. **Anything that reads or prunes these keys must
use `viewKeyItem(key)`** to get the item id back, not string-match the whole
key. Three call sites got this wrong in a row: `pruneView` and
`App.forgetView` (comparing the full key against the alive-id set, so every
collapsed message and sidebar group was wiped by the next sync) and
`viewFor` in `store.ts` (so exporting a thread silently dropped its collapsed
messages).

Ranks are fractional. The first drag in a group renumbers it (`RANK_STEP` =
1024); after that a drag writes **only** the moved entry, at the midpoint
between its new neighbours, and renumbers the whole group again only when the
gap drops below 1. That is what keeps two devices reordering different rows
from fighting. `sortPinnedFirst` applies rank **before** pin-first, so once a
user has arranged a list by hand the active sort control no longer overrides
them; items with no rank fall through to pin-first, then the sort.

**Reordering under an active search filter** is a different code path: only the
matching rows are visible, so ranking the visible ids would hand them 1, 2, 3…
while hidden rows kept their old ranks and the two sets collided. `App.reorder`
detects this (`allIds.length !== ids.length`) and switches to
`moveWithinSubset` + `applyFullOrder`, which splices the move into the *full*
order and renumbers every id, hidden ones included. `SortableProvider` forwards
`allIds` for this.

`onReorder(ids, from, to)` always means "here is the current order, move
`from`→`to`" — the consumer performs the move exactly once. `SortableProvider`
reports indices; it must not pre-apply `moveItem` as well.

Drag handles are pointer-based (`src/ui/sortable.tsx`), not HTML5 drag-and-drop,
because the native API does not work on touch. ArrowUp/ArrowDown on a focused
handle reorders one place, so reordering is never pointer-only. Every
arrangeable surface renders one: home threads/projects, the projects grid,
thread messages, project detail rows, and sidebar project groups.

## Files Quick Ref

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main state, sync lifecycle, merge wiring, pin toggle |
| `src/sync/agent.ts` | Client encryption, push/pull, pairing codes |
| `src/sync/merge.ts` | Pure merge logic (LWW + tie-break + tombstones) |
| `src/ui/sort.ts` | Sort options + `sortPinnedFirst` (rank → pin → sort) + thread/message/project sorters |
| `src/sync/view-state.ts` | Synced arrangement: ranks + collapsed flags, merge + rank maths |
| `src/ui/view-state.tsx` | `ViewStateProvider` / `useViewState` — the synced arrangement API |
| `src/ui/sortable.tsx` | `SortableProvider` / `SortableRow` / `SortableHandle` — pointer + keyboard drag |
| `labs/TASKS.md` | Rolling work log — update before/after each pass |
| `labs/MEM.md` | Disposable crash-guard / recovery bank |
| `functions/sync/push.ts` | Accept encrypted blobs → D1, assign seq |
| `functions/sync/pull.ts` | Return filtered blobs ← D1 |
| `functions/sync/status.ts` | Chain health checkpoint |
| `functions/_shared/sync.ts` | D1 helpers/validation shared by the routes |
| `schema.sql` | Flattened D1 schema for a fresh build |
| `migrations/` | Versioned schema history (`bun run db:migrate:*`) |
| `scripts/db-migrate.mjs` | Migration runner: applies pending files, records checksums |
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
- Full stack locally: `bun run db:migrate:local` then `npx wrangler pages dev dist`
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
  (create/edit/delete/search/rename), board-level rename/delete + confirmation
  dialogs + textbox guards (`usability.mjs`), live-fire drag ordering + synced
  collapse (`sortable.mjs`), the export→import round trip through real
  downloads, and snapshot control metrics.
- **Each suite gets its own browser context.** Pages sharing a context share
  localStorage, so a suite that drags rows or collapses a group would otherwise
  leak state into the next one. `openPage` in `scripts/lib/browser.mjs` creates a
  fresh context per page and disposes it with the page.
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
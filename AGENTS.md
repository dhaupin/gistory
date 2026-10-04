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
POST /sync/handshake { chainId, deviceId, deviceName, writeSecret? } → { chainId, serverSeq, version, devices[] }
POST /sync/push      { chainId, deviceId, data, writeSecret }       → { seq, serverSeq }   // seq is server-assigned
POST /sync/claim     { chainId, deviceId, writeSecret }             → { claimed, alreadySecured }
GET  /sync/pull      ?chain=X&since=Y&deviceId=Z       → { blobs[{seq,deviceId,data,createdAt}], serverSeq }
GET  /sync/status    ?chain=X&deviceId=Z               → { chainId, serverSeq, version, devices[] }
```

`writeSecret` is only honoured by `handshake` when that call *creates* the chain, and is ignored entirely by `claim`.

The client never assigns `seq`. It inserts with `INSERT ... SELECT MAX(seq)+1 ... RETURNING seq`
so sequence numbers are unique per chain even when devices push at the same time.

**Guard responses.** Every route is wrapped in `withBreaker`. Throttles answer
`429` with a `Retry-After` header and a `retryAfterMs` field in the body; an
open breaker answers `503` the same way. `SyncError` on the client reads the
header and backs off accordingly, so a guard response is a pause rather than an
error the user has to act on.

`/sync/status` is throttled on the `pull` budget and requires a valid
`deviceId`, because it returns the chain's **device list** — ids and names. Left
open it was an enumeration surface: walk chain ids, harvest who is in each chain.
The agent therefore sends its own `deviceId` with every status call.

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

### 4. Write auth: a chain needs its write secret, not just its id
Reading a chain only ever needed the passphrase, so anyone holding a QR could
already read the blobs (they are ciphertext). *Writing* used to need nothing at
all, which was the real hole: a chain id plus the ability to encrypt under any
key was enough to append a blob, and one blob the client cannot decrypt pins its
watermark below it forever (Gotcha 2).

Each chain now has a random **write secret**, minted by the device that creates
it and carried to other devices in the pairing token:

```
chainId + writeSecret  ──handshake (creating device only)──▶  chains.push_hash
                                                            = SHA-256(writeSecret)
push { chainId, deviceId, data, writeSecret }  ──▶  compare, then store
```

Deliberately **not** derived from the passphrase. The server stores only
SHA-256, so it never holds anything derived from the user's passphrase and the
“blind relay” property survives. The secret is 32 random bytes in base64url
(43 chars), compared with `constantTimeEqualHex` so a mismatch leaks nothing
about how much of the digest was right.

`handshake` installs the hash **only when it creates the chain**. Inferring that
afterwards would let anyone who knew the chainId claim an existing chain by
handshaking with their own secret, so `chainIsNew` is read *before* `ensureChain`.

Pairing tokens are now `GS1-<chainId>.<writeSecret>`. The dot is unambiguous
because base64url never contains one. A token without the secret is an older
code: that device can read but not write, and the UI says so rather than
failing at the first push.

**Chains that predate write auth** have a NULL `push_hash` and keep accepting
writes without a secret, so existing installs are not locked out.
`POST /sync/claim` lets the owner install one. That endpoint is **first-come-
wins**, which is a real and bounded limitation: the server holds no secret for an
unclaimed chain, so it cannot distinguish the owner from someone holding an old
QR. It cannot go worse than denial of future writes — blobs stay AES-GCM
ciphertext, so claiming grants no access to anyone’s data. New chains are
unaffected. Re-claiming with the *same* secret is an idempotent retry; claiming
with a different one is refused (409) rather than silently locking out every
other device.

### 5. Guards: throttle, breaker, and WAF

Three guards, all in `functions/_shared/guards.ts`, wired into all four data
routes. They are a *backstop* — Cloudflare's edge rate limiting still belongs at
the edge — but the edge cannot see what the relay can: which chain a caller is
hammering, and what a valid write secret looks like.

**Throttle (fixed window, in D1).** `migrations/0003_guards.sql` adds
`rate_limits (key, window_start, count)`. One row per `scope:subject` bucket:

| Scope | Subject | Policy | Defends against |
|-------|---------|--------|-----------------|
| `push` | deviceId | 120/min | one runaway client |
| `push-chain` | chainId | 600/min | a chain being filled with junk blobs |
| `pull` | deviceId | 240/min | a pull loop starving pushes of D1 time, and `status`, which leaks the device list |
| `handshake` | deviceId | 20/min | walking chain ids to enumerate chains |
| `claim` | chainId | 5/min | racing many claim attempts on one chain |
| `write-fail` | chainId | 20/min | guessing a write secret |

`push` is sized from the client's own debounce, not from a guess: `SyncQos`
pushes at most once per 1.5s (~40/min worst case), so 120/min means an ordinary
client never sees a throttle and a loop hits it within seconds.

Two decisions worth keeping:

- **A refused request does not advance the counter.** Charging it would make a
  client that keeps hammering unable to recover until the counter happened to
  roll over, which reads as a permanent ban and is much harsher than the policy
  means.
- **A `write-fail` is a separate budget, not a `push`.** A third party guessing
  at a chain must not be able to spend the legitimate device's push allowance.

The counter is written with a **single upsert**, because SELECT-then-UPDATE
races: two concurrent requests would both read `count=0` and both be admitted.
The reset rule is a `CASE` on the existing row's `window_start` — same window
means increment, different means start at 1.

A stored `window_start` **in the future is treated as absent**. These timestamps
come from whichever PoP served the request, so a device can legitimately see a
window a few seconds ahead of its own clock; counting that as "inside the window"
would refuse every request until real time caught up.

Fixed window, not a sliding log: a log grows per request and needs a
read-modify-write of every recent hit. The known cost is that a caller can send
`2 × limit` around a boundary — acceptable given the limits sit far above
legitimate use and far below a flood's cost.

**Circuit breaker (in-memory, per-isolate).** After 5 consecutive failures
(any uncaught throw, or any 5xx the handler produced on purpose) the breaker
opens for 15s and requests get a fast 503 + `Retry-After` instead of a slow
pile of timeouts. It protects *this isolate's* connection pool, so module scope
is the right scope; a new isolate starts closed and just re-discovers the
outage. Two subtleties, both bug-fixed during this pass:

- A failure while open does **not** re-arm the cooldown. If it did, a dead
  database under continuous traffic would push `openedAt` forever and the
  breaker would never serve a trial request — it would refuse everything
  permanently.
- `advanceBreaker` takes the remaining budget as a parameter rather than
  tracking a count internally, which keeps it pure and walkable in a test.

`withBreaker` wraps each route so an unexpected D1 throw becomes a breaker
failure. Without it every route would need its own try/catch purely to feed the
breaker, and the ones that forgot would starve it exactly when the database was
down. A missing `GISTRY_DB` binding is deliberately *not* charged to the
breaker: it is a configuration error that will not fix itself.

**WAF (cheap, conservative).** Rejects what is *structurally impossible* for a
real client, so it cannot produce a false positive that blocks a user's sync:
non-object bodies, `__proto__`/`constructor`/`prototype` keys, control characters
in any field, >32 fields, a non-string `data`, and `data` over the size cap.

This is **not** a SQL-injection defence — every statement is already
parameterised and no request field is ever concatenated into SQL. It targets the
two things actually true here: requests that are not the protocol at all, and
requests big enough to be a DoS. `data` is opaque ciphertext by design and is
checked for size only.

**The body cap is enforced twice, and both checks are needed.** `MAX_PAYLOAD_BYTES`
only bounds the `data` field *after* the body has been parsed, so on its own it
does nothing about the memory cost of parsing a large body:

- `withBreaker` rejects on the declared `Content-Length` **before** the handler
  runs — the cheap case, where an oversized body is never buffered at all. It
  lives in `withBreaker` rather than in each route so a new route cannot forget
  it, the same reasoning as the breaker.
- `readJson` checks the real length after reading, for a chunked request that
  declares no length or lies about it.

Deleting either one is caught by a mutation test. The chunked test sends *valid*
JSON padded into `deviceName` rather than truncated `data`, precisely so it
isolates this cap from `MAX_PAYLOAD_BYTES` — an earlier version used malformed
JSON and passed even with the cap deleted.

### 6. Client QoS: debounce, coalesce, back off

`src/sync/qos.ts`. The server guards are the backstop; this is the first line,
because a client that never gets ahead of itself generates no traffic to reject
and the user never sees a throttle error.

`SyncQos` (a class in a ref, **not** a hook — it owns a timer that must survive
re-renders) replaces the old bare `setTimeout` effect. Two invariants matter,
and both are mutation-tested:

1. **`onPush` is never called concurrently.** A change arriving during an
   in-flight push sets `pending` and arms nothing; when that push settles it
   pushes the newest state once. Without this, N edits during one slow push
   become N queued pushes carrying snapshots nobody needs.
2. **A failed push is never dropped.** `pending` is re-set on failure, so the
   retry always carries the newest state.

`syncNow` pushes through `flush()` rather than calling the agent directly, since
the periodic refresh can fire while a debounced push is in flight.

Backoff is `min(base × 2^(attempt-1), max)` plus jitter, and a server
`Retry-After` overrides the curve — capped by `maxMs`, so a hostile or buggy
header cannot park a client for an hour. Jitter is not decoration: every device
in a chain that hit a 429 at the same moment would otherwise retry in lockstep
and re-trigger it immediately.

Failures arrive as `SyncError` (`status`, `retryAfterMs`, `.throttled`) rather
than as prose, so `errorMessage` can tell a *pause* from a *failure*. A 429
reads as "changes are saved locally and will upload in about 30s", because the
change is not lost — the scheduler is holding it.

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
| `src/sync/qos.ts` | Client QoS: `backoffDelay` + `SyncQos` (debounce, coalesce, retry) |
| `src/sync/errors.ts` | User-facing sync error messages (pure) |
| `src/ui/view-state.tsx` | `ViewStateProvider` / `useViewState` — the synced arrangement API |
| `src/ui/sortable.tsx` | `SortableProvider` / `SortableRow` / `SortableHandle` — pointer + keyboard drag |
| `labs/TASKS.md` | Rolling work log — update before/after each pass |
| `labs/MEM.md` | Disposable crash-guard / recovery bank |
| `functions/sync/push.ts` | Accept encrypted blobs → D1, assign seq |
| `functions/sync/pull.ts` | Return filtered blobs ← D1 |
| `functions/sync/claim.ts` | Install a write secret on a pre-write-auth chain |
| `functions/sync/status.ts` | Chain health checkpoint (throttled — it leaks the device list) |
| `functions/_shared/sync.ts` | D1 helpers/validation shared by the routes |
| `functions/_shared/guards.ts` | Throttle policies + counter, circuit breaker, WAF, `withBreaker` |
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
| `tsconfig.json` | App build/typecheck config — covers `src/` only |
| `tsconfig.functions.json` | Strict typecheck for `functions/` (run by `bun run typecheck`) |
| `wrangler.deploy.example.toml` | Template for the gitignored private config holding the real D1 id |

## Testing Notes

- **Typecheck: `bun run typecheck`.** Two passes, deliberately:
  `tsc -b` for `src/`, then `tsc -p tsconfig.functions.json` for the Pages
  Functions.
  `functions/` is **not** in the root `include`. The app has always run
  `strict: false`, and under `strict: false` `strictNullChecks` is off, which
  means discriminated unions (`{ ok: true } | { ok: false }`) can no longer be
  narrowed on their discriminant. `guards.ts` narrows on exactly that, so
  compiling the server in the root config would demand `as` casts all over it
  and throw away the very checking this is for. The relay is four routes plus
  two shared modules where a type error is a 500 for every user, so it gets the
  stricter pass instead of the looser one. If you add a guard helper that
  returns a discriminated union, it will typecheck in `tsconfig.functions.json`
  and *fail* in the root config — that asymmetry is intended.
- `tests/` and `scripts/`: `tests/` is now covered by `tsconfig.test.json`
  (strict, `@types/bun` added as a devDependency for `bun:sqlite`). It must be
  strict for the same reason as `functions/`: the smoke test imports the Pages
  Functions, and under `strict: false` their discriminated-union guards would
  report errors the Functions pass does not. `scripts/*.mjs` is still
  unchecked — plain JS with `allowJs` off.
- **CI:** `.github/workflows/ci.yml` runs `npm ci`, `bun run typecheck`,
  `bun run sync:smoke`, `bun run db:migrate:check` and `vite build` on push and
  PR. It deliberately does **not** run the browser suites: they need a Chromium
  download and a dev server, which is slow and flaky in CI. Run
  `bun run test:ui` and `bun run ui:audit` locally before pushing a UI change —
  they are the only suite that exercises rendering.
  Note CI installs with `npm ci` because `package-lock.json` is the tracked
  lockfile; `bun.lock` is untracked, so do not switch CI to bun install without
  committing one in the same change.
- **Migrations from CI:** `.github/workflows/migrate.yml` applies
  `scripts/db-migrate.mjs --remote` — via the Actions "Run workflow" button
  (works from the GitHub mobile app, dry run by default) or automatically on a
  push to `main` touching `migrations/`. Needs the secrets
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`.
  It re-runs the whole verify suite in its own `verify` job first — a job cannot
  `needs:` a job in another workflow file — and runs behind a `production`
  environment where required reviewers can be added. That env is the intended
  safety valve for an irreversible, forward-only schema change.
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
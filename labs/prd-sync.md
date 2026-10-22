# PRD — Background Sync via Web Push (no PWA)

Status: planned · authored 2026-10-22 · owner: dhaupin
Sibling docs: `src/sync/SPEC.md` (relay protocol), `functions/_shared/guards.ts`
(policies this design must respect)

## 1. The problem

Sync today only runs while a page is alive. Every device syncs on load,
every 60s while open, and on `visibilitychange` — so **nothing is ever
lost** when a tab closes, but nothing is *delivered* either: a message sent
from device A does not appear on device B until someone reopens the app
there. On 8 devices the result reads as "sync is flaky", when it is really
"sync has a schedule you only meet while watching it."

A user with an always-closed background expectation has today exactly two
options: keep a tab open, or install the site. User has ruled out PWA
install (explicitly, 2026-10-22). The fleet is Android Chrome/Brave, where
**Web Push works for a plain, non-installed website** with only a service
worker. iOS Safari is the known boundary (push requires add-to-homescreen
there) — out of scope, those devices keep the current behavior.

## 2. The shape

A **silent ping, sent by the relay, waking a service worker that syncs.**

```
Device A pushes blob seq 354 ──▶ relay stores blob (unchanged today)
                                 relay fans out a contentless ping to
                                 chain X's OTHER subscribed devices
                                     ──▶ FCM/Mozilla autopush
                                          ──▶ OS wakes service worker
                                               SW: pull → decrypt → merge
                                                   → (IndexedDB) → stop
```

- The relay stays **blind**: the ping carries nothing about the content,
  not even its size. It is "something landed on this chain", nothing more.
- The **page may be closed**; the OS-level push channel (Google Play
  services on Android) delivers the wake. Battery-friendly by design —
  no polling, no keep-alive, no wake lock.
- The current in-page loop (load / 60s / refocus) is untouched and remains
  the fallback for devices without a subscription (and all iOS).

### 2.1 What is deliberately NOT here

- No `manifest.json`, no install prompt, no application icons.
- No notification UI by default. A future opt-in "show a badge on new
  messages" rides on the same plumbing (the ping can then carry a count),
  but the baseline is a fully silent, invisible wake.
- No third-party push service account. VAPID keys are generated locally
  (`web-push`-style ECDSA P-256 via Web Crypto, one `bun` script), stored
  as Cloudflare secrets. FCM/autopush are free, keyless delivery endpoints.

## 3. Architecture changes

### 3.1 Sync state moves to IndexedDB (the real chunk)

The service worker cannot read `localStorage` (its #1 hard frontier), and
React will not be alive when it wakes. Four values live there today:

| localStorage key | lives in SW? | destination |
|---|---|---|
| `gistory_sync_key` (passphrase) | ✗ blocked | IndexedDB `kv` store (same-origin, same trust boundary as localStorage) |
| `gistory_device_id` / `gistory_device_name` | ✗ | IndexedDB `kv` |
| `gistory_write_secret` | ✗ | IndexedDB `kv` |
| `gistory_seq_<chainId>` (pull watermark) | ✗ | IndexedDB `kv` |
| `gistory_threads/messages/projects/deleted/view/settings` (merged state) | ✗ | IndexedDB `merge` stores |

Plan (`src/sync/idb.ts`, new module):

- An async key-value facade with the exact old function names
  (`loadThreads`, `saveDeleted`, etc.) so `src/lib/store.ts` and `App.tsx`
  swaps calls; NOT a rewrite of merge logic — merge stays pure.
- **One-time migration on boot**: if localStorage has data and IndexedDB is
  empty, copy everything across, only then clear the localStorage sync
  keys. The migration must be idempotent and atomic enough that a crash
  mid-way re-runs it harmlessly (copy-then-clear, never clear-then-copy).
- Every consumer of the merged state becomes async. App's bootstrap
  (`useState(() => ...)` today) becomes a hydration promise; render a
  loading sweep for the few ms it takes. This is the widest
  refactor of the PRD and gets its own commit + smoke coverage before
  anything push-shaped ships on top.
- The pages and the SW **share** the same IndexedDB; React writes it
  already in the same places it saves localStorage today. No second copy.

### 3.2 Service worker (`public/sw.js`)

- Registered from `main.tsx` unconditionally (`if ('serviceWorker' in
  navigator)`), scope `/`. Cache strategy for the shell is **network-first
  with a bare bones offline fallback** — deliberately NOT an app-shell
  cache; the ask is push, not offline installability.
- `push` handler: read the ping (chain id only), load the
  passphrase/watermark/chainId from IndexedDB, run the existing
  pull→merge→persist path (importing the compiled agent + merge modules),
  exit. No `showNotification` call. If anything fails (no passphrase yet,
  network down), the handler exits quietly; the next open/catch-up pull
  heals it. **The SW must never throw an unhandled event error** — Chrome
  would count failures against the subscription's health.
- `PushEvent` freshness: if a second ping arrives during a sync, ignore it
  (the merge of everything-since-the-watermark makes extra pings free).
- Deployment note: `public/` is copied verbatim to `dist/` by vite; the SW
  is a plain static file at `/sw.js`.

### 3.3 Relay: subscription storage + fan-out

**Schema (migrations/0005_push_fanout.sql):**

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  chain_id   TEXT NOT NULL,          -- fan-out group
  device_id  TEXT NOT NULL,          -- who this wakes
  endpoint   TEXT NOT NULL,          -- URL, primary key of the subscription
  p256dh     TEXT NOT NULL,          -- client public key (base64url)
  auth       TEXT NOT NULL,          -- auth secret (base64url)
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  PRIMARY KEY (endpoint)             -- one subscription per browser endpoint
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_chain ON push_subscriptions (chain_id);
```

Endpoint as PK (not (chain,device)) is deliberate: it is the bearer key the
push service recognizes; the same subscribing browser re-subscribing to a
new chain must MOVE, not multiply.

**Routes:**

- `POST /sync/subscribe` — body `{ chainId, deviceId, endpoint, p256dh,
  auth }`. Validated like every other id field (WAF + regexes). Upsert.
  Requires NO write secret: subscribing only adds a wake target on the
  path INTO this user's own device, and the ping payload carries nothing —
  the DoS worst case is spammy wakes on a device the attacker knows the
  chain id of, bounded by the per-chain fan-out budget below. Guarded:
  `handshake`-scope throttle per deviceId.
- `DELETE /sync/subscribe` (POST `/sync/unsubscribe` for simplicity with
  our CORS setup) — body `{ endpoint, deviceId }` for unlinking.
- Existing routes unchanged in contract; only `push.ts` gains the fan-out
  call at the very end, after `appendBlob` succeeds and the throttle
  buckets have already been charged.

**Fan-out rules (functions/_shared/push-fanout.ts):**

1. Only for pushes that SUCCEEDED. A rejected blob fans out to nobody.
2. Send to every subscription on the chain EXCEPT the sender's device id.
3. Payload: `{ chainId, n: <blobCount> }` encrypted (aes128gcm / RFC8291
   with the pair p256dh+auth — required since FCM rejects 0-byte bodies)
   with padding (pad roughly to 24 bytes). Content is opaque by design.
4. Budget: per chain, max 20.. fan per minute (below the existing
   `pushChain` 600/min budget; a ping storm otherwise mirrors the blob
   storm we already guard). Use the SAME rate_limits table with a new
   `fanout` scope. Overages are skipped silently — the in-page catch-up
   loop is the correctness net; the ping is an optimization, never a
   guarantee. This asymmetry is the central decision of this design:
   **push accelerates sync; watermarks guarantee it.**
5. Response hygiene: FCM/autopush answer `410 Gone` when a subscription
   died (device uninstalled, new SW replacing the endpoint, OS revoked).
   On 404/410 the relay deletes the row. On repeated non-2xx, mark
   `last_seen` and count failures instead — after 5 consecutive failures
   delete the row (self-healing; re-subscription recreates it).
6. Fan-out is capped per chain (subscription table scan, at most 50 rows
   like `listDevices` does), and each ping is a single fetch — a chain of
   8 devices costs 7 fetches at push time. Affordable.

**Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (JWK / base64url),
`VAPID_SUBJECT` (mailto:), set via `freebuff-deploy env` / Pages dashboard.
The keys are generated ONCE by
`scripts/vapid-keygen.mjs` (new, Web Crypto, offline). They sign the
Authorization JWS on the push service call; ES256 via WebCrypto, no
dependency.

### 3.4 The two sides that must agree (subscription lifecycle)

- The DEVICE stores `{ endpoint }` alongside the chain config so it can
  unsubscribe when sync is disabled (`handleDisableSync` → best-effort
  unsubscribe + `pushSubscription.unsubscribe()`), and so re-enabling sync
  on the same chain re-subscribes idempotently.
- A device that joins a DIFFERENT chain re-subscribes (the endpoint row
  moves groups); a device that disables sync unsubscribes (no pings to a
  dead device).
- Rotation: if the browser re-subscribes with a NEW endpoint (this happens
  on SW updates sometimes), the old row's 410-cleanup on the server +
  local teardown make the rotation converge both sides.

## 4. Client UX (Settings → Sync)

New row, only visible where the capability exists (`'PushManager' in
window && 'serviceWorker' in navigator`), not gated on any PWA-ness:

> 🔔 Background sync — OFF
> "Get other devices' changes on this phone within seconds, even when no
> tab is open. Uses web push; you will not see notifications."

Toggle ON flow:

1. `Notification.requestPermission()`. Deny → the row reports it and
   stays off. A data-only subscription from a denied permission page
   would technically pass on some browsers, but a denied permission also
   usually bars the wake itself — treat deny as off.
2. `registration.pushManager.subscribe({ userVisibleOnly: true,
   applicationServerKey })` — note `userVisibleOnly: true` is REQUIRED by
   Chrome even for fully silent deliveries; it is a capability flag, not
   a promise to show anything.
3. POST the subscription to the relay under this chain + deviceId.
4. Store endpoint locally; mark the toggle on.

OFF flow: unsubscribe from the relay, then locally.
Degraded states (permission revoked from OS settings, SW updated away):
the toggle re-checks `getSubscription()` on boot and repairs its on/off
display; the server's 410-cleanup is the server-side mirror.

Each phone needs this once. There is no fleet-wide admin surface — each
device governs itself, same as sync enable today.

## 5. Security review (must-keep properties)

- **Blind relay preserved.** Ping payloads are padded garbage, RFC8291
  encrypted with per-endpoint keys; the chain's data NEVER rides a push.
- **The ping is not a leak.** Endpoint URLs are opaque and device-scoped;
  the fan-out DB stores no message content, nothing about the data.
- **Wake-to-data chain:** the SW decrypts with key material in IndexedDB
  (= same origin trust as localStorage had). No new key exposure surface.
- **Subscription = bearer credential** for making a device wake and
  SPEND ITS BATTERY. Mitigations: per-chain fan budget (§3.3.4), 410
  pruning, and the fact that knowing an endpoint does not reveal any
  content any more than knowing the chain id already does.
- **VAPID keys are server-side only.** The PUBLIC key is fine in the
  client (it is public); the private JWK never ships to a device, never
  enters a broadcast body.
- Stale-subscription GC: weekly maintenance job adds a
  `push_subscriptions` sweep — rows whose last_seen/failure state is
  ancient get dropped (same patterns as rate_limits pruning).

## 6. Testing & verification plan

- `tests/sync-smoke.ts`: new section — subscribe/upsert/move validation,
  the fanout budget, the 410-cleanup, and CRITICALLY the invariant that a
  push with fan-out DISABLED (no subscriptions present) is bit-for-bit
  today's behavior (relay must not break for unsubscribed chains).
- `bun run db:migrate:check` for 0005; `db:maintain:check` gains the
  subscriptions rule.
- Browser: `tests/ui/` gains a suite walking the toggle on/off on a dev
  server with a mocked `PushManager` (the harness has no real push
  service) to validate the UX paths.
- Live probe (like `sync:live`): two-device chain where device B
  subscribes with a real endpoint — only possible in an environment
  where a push service answer is available; otherwise the FCM call is stubbed and the
  410 path exercised directly.
- Manual receipt on a real phone after deploy: message from device A
  appears on device B with NO tab open, logged in `labs/TASKS.md`.

## 7. Rollout order (each step independently shippable)

1. **IndexedDB migration** (`src/sync/idb.ts` + store swap). No new
   feature. User-visible change: none (state identical, same keys
   migrated). This is the risk-retire step; it must land and bake on the
   live 8-device chain before anything push-shaped depends on it.
2. **Service worker + registration** (still no subscription). Everything
   still works as today; the SW exists, passive.
3. **Subscribe route + Settings toggle** (writes the table, no fan-out
   yet — the toggle is a no-op waiting for wiring, but probeable.
4. **Fan-out + SW push handler + VAPID secrets.** The payoff commit.
5. Maintenance sweep for the new table; docs (`src/sync/SPEC.md` addendum,
   README section).

## 8. Open questions / risks (parked for the build)

1. **Chrome wake cadence:** Google can throttle delivery under "site has
   been idle for weeks" heuristics. Accepted — watermark + catch-up make
   correctness independent of cadence; the ping is pacing, not truth.
2. **Brave's shields** — Brave has historically proxied push endpoints
   to its own service under some shield settings,
   and each build can behave differently. Per-device verification on the
   fleet's actual Brave builds is required at rollout step 4 (their
   device names are 2021/2024 Stylus × Brave and Brave Beta). If one
   build misbehaves, the other devices still deliver and the
   misbehaving one falls back to catch-up-on-open.
3. **Silent push surviving** on Android without a notification: FCM
   delivers 0-visibility data pushes; Chrome does NOT currently force a
   visible notification for them (that requirement lives on iOS). Pin the
   behavior with a real-device receipt at step 4 and keep a
   showNotification fallback / optional badge flag in the design in case a
   Chrome policy shift forces visibility someday.
4. **Multi-tab wake:** a ping can wake the SW while a page is also open —
   the SW's pull must not fight an open page's QoS
   scheduler. The merge is LWW-idempotent, watermarks live in the shared
   IndexedDB and both paths read/write through the same stores, so the
   worst case is one redundant pull + a merge that lands the same bytes.
   A `BroadcastChannel` "sync happened" poke to open pages (to refresh
   their UI after a SW merge) is the only glue this needs.
5. **IndexedDB quota/quota eviction** on Android low-storage: the merged
   state for this app is small (hundreds of KBs); `navigator.storage`
   persistence request is added at step 1 to keep Chrome from evicting
   the one store sync depends on.

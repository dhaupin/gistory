# PRD — Gistory (the product)

Status: canonical product definition · authored 2026-10-22 · owner: dhaupin
Sibling docs: `labs/prd-sync.md` (background sync), `src/sync/SPEC.md` (relay
protocol), `README.md` (setup + deploy runbook), `AGENTS.md` (deep mechanics,
gotchas, testing notes)

This is the single document a new contributor or agent should read to
understand **what Gistory is**, **what it includes today**, and **where each
piece lives**. Facts here are descriptive of the shipped product — check the
sibling docs for anything sync-internal, and `AGENTS.md` for the mechanics
behind them.

## 1. What Gistory is

Gistory is a **secure, privacy-first prompt keeper** for people who work with
AI prompts across many devices and many conversations. Concretely, it stores
**threads** (a prompt conversation: a sequence of short reusable text
messages), organized into **projects**, with metadata tuned for prompt reuse
(tags, ratings, model hints) — and it keeps all of it **end-to-end encrypted
while syncing across a user's devices with no accounts, no server trust, and
no plaintext ever leaving a device**.

One sentence pitch: *your prompts, on every device you own, in ciphertext the
server can't read, backed up by an offline-capable design that never assumes
the network is there.*

### 1.1 Who it is for

- A person who runs prompt workflows (coding, writing, legal/medical/domain
  research) and reuses prompts over months.
- They want it **not on someone else's cloud**: no login, no plaintext backup.
- They use several devices (fleet in practice: Android Chrome/Brave phones +
  desktops) and expect edits to appear everywhere — including from a closed
  phone via background sync.

### 1.2 Product principles

1. **The relay is blind.** The server stores only ciphertext. It never
   receives, derives, or stores anything derived from the passphrase. Today:
   AES-GCM blobs, chain ids, device rows, sequence numbers, rate-limit
   buckets. Tomorrow: the same. Any feature that would require the server to
   understand user content is out of scope by definition.
2. **No accounts.** Identity is a passphrase + a chain; pairing is a QR/token.
   Losing the passphrase loses the data (documented, deliberate — see §6).
3. **Offline-first.** Every device holds the full library locally
   (IndexedDB-backed), merges what it can pull, and converges by watermark.
   Nothing in the correctness story requires the relay or the network.
4. **Open source, single deployment.** Static React app + Pages Functions +
   D1 in one Cloudflare Pages project; no separate worker, no third-party
   sync service.
5. **Deletions are permanent and visible.** Tombstones, a synced trash log,
   and no restore path — see §4.7.

## 2. Feature inventory (what ships today)

| Area | Feature | Where |
|---|---|---|
| Content | Threads → messages; edit/delete; per-thread draft autosave | `ThreadView.tsx`, `store.ts` |
| Content | Projects as folders; a thread can live in several projects | `ProjectsBoard.tsx`, `ProjectDetail.tsx` |
| Content | Thread statuses `draft / active / archived`; archived hidden from search, live in their own section | `models.ts`, `HomeBoard.tsx` |
| Reuse | One-tap copy per message (`handleCopy`) | `ThreadView.tsx` |
| Organization | Pin threads/messages/projects (`pinned` + `pinnedAt` float above) | `ui/sort.ts` |
| Organization | Drag reorder everywhere (home, projects grid, thread messages, project detail, sidebar groups) with fractional ranks | `ui/sortable.tsx`, `sync/view-state.ts` |
| Organization | Collapse threads/messages/groups; section collapse (`section:home-projects`) | `sync/view-state.ts` |
| Finding | Search + sort controls (newest/oldest/recently updated/most used/name) shared across boards | `ui/sort.ts` |
| Navigation | `Cmd/Ctrl+K` command palette: jump to thread/project, create, open settings/trash | `CommandPalette.tsx` |
| Navigation | Burger menu with create/rename/delete actions; hash router (`/`, `/projects`, `/project/:id`, `/:threadId`, `/trash`, `/settings`) | `BurgerMenu.tsx`, `lib/router.ts` |
| Metadata | Tags, category, rating 1–5, usageCount, modelHints, language, tokenEstimate, notes, domain, parentId/version prompt lineage | `models.ts` |
| Safety | Trash = synced record of every tombstone (kind + when), 90-day "recent only" filter, **record not restore** | `TrashPage.tsx` |
| Backups | Export all / one thread / one project (JSON, includes arrangement + settings); import merges by id, never duplicates, never resurrects a tombstone | `lib/store.ts` |
| Onboarding | Import adapters for **ChatGPT** and **Claude** exports, auto-detected, assistant turns prefixed | `lib/import-adapters.ts` |
| First run | Onboarding component | `Onboarding.tsx` |
| Chrome | Dark/light theme, IANA time zone picker for stamps, relative-time rendering | `Settings.tsx`, `ui/relative-time.ts` |
| Sync | Full E2EE multi-device sync (see §5) | `src/sync/*`, `functions/sync/*` |
| Sync | Device list with friendly names + last-seen, rename own device | `Settings > Devices` |
| Sync | Background wake via Web Push (silent by default); optional **“Gistory · N new messages”** opt-in notification; tap focuses/opens the app | `labs/prd-sync.md`, `sw/sw.ts` |
| Public | Lander page, Privacy page, Terms page, footer | `Lander.tsx`, `PrivacyPage.tsx`, `TermsPage.tsx` |

### 2.1 Explicitly NOT in the product

- **Accounts / login / email / OAuth.** Nothing knows who you are.
- **Server-side plaintext** — search, analytics, scraping prompts. Everything
  searchable happens locally on decrypted data.
- **PWA install / manifest.** The user has explicitly ruled it out
  (2026-10-22); Web Push works without it on the target fleet.
- **A delete-or-restore endpoint on the relay.** Real chains are never
  deleted server-side; the server cannot tell "on holiday" from "abandoned".
- **Anything that makes the server smarter than a blind, budgeted store**
  (no LWW logic server-side, no content intelligence, no per-user quotas
  beyond payload caps and rate limits).
- No mobile app; the product is the same responsive web app everywhere.

## 3. Data model (client-owned, server-ciphertext)

Defined in `src/lib/models.ts`. **All authoring timestamps live on the
client**; ids are client-generated strings (`prefix + counter + random`, see
`generateId`). The merge compares `updatedAt ?? createdAt` — a field that
forgets to bump `updatedAt` on edit silently loses merges (Gotcha 4 in
`AGENTS.md`).

```ts
Thread {
  id, name, projectIds: string[], createdAt, updatedAt?,
  pinned?, pinnedAt?,                      // pin state is part of the item
  metadata?: PromptMetadata
}
Message {
  id, threadId, content, createdAt, updatedAt?, pinned?, pinnedAt?
}
Project {
  id, name, createdAt, updatedAt?, archivedAt?, pinned?, pinnedAt?
}
PromptMetadata {
  tags, category?, status?: 'draft' | 'active' | 'archived',
  rating?: 1–5, usageCount?, modelHints?, language?, tokenEstimate?,
  notes?, domain?, parentId?, version?
}
```

Three satellite stores ride inside the same sync payload (`SyncData`):

- **`SyncData.view`** (`src/sync/view-state.ts`) — arrangement: per-item
  `rank` (fractional; step 1024; midpoint drags) and `collapsed`, keyed
  **namespaced by the owning surface** (`<threadId>`, `message:<id>`,
  `project:<id>`, `section:home-projects`). Merged per key by LWW. Anything
  reading or pruning these keys must use `viewKeyItem`.
- **`SyncData.settings`** — user prefs (currently the time zone), merged by
  LWW (`mergeSettings`).
- **Tombstone registry** (`DeletedRegistry` in `merge.ts`) — `id → deletedAt`
  per kind (threads/messages/projects). Deletion is a *newer fact*, not the
  item's absence; a newer edit resurrects, an older edit does not.

## 4. Surfaces

### 4.1 Public lander (`/` + Privacy + Terms)
Marketing pages with the privacy message front and center: "your data never
leaves your devices unencrypted". CTAs route into the app experience.
Onboarding (`Onboarding.tsx`) covers first-run behavior in-app.

### 4.2 Home board (`/`)
The main workspace. Threads first, a projects section below (collapsible via
`section:home-projects`). Search filter, sort control (same options across
boards), new thread / new project. Archived threads are excluded from search
and live in their own section. Board-level rename/delete with confirmation
dialogs (`usability.mjs` tests these).

### 4.3 Projects (`/projects`, `/project/:id`)
Projects grid (own search/sort/pin/drag), project detail listing the
threads that reference the project in `projectIds` (a thread may sit in
multiple projects). Sidebar project groups can be collapsed.

### 4.4 Thread view (`/:threadId`)
The conversation editor. Add/edit/delete messages; each message is plain
reusable text with a **copy button** (`handleCopy`). Pin, collapse, and drag
reorder messages. Per-thread and per-project export download from here and
Settings. Draft autosave lives in device-local storage under
`gistory_draft_<threadId>` (never synced, swept by `sweepDrafts`, see Gotcha
§7 cleanup); copy usage counting and thread rename happen here too.

### 4.5 Command palette (Cmd/Ctrl+K)
One flat list: matching threads and projects first, actions last; hints show
tags + draft presence; arrow-key + Enter navigation; Escape closes.

### 4.6 Settings (`/settings`)
Four tabs. **General**: dark mode (single source of truth lives in App, the
row only renders the control), time zone. **Sync**: create chain / join with
code / passphrase entry, Sync Now, sync status + last-sync time, sync error
display (pauses like throttling read as "saved; will upload" per
`errors.ts`), Background sync toggle with the opt-in notification checkbox
(only visible when permission is actually granted). **Devices**: chain's
device list (names, last seen), rename this device — note `/sync/status`
requires OUR deviceId and reveals the whole device list, which is why.
**Snapshot**: export all / thread / project, import (accepts Gistory JSON +
ChatGPT + Claude exports), last-export stamp and staleness nudge (the sync
relay keeps only the newest ~5 blobs per chain, so a downloaded export is
the real archive).

### 4.7 Trash (`/trash`)
Read-only view of the synced tombstone registry, filtered by kind with a
"recent only (90 days)" toggle. It is a **record, not a restore**: tombstones
can never be cleared while any old blob might carry the item, and no device
holds deleted content after merge. Deleting is permanent, and this page is
the contract that makes an unexpected empty board explainable.

## 5. The sync system (the product's spine)

Full mechanics live in `AGENTS.md` (Sync Architecture) and
`labs/prd-sync.md`; the contract level:

- **Chains, not accounts.** One passphrase + one chain id → one E2EE chain.
  Key derivation: `passphrase + chainId → PBKDF2(100k, SHA-256) → AES-GCM
  256`. Same inputs on any device derive the same key; the passphrase never
  leaves the device, and the server sees only ciphertext.
- **Write auth.** A 32-byte random **write secret** per chain, minted at
  creation and carried in the pairing token; the server stores only
  SHA-256(secret) and compares constant-time. Every chain is secured at
  creation (no legacy hole; `claim` is retired, answers 404). Pairing tokens
  are `GS1-<chainId>.<writeSecret>`, shown as QR and pasteable text.
- **Protocol.** Full-state push (client coalesced ~1.5 s after the last
  edit via `SyncQos`), server-assigned per-chain `seq`
  (`INSERT…SELECT MAX(seq)+1`), pull filtered to *other* devices
  (`since > watermark`), merge, push merged state. Watermarks persist per
  chain (`gistory_seq_<chainId>`) and only advance on successfully
  consumed blobs; a failing decrypt pins the watermark before the bad
  blob so it retries instead of vanishing.
- **Merge.** Pure, unit-tested (`src/sync/merge.ts`): LWW on
  `updatedAt ?? createdAt`, deterministic tie-break on the larger
  sender deviceId, tombstones for deletes, `view`/`settings` per-key LWW.
  Messages-not-in-a-known-thread are dropped.
- **Background sync (Web Push, opt-in per device).** After a push the relay
  sends a silent, VAPID-signed, RFC 8291-encrypted wake to the chain's
  *other* subscribed devices. The service worker (`src/sw/sw.ts`, esbuild
  source — never edit `dist/sw.js`) shares the page's real
  agent/merge/IndexedDB code, pulls → merges; an open app page is
  BroadcastChannel-nudged and the pull-merge handoff is redirected there
  (one writer per store, per moment). The optional notification badge is
  computed in the worker from a snapshot diff (relay never learns content),
  has `tag: 'gistory'` so wakes replace, never stack, and is gated on the
  closed-tab path + an opt-in shared pref. Wake liveness is a *positive*
  signal: accepted wakes stamp `last_seen`, the daily/weekly sweep drops
  rows with no stamp in 30 days, and every app open re-posts the stored
  subscription to self-heal. Correctness never depends on the ping.
- **Guards (server-side backstop).** Fixed-window D1 throttles per scope
  (`push` 120/min per device, `push-chain` 600/min, `pull` 240/min,
  `handshake` 20/min, `write-fail` 20/min per chain — a wrong/missing
  write secret charges *that*, not the device's push budget), an in-isolate
  circuit breaker (5 consecutive failures → 15 s of fast 503s), and a
  cheap WAF (structure, `__proto__` keys, ≤32 fields, payload caps enforced
  twice: declared `Content-Length` before buffering, real length after
  read). Refused requests never advance their counter. Client QoS honors
  `Retry-After` with backoff + jitter and never drops a failed push
  (terminal 4xx excepted).
- **Self-service storage hygiene.** `rate_limits` self-prunes (sampled
  sweep every 256th request + a daily job), blobs keep the newest ~5
  full-state snapshots per chain (each surviving snapshot is a complete
  restore point), `live-test-*` debris is swept whole, and stale devices
  (>90 days unseen) are dropped. Real chains are never touched.

## 6. Security & privacy model

**Protected:** the content of every prompt/message/project (ciphertext
end-to-end), and the passphrase (never transmitted, never derivable from
anything stored server-side).

**Deliberately visible** (by design, no content): chain ids, device
names/ids, timestamped opaque blobs, per-device activity cadence, that a
chain exists at all. Anyone holding a pairing code can read a chain's
ciphertext (useless without the passphrase) and write to it with the secret
in the token — treat tokens like passwords.

**The one guaranteed loss:** a forgotten passphrase means the data is gone.
There is no recovery, no reset, no server-side escrow. This is marketed as a
feature and documented in README (`Lost passphrase`).

## 7. Architecture map

```
Frontend (React 19 + Vite 6, hash router, Tailwind-era hand-rolled CSS themes)
  src/App.tsx            app state, sync lifecycle, merge wiring
  src/components/*       boards, thread view, settings, trash, palette, public pages
  src/lib/router.ts      hash-based routes (no react-router usage in practice)
  src/lib/store.ts       loaders/savers (IndexedDB authoritative + localStorage
                         shadow via src/sync/idb.ts), export/import, drafts, sweep
  src/lib/models.ts      Thread/Message/Project/PromptMetadata
  src/ui/*               sortable, sort options, relative time, view-state API
  src/sync/*             agent (crypto+sync), merge, qos, errors, bg-sync,
                         view-state, idb
  src/sw/sw.ts           service worker SOURCE → dist/sw.js (esbuild, `bun run build`)
Relay (Cloudflare Pages Functions → D1)
  functions/sync/{handshake,push,pull,status,subscribe}.ts   the five routes
  functions/_shared/{sync.ts,guards.ts,push-fanout.ts}       shared plumbing
  schema.sql (fresh build) + migrations/ (append-only history)
Ops
  scripts/db-migrate.mjs, db-maintain.mjs, ui-audit.mjs, vapid-keygen.mjs …
  .github/workflows/{ci,migrate,maintenance}.yml
```

Nothing else runs the product. There is no API base URL to manage for the
production app: Pages Functions are same-origin beside `dist/` (`VITE_SYNC_URL`
exists only for running the bare Vite dev server against a deployed relay).

## 8. Verification (what every change trips through)

| Command | What it proves |
|---|---|
| `bun run typecheck` | 3 passes: app (`src/`), strict Functions pass, strict tests pass |
| `bun run sync:smoke` | real crypto + real merge + real route handlers on in-memory SQLite (338 assertions) |
| `bun run db:migrate:check` | full migration history builds & verifies on a fresh DB |
| `bun run lint` | ESLint (hooks order, unused vars) + a language/grammar check |
| `bun run build` | tsc → vite → brand inject → prerender → **sw.js bundle** (order matters) |
| `bun run ui:audit` / `test:ui` | headless Chromium: every route × 2 themes × 2 viewports, plus interaction flows, drag ordering, export/import round trip |

CI (`.github/workflows/ci.yml`) runs the first four + build on every push;
the browser suites are local-only by design. `migrate.yml` applies schema
migration from GitHub with a re-run verify gate + `production` environment
protection; `maintenance.yml` runs the daily D1 prune with row counts.

## 9. Non-negotiables for contributors

Condensed from `AGENTS.md` — the rules most likely to bite:

1. **Any pinnable/editable model must bump `updatedAt`** on every mutation,
   or the merge silently reverts it on other devices (the `Message` story).
2. **View-state keys are surface-namespaced.** Compare with
   `viewKeyItem(key)`, never the raw key; `pruneView`, `App.forgetView`,
   and `viewFor` each once ate this bug.
3. **Every arrangeable surface needs a drag handle** (pointer + keyboard);
   reordering under an active filter switches to full-order splicing
   (`App.reorder`'s `allIds` path).
4. **The push path must never sit behind an optional chain** — `SyncQos` is
   created on demand before any `syncNow()` can fire, or the first push
   after enabling sync (the user's existing library) is dropped.
5. **Edit `src/sw/sw.ts`, never its bundles**; the wake path shares the
   page's crypto/merge modules, and divergent copies corrupt chains.
6. **Storage passes through `src/sync/idb.ts`.** localStorage is a shadow;
   the SW reads neither — assumptions about storage shape (enumeration,
   throw-on-full, prerender node environment) belong in that one layer.
7. **Migrations are append-only**; `schema.sql` only builds fresh databases.
   Never edit an applied migration.
8. **The relay stays blind.** Any new feature must not give the server a
   reason to parse, interpret, or derive anything from chain data.

## 10. Glossary

- **Chain** — one user's sync universe: a chain id (also the PBKDF2 salt),
  its devices (no hard cap, bounded in practice), and its encrypted blob
  history.
- **Device** — one browser instance; `deviceId` is a random id used for
  authorship filtering, merge tie-breaks, throttles, and the status route.
- **Watermark** — the highest `seq` a device has fully consumed
  (`gistory_seq_<chainId>`).
- **Tombstone** — `id → deletedAt` record that makes deletes permanent
  across devices and exports.
- **Write secret** — per-chain random write key (server stores its SHA-256);
  riding in the pairing token.
- **Pairing token** — `GS1-<chainId>.<writeSecret>`; QR + copyable.
- **Wake** — the silent Web Push ping the relay fans out after a push.
- **Snapshot** — one full-state blob; each chain keeps the newest ~5 as
  implicit restore points.

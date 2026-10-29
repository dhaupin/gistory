# PRD: gistory (the prompt keeper, and the prototype factory)

**Status:** v0.2 - current (2026-10-29) · Owner: dhaupin
**Role:** product + prototype factory. The product is the privacy-first prompt keeper app. The factory role here is a **prototype**: gistory proved the staging-tree plus ferry pattern, and **railyard is the real factory taking over** (govstruct case study 16.6).
**Package:** the app is `gistory.creadev.org` (private, not an npm package); the reusable engine ships as **`gistory-sync` @ 0.9.0** (node >=18) - repo 0.9.0, npm not yet published.
**Core law:** the relay stays blind. No plaintext ever leaves a device, and no accounts exist.
**Family:** the five arms are **govstruct** (govern), **packstruct** (spec),
**crashtest** (attack), **eyestruct** (watch), **poststruct** (audit). The forges
are **monoforge** (the repo stamp) and **coreforge** (the site rig); **railyard**
is the composer. gistory is both a **product** governed by the suite and the
**prototype factory** (govstruct PRD 3.1): it holds the staging trees and ferries
proven blocks to standalone repos, proving the pattern that **railyard** (the
real factory) now takes over. The interop law: no host imports a sibling to
check a sibling; it invokes the sibling's public CLI.

---

## 1. One-line pitch

**Your prompts, on every device you own, in ciphertext the server cannot read,
backed up by an offline-capable design that never assumes the network is
there.** Gistory stores threads (a prompt conversation: a sequence of short
reusable text messages) organized into projects, with metadata tuned for prompt
reuse, and keeps all of it end-to-end encrypted while syncing across a user's
devices with no accounts, no server trust, and no plaintext ever leaving a
device.

## 2. The two faces of this repo

gistory is unusual in the family: one repo carries both a product and the
factory.

| face | what it is | where |
|---|---|---|
| **product** | the prompt keeper app: React 19 + Vite 6 client, Cloudflare Pages Functions relay, D1 store | `src/`, `functions/`, `schema.sql`, `migrations/` |
| **engine** | the reusable sync library shipped to npm as `gistory-sync` | `src/sync/*` built by `build:lib` |
| **prototype factory** | the staging trees plus the ferry that lands proven blocks into standalone repos - the pattern railyard takes over | `mounts/`, `labs/tar-move-plan.md`, the ferry scripts |

The factory role is govstruct's to define (PRD 3.1, case study 16.6): gistory
holds `poststruct-staging/` and `monoforge-staging/`, and the ferry scripts land
their payloads in the standalone repos. This is the **prototype**: gistory built
and proved the factory pattern, and **railyard is the real factory taking over**
(govstruct 16.6) - the mount registry and the composer role move to railyard,
and gistory's factory entry retires when the move lands.

## 3. Who it is for

- A person who runs prompt workflows (coding, writing, legal/medical/domain
  research) and reuses prompts over months.
- They want it **not on someone else's cloud**: no login, no plaintext backup.
- They use several devices (the target fleet: Android Chrome/Brave phones plus
  desktops) and expect edits to appear everywhere - including from a closed
  phone via background sync.

## 4. Product principles

1. **The relay is blind.** The server stores only ciphertext. It never receives,
   derives, or stores anything derived from the passphrase. Today: AES-GCM
   blobs, chain ids, device rows, sequence numbers, rate-limit buckets.
   Tomorrow: the same. Any feature that would require the server to understand
   user content is out of scope by definition.
2. **No accounts.** Identity is a passphrase plus a chain; pairing is a QR or
   token. Losing the passphrase loses the data (documented, deliberate).
3. **Offline-first.** Every device holds the full library locally
   (IndexedDB-backed), merges what it can pull, and converges by watermark.
   Nothing in the correctness story requires the relay or the network.
4. **Open source, single deployment.** Static React app plus Pages Functions
   plus D1 in one Cloudflare Pages project; no separate worker, no third-party
   sync service.
5. **Deletions are permanent and visible.** Tombstones, a synced trash log, and
   no restore path.

## 5. Feature inventory (what ships today)

| area | feature | where |
|---|---|---|
| Content | Threads to messages; edit/delete; per-thread draft autosave | `ThreadView.tsx`, `store.ts` |
| Content | Projects as folders; a thread can live in several projects | `ProjectsBoard.tsx`, `ProjectDetail.tsx` |
| Content | Thread statuses `draft / active / archived`; archived hidden from search, live in their own section | `models.ts`, `HomeBoard.tsx` |
| Reuse | One-tap copy per message | `ThreadView.tsx` |
| Organization | Pin threads/messages/projects (pinned float above) | `ui/sort.ts` |
| Organization | Drag reorder everywhere with fractional ranks | `ui/sortable.tsx`, `sync/view-state.ts` |
| Organization | Collapse threads/messages/groups; section collapse | `sync/view-state.ts` |
| Finding | Search plus sort controls shared across boards | `ui/sort.ts` |
| Navigation | `Cmd/Ctrl+K` command palette | `CommandPalette.tsx` |
| Navigation | Burger menu plus hash router | `BurgerMenu.tsx`, `lib/router.ts` |
| Metadata | Tags, category, rating, usageCount, modelHints, language, tokenEstimate, notes, domain, prompt lineage | `models.ts` |
| Safety | Trash = synced record of every tombstone, 90-day filter, **record not restore** | `TrashPage.tsx` |
| Backups | Export all / one thread / one project (JSON); import merges by id, never duplicates, never resurrects a tombstone | `lib/store.ts` |
| Onboarding | Import adapters for ChatGPT and Claude exports | `lib/import-adapters.ts` |
| Chrome | Dark/light theme, IANA time zone picker, relative-time rendering | `Settings.tsx`, `ui/relative-time.ts` |
| Sync | Full E2EE multi-device sync (section 6) | `src/sync/*`, `functions/sync/*` |
| Sync | Device list with friendly names plus last-seen, rename own device | `Settings > Devices` |
| Sync | Background wake via Web Push (silent by default); optional notification | `labs/prd-sync.md`, `sw/sw.ts` |
| Public | Lander page, Privacy page, Terms page, footer | `Lander.tsx`, `PrivacyPage.tsx`, `TermsPage.tsx` |

### 5.1 Explicitly NOT in the product

- **Accounts / login / email / OAuth.** Nothing knows who you are.
- **Server-side plaintext** - search, analytics, scraping prompts. Everything
  searchable happens locally on decrypted data.
- **PWA install / manifest.** Ruled out by the owner (2026-10-22); Web Push
  works without it on the target fleet.
- **A delete-or-restore endpoint on the relay.** Real chains are never deleted
  server-side; the server cannot tell "on holiday" from "abandoned".
- **Anything that makes the server smarter than a blind, budgeted store.**
- No mobile app; the product is the same responsive web app everywhere.

## 6. The sync system (the product's spine)

Full mechanics live in `AGENTS.md` (Sync Architecture) and `labs/prd-sync.md`;
the contract level:

- **Chains, not accounts.** One passphrase plus one chain id yields one E2EE
  chain. Key derivation: `passphrase + chainId -> PBKDF2(100k, SHA-256) ->
  AES-GCM 256`. The passphrase never leaves the device; the server sees only
  ciphertext.
- **Write auth.** A 32-byte random write secret per chain, minted at creation
  and carried in the pairing token; the server stores only SHA-256(secret) and
  compares constant-time. Every chain is secured at creation (no legacy hole;
  `claim` is retired, answers 404). Pairing tokens are
  `GS1-<chainId>.<writeSecret>`.
- **Protocol.** Full-state push (coalesced about 1.5 s after the last edit via
  `SyncQos`), server-assigned per-chain `seq`, pull filtered to other devices,
  merge, push merged state. Watermarks persist per chain and only advance on
  successfully consumed blobs; a failing decrypt pins the watermark before the
  bad blob so it retries instead of vanishing.
- **Merge.** Pure and unit-tested (`src/sync/merge.ts`): LWW on
  `updatedAt ?? createdAt`, deterministic tie-break on the larger sender
  deviceId, tombstones for deletes, per-key LWW for view/settings.
- **Background sync (Web Push, opt-in per device).** After a push the relay
  sends a silent, VAPID-signed, RFC 8291-encrypted wake to the chain's other
  subscribed devices. The service worker shares the page's crypto/merge/
  IndexedDB code; an open app page is nudged and the pull-merge handoff is
  redirected there (one writer per store, per moment). Correctness never
  depends on the ping.
- **Guards (server-side backstop).** Fixed-window D1 throttles per scope, an
  in-isolate circuit breaker, and a cheap WAF (structure, `__proto__` keys,
  field caps, payload caps enforced twice). Refused requests never advance
  their counter. Client QoS honors `Retry-After` and never drops a failed push.
- **Self-service storage hygiene.** `rate_limits` self-prunes, blobs keep the
  newest about 5 full-state snapshots per chain, test debris is swept whole,
  and stale devices are dropped. Real chains are never touched.

## 7. Data model (client-owned, server-ciphertext)

Defined in `src/lib/models.ts`. All authoring timestamps live on the client;
ids are client-generated. The merge compares `updatedAt ?? createdAt` - a field
that forgets to bump `updatedAt` on edit silently loses merges.

Three satellite stores ride inside the same sync payload: `SyncData.view`
(arrangement: per-item fractional `rank` and `collapsed`, keyed namespaced by
the owning surface), `SyncData.settings` (user prefs, merged by LWW), and the
tombstone registry (`id -> deletedAt` per kind). Deletion is a newer fact, not
the item's absence; a newer edit resurrects, an older edit does not.

## 8. Security and privacy model

**Protected:** the content of every prompt/message/project (ciphertext
end-to-end), and the passphrase (never transmitted, never derivable from
anything stored server-side).

**Deliberately visible** (by design, no content): chain ids, device names and
ids, timestamped opaque blobs, per-device activity cadence, that a chain exists
at all. Anyone holding a pairing code can read a chain's ciphertext (useless
without the passphrase) and write to it with the secret in the token - treat
tokens like passwords.

**The one guaranteed loss:** a forgotten passphrase means the data is gone.
There is no recovery, no reset, no server-side escrow. This is marketed as a
feature and documented in the README.

## 9. Architecture map

```
Frontend (React 19 + Vite 6, hash router, hand-rolled CSS themes)
  src/App.tsx            app state, sync lifecycle, merge wiring
  src/components/*       boards, thread view, settings, trash, palette, public pages
  src/lib/store.ts       loaders/savers (IndexedDB authoritative + localStorage shadow), export/import, drafts
  src/lib/models.ts      Thread/Message/Project/PromptMetadata
  src/ui/*               sortable, sort options, relative time, view-state API
  src/sync/*             agent (crypto+sync), merge, qos, errors, bg-sync, view-state, idb
  src/sw/sw.ts           service worker SOURCE -> dist/sw.js (esbuild)
Relay (Cloudflare Pages Functions -> D1)
  functions/sync/{handshake,push,pull,status,subscribe}.ts   the five routes
  functions/_shared/{sync.ts,guards.ts,push-fanout.ts}       shared plumbing
  schema.sql (fresh build) + migrations/ (append-only history)
Factory
  mounts/state.json      the mount registry (tier, tree, repo, boot contents)
  mounts/{public,private,local}/   per-tier mount dirs with boot/ carry space
Ops
  scripts/db-migrate.mjs, db-maintain.mjs, ui-audit.mjs, vapid-keygen.mjs
  .github/workflows/{ci,migrate,maintenance}.yml
```

Nothing else runs the product. Pages Functions are same-origin beside `dist/`
(`VITE_SYNC_URL` exists only for running the bare Vite dev server against a
deployed relay).

## 10. The factory (mounts plus the ferry)

gistory is the family's **prototype factory**: it proved the pattern, and
railyard is the real factory taking over (govstruct 16.6). Its `mounts/`
registry mirrors
vant's `/models` rigging:

```
mounts/
  public/<mount>/     # payload ships upstream (dhaupin/<mount>)
  private/<mount>/    # shared inside the ecosystem (install-visible, not public)
  local/<mount>/      # never pushes anywhere
  state.json          # the registry: tier, tree, repo, boot contents per mount
```

Each mount's `boot/` is carry space, not content: `boot/tars/` (reproducible
snapshot tars plus lock archives), `boot/handoff/` (transport payloads), and
`boot/stone/` (the mount's own stones). The staging trees stay where they are;
`mounts/` holds payloads only. Move day untars `boot/tars/<mount>-staging-*.tar.gz`
into the standalone repos per `labs/tar-move-plan.md`.

The ferry is path-blind: the make and verify scripts resolve each mount's boot
through `boot_tars()`, and the snapshot-filename chain is byte-deterministic.
The tier spec is filed to vant and packstruct, so the models/mounts/packs rigs
all speak public/private/local the same way.

## 11. Verification (what every change trips through)

| command | what it proves |
|---|---|
| `bun run typecheck` | 3 passes: app, strict Functions, strict tests |
| `bun run sync:smoke` | real crypto plus real merge plus real route handlers on in-memory SQLite |
| `bun run db:migrate:check` | full migration history builds and verifies on a fresh DB |
| `bun run lint` | ESLint plus language plus docs plus version-truth gates |
| `bun run build` | tsc, vite, brand inject, prerender, sw.js bundle (order matters) |
| `bun run ui:audit` / `test:ui` | headless Chromium: every route x 2 themes x 2 viewports, plus interaction flows |
| `bun run crashtest:run` | the in-repo crashtest pack against the built tree |

CI runs the first four plus build on every push; the browser suites are
local-only by design. `migrate.yml` applies schema migration with a re-run
verify gate plus environment protection; `maintenance.yml` runs the daily D1
prune.

## 12. Non-negotiables for contributors

1. **Any pinnable/editable model must bump `updatedAt`** on every mutation, or
   the merge silently reverts it on other devices.
2. **View-state keys are surface-namespaced.** Compare with `viewKeyItem(key)`,
   never the raw key.
3. **Every arrangeable surface needs a drag handle** (pointer plus keyboard);
   reordering under an active filter switches to full-order splicing.
4. **The push path must never sit behind an optional chain** - `SyncQos` is
   created on demand before any `syncNow()` can fire, or the first push after
   enabling sync is dropped.
5. **Edit `src/sw/sw.ts`, never its bundles**; the wake path shares the page's
   crypto/merge modules, and divergent copies corrupt chains.
6. **Storage passes through `src/sync/idb.ts`.** localStorage is a shadow; the
   SW reads neither.
7. **Migrations are append-only**; `schema.sql` only builds fresh databases.
8. **The relay stays blind.** Any new feature must not give the server a reason
   to parse, interpret, or derive anything from chain data.

## 13. Release truth and the family crossing

- **Two npm names, one product.** The app is private; the engine is
  `gistory-sync`. The published `gistory` npm package is an unrelated GitHub
  history tool - never ours.
- **Engine publish state:** `gistory-sync` @ 0.9.0 is built from the monorepo
  (`build:lib`) but **not yet on npm** (registry 404). The 0.9.x manual publish
  is the outstanding release step.
- **Governed by the suite:** gistory's `packs/` runs under packstruct; its
  crashtest pack attacks the built tree; poststruct audits the baked output;
  govstruct's manifest carries gistory as both product and prototype factory,
  and the factory role is **delegated to railyard** (govstruct 16.6: the real
  factory takes over).

## 14. Non-goals

- **No accounts, no server-side plaintext, no content intelligence.**
- **No delete-or-restore endpoint on the relay.**
- **No PWA install** on the target fleet.
- **No mobile app**; the web app is the product everywhere.
- **No third-party sync service**; the relay is ours and blind.

## 15. Glossary

- **Chain** - one user's sync universe: a chain id (also the PBKDF2 salt), its
  devices, and its encrypted blob history.
- **Device** - one browser instance; `deviceId` is used for authorship
  filtering, merge tie-breaks, throttles, and the status route.
- **Watermark** - the highest `seq` a device has fully consumed.
- **Tombstone** - an `id -> deletedAt` record that makes deletes permanent.
- **Write secret** - per-chain random write key (server stores its SHA-256).
- **Pairing token** - `GS1-<chainId>.<writeSecret>`; QR plus copyable.
- **Wake** - the silent Web Push ping the relay fans out after a push.
- **Snapshot** - one full-state blob; each chain keeps the newest about 5.

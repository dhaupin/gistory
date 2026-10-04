# Gistory

A secure, privacy-first prompt keeper for AI prompting workflows. Built with React + Cloudflare Pages (Functions + D1).

## Features

- **Encrypted sync** — end-to-end encryption (AES-GCM); the server only ever sees ciphertext
- **Multi-device** — one passphrase + a pairing code joins any device to the same chain
- **QR pairing** — scan or paste the pairing code to add a device
- **Privacy first** — your data never leaves your devices unencrypted
- **Conflict resolution** — last-write-wins with a deterministic deviceId tie-breaker
- **Safe deletes** — deletions sync via tombstones so they are never resurrected
- **Pin, reorder & collapse** — threads, messages, and projects can each be pinned, dragged into your own order, and folded away
- **Arrangement syncs** — your custom order and collapsed state travel with your data, so every device shows the same layout

## Quick Start

```bash
git clone https://github.com/dhaupin/gistory.git
cd gistory
bun install       # or npm install
bun run db:migrate:local
npx wrangler pages dev dist
```

Then open the printed URL. `bun run dev` alone runs the Vite frontend without
the `/sync` API; to point it at a deployed API instead, set `VITE_SYNC_URL`.

## Deploying to Cloudflare Pages

The whole product — static app **and** `/sync` API — ships as a single Pages
project. Pages serves the assets from `dist/` and the API from the repo-root
`functions/` directory in the same deployment. No separate Worker.

### No database ids in this repository

Gistory is open source, so **no real D1 `database_id` is committed**. The
binding is configured in the Cloudflare dashboard instead:

1. **Create the database**

   ```bash
   npx wrangler d1 create gistory
   ```

2. **Apply the schema**

   ```bash
   cp wrangler.deploy.example.toml wrangler.deploy.toml   # paste your database_id
   bun run db:migrate:remote
   ```

   `wrangler.deploy.toml` is gitignored — it exists only so Wrangler can resolve
   your database from your machine.

### Changing the schema later

`schema.sql` can only ever *build* a database — re-running it against one that
already exists does nothing, so it can never add a column to a live database.
Schema changes therefore live in numbered files under `migrations/`:

```bash
bun run db:migrate:check      # build a fresh DB from the full history, verify it
bun run db:migrate:local      # apply pending migrations to local D1
bun run db:migrate:remote     # apply pending migrations to real D1
bun run db:migrate:status     # list applied/pending, change nothing
```

To add a column, create `migrations/0002_something.sql` containing the
`ALTER TABLE …`, then run the migrate command. Never edit a migration that has
already been applied: the runner records a checksum per file and refuses to
continue if an applied one changes, because that silently leaves existing
databases stranded on the old shape.

3. **Connect the repo** to a Pages project
   (Dashboard → Workers & Pages → Create → Pages → Connect to Git).

   - Build command: `bun run build` (or `npm run build`)
   - Build output directory: `dist`

4. **Add the binding** — Settings → **Bindings** → Add → **D1 database**

   - Variable name: `GISTRY_DB`
   - Database: the one you created

   Add it for **both production and preview**, then redeploy. The name
   `GISTRY_DB` is the only identifier that lives in the source code, and binding
   names are not secret.

5. **Custom domain** — Settings → Custom domains → `gistory.creadev.org`.

`wrangler.toml` deliberately **omits** `pages_build_output_dir`. Per
[Cloudflare's docs](https://developers.cloudflare.com/pages/functions/wrangler-configuration/),
a Wrangler file containing that key becomes the *source of truth* and locks the
dashboard's binding fields. Leaving it out keeps the file in "local development
only" mode, so the dashboard owns preview/production bindings and this repo stays
free of infrastructure identifiers.

### Why not a Pages secret?

Cloudflare bindings are **not** environment variables. `env.GISTRY_DB` is a
binding object injected by the platform, and a Wrangler config file has no
variable interpolation, so no secret or `[vars]` entry can supply a D1 database
id. Dashboard bindings are the supported mechanism for keeping it out of source
control.

### File-as-source-of-truth (alternative)

If you deploy with `wrangler pages deploy` from CI and have no dashboard access,
uncomment `pages_build_output_dir = "dist"` and add your real id to
`wrangler.toml`. That approach *does* put the id in the repo, so it is only
recommended for a private fork.

With the default setup, `wrangler pages deploy` prints a warning that the file
is "used for local development only". That is expected — Git integration deploys
read the build and binding settings from the dashboard instead.

## Usage

### Creating a chain (first device)

1. Settings (⚙️) → **Sync** → **Create a chain**
2. Enter a memorable passphrase (write it down — there is no recovery)
3. Press **Create Chain** — the chain id is shown and your data is pushed

### Pairing another device

1. On the existing device: **Pair Device** → shows a QR code and code (`GS1-…`)
2. On the new device: Settings → **Sync** → **Join with a code**
3. Enter the code and the **same passphrase** → **Join Chain**

The pairing code carries both the chain id **and** the chain’s write secret, so
a newly paired device can read *and* write. The passphrase is still typed by
hand and never travels in the code or reaches the server. A code generated
before write auth existed contains only a chain id — such a device can read the
chain but not write to it.

### Sync behaviour

- Local edits are pushed ~1.5 s after you stop typing
- Changes are pulled every 60 s, and when the tab regains focus / comes online
- **Sync Now** forces a pull → merge → push

## Architecture

### Client (React)

- `src/sync/agent.ts` — key derivation, encrypt/decrypt, push/pull, pairing codes
- `src/sync/merge.ts` — pure merge logic (LWW + tie-break + tombstones)
- `src/App.tsx` — agent lifecycle and merge wiring

### API (Cloudflare Pages Functions → D1)

```
functions/
├── _shared/sync.ts   # D1 helpers, validation, CORS (not a route: "_" prefix)
└── sync/
    ├── handshake.ts  # POST  /sync/handshake  create/join chain, register device
    ├── push.ts       # POST  /sync/push       store blob, assign seq
    ├── pull.ts       # GET   /sync/pull       blobs since <seq>, minus own device
    └── status.ts     # GET   /sync/status     head seq, version, devices
```

### Key model

```
passphrase + chainId --PBKDF2(100k, SHA-256)--> AES-GCM-256 key
```

`chainId` is both the PBKDF2 salt and the chain identifier, so every device with
the same passphrase **and** the same chainId derives the **same** key. The
chainId travels inside the pairing code; the passphrase never leaves the device.

### Write auth

Reading a chain needs only the passphrase. *Writing* needs a separate random
**write secret** per chain, minted by the device that creates it and carried to
others in the pairing code:

```
chainId + writeSecret  →  handshake  →  server stores SHA-256(writeSecret)
push { …, writeSecret }  →  constant-time compare  →  stored, or 401/403
```

The server therefore never holds the write secret, and never anything derived
from your passphrase. Without it, anyone knowing the chain id could append a
blob — and since a client cannot read a blob encrypted under a different key,
one such blob would pin its watermark and block every legitimate change behind
it, permanently.

Chains created before this existed keep working without a secret, and their
owner can install one via `POST /sync/claim`. That claim is first-come-wins —
the server has no prior secret for such a chain, so it cannot tell the owner
apart from someone holding an older pairing code. It cannot do worse than
refuse future writes: blobs stay ciphertext, so it reveals no one's data.

### Guards

Three guards sit in front of every sync route, in `functions/_shared/guards.ts`.
They are a backstop — Cloudflare's edge rate limiting still belongs at the edge
— but the edge cannot see which *chain* a caller is hammering, nor what a valid
write secret looks like.

**Throttle.** A fixed-window counter per bucket in D1, so push *rate* is bounded
as well as push *size*:

| Scope | Subject | Limit |
|-------|---------|-------|
| `push` | device | 120/min |
| `push-chain` | chain | 600/min |
| `pull` | device | 240/min |
| `handshake` | device | 20/min |
| `claim` | chain | 5/min |
| `write-fail` | chain | 20/min |

Exceeding one returns `429` with a `Retry-After` header. Two rules are
deliberate: a refused request does not advance its counter (so a client that
keeps retrying recovers on schedule rather than looking permanently banned), and
a wrong write secret is charged to the chain's `write-fail` budget rather than
the device's `push` budget — so a third party guessing at a chain cannot use up
a legitimate device's allowance.

**Circuit breaker.** Five consecutive storage failures open the breaker for 15s;
requests then get a fast `503` with `Retry-After` instead of slow timeouts, and
one trial request is let through after the cooldown to see if storage is back.

**WAF.** Cheap rejections of things a real client never sends: non-object
bodies, `__proto__` keys, absurd field counts, and oversized payloads. This is
not a SQL-injection defence — every statement is parameterised already.

On the client, `SyncQos` (`src/sync/qos.ts`) debounces pushes, coalesces changes
that arrive mid-push into a single follow-up, and retries failures with
exponential backoff honouring the server's `Retry-After`. A failed push is never
dropped, so a throttle reads as “saved locally, uploading shortly” rather than a
lost change.

### Applying migrations

The relay's schema lives in `migrations/` and is applied by
`scripts/db-migrate.mjs`, which records what each database has already applied
and refuses to run if an applied file has since changed. Apply it to production
either way:

**Locally**

```bash
cp wrangler.deploy.example.toml wrangler.deploy.toml   # set database_id
bun run db:migrate:remote
```

**From GitHub Actions** (works from the GitHub mobile app, no local setup)

`.github/workflows/migrate.yml` runs the same command. It triggers two ways:

- **Actions → Migrate D1 → Run workflow.** Defaults to a dry run that reports
  pending migrations without writing. Untick *dry run* to apply.
- **Automatically** on any push to `main` that touches `migrations/`.

Add these three secrets in GitHub (Settings → Secrets and variables → Actions):

| Secret | What it is |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with *Account → D1 Database → Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Account holding the D1 database |
| `CLOUDFLARE_D1_DATABASE_ID` | From `wrangler d1 create gistory` |

**These are never written to the repository.** GitHub stores them encrypted and
only exposes them to a workflow run as environment variables — there is nothing
to commit, and no `.env` file, so an open-source repo is not a problem here. The
workflow writes the database id into `wrangler.deploy.toml` at run time, which
is why that file is gitignored.

**Prefer environment secrets in an open-source repo.** The migrate job declares
`environment: production`, so the tighter home for these is
**Settings → Environments → production → Environment secrets** rather than
repository secrets. Same three names, same workflow, but they are then only
readable by jobs that declare that environment — a fork cannot reach them, and
neither can any other workflow you add later. Use whichever you prefer; both
work with the workflow as written.

Before it touches the database the workflow re-runs typecheck, the sync smoke
test and the migration-history check on the same commit, and the job sits behind
a `production` environment — add required reviewers or a wait timer there if you
want a human in the loop. The passphrase is never involved; the relay only ever
holds ciphertext.

### Storage (D1 / SQLite)

| Table | Purpose |
|-------|---------|
| `chains` | chain id, created_at, version, push_hash (write-secret hash) |
| `devices` | device id → chain, name, last_seen |
| `blobs` | `(chain_id, seq)` → encrypted payload, author device, created_at |
| `rate_limits` | throttle buckets: key, window_start, count |

## Technical Details

### Sync protocol

1. Device A encrypts its full state and `POST /sync/push`
2. The server assigns the next `seq` for the chain and stores the blob
3. Device B `GET /sync/pull?since=<lastSeq>` — the server filters out B's own blobs
4. B decrypts, merges, then pushes its merged state

The pull watermark only advances for successfully consumed blobs; if a payload
cannot be decrypted (wrong passphrase) the watermark holds so it can be retried.

### Conflict resolution

```ts
// Later timestamp wins (updatedAt, falling back to createdAt)
if (incomingTs > localTs) return incoming
if (incomingTs < localTs) return local
// Tie-breaker: lexicographically larger sender deviceId wins (both sides agree)
return senderDeviceId > myDeviceId ? incoming : local
```

### Deletions

Deleting an item records a tombstone (`id → deletedAt`) that syncs with the
payload. A tombstone hides an item unless the item was edited *after* the
deletion, in which case the newer edit wins and the item is restored.

### Tests

`bun run sync:smoke` runs the real agent crypto, the real merge logic, and the
real Pages Functions handlers against an in-memory SQLite database — no network
or Cloudflare account needed.

There is also a headless-browser harness for the UI. It is dev-only tooling and
is never part of a build:

```bash
bun run ui:browsers   # once per machine — Chromium is not installed by `npm install`
bun run ui:audit      # audit every route x 2 themes x desktop/mobile
bun run test:ui       # browser tests (flows, export/import round trip, control metrics)
```

`ui:audit` fails on findings (console errors, horizontal overflow, off-viewport
elements, WCAG-AA contrast, text under 12px, targets under 32px, unnamed
controls, unlabeled inputs, clipped text, duplicate ids, blank pages) so it can
gate a change; add `--soft` to only report. Screenshots land in `.ui-audit/`.
Both commands take an optional URL — otherwise they use `PREVIEW_URL`, then
probe ports 5173–5180.

`.puppeteerrc.cjs` sets `skipDownload: true`. That keeps `npm install` — which
the Pages build runs — fast and browser-free; `ui:browsers` re-enables the
download only for itself.

## Configuration files

| File | Committed? | Purpose |
|------|-----------|---------|
| `wrangler.toml` | yes | Local development only (`wrangler pages dev`). Placeholder D1 id, no `pages_build_output_dir`. |
| `wrangler.deploy.example.toml` | yes | Template for the private config below. |
| `wrangler.deploy.toml` | **no** (gitignored) | Your real `database_id`, used only by `bun run db:init:remote`. |
| `schema.sql` | yes | Flattened D1 schema for a fresh build. Use `migrations/` for changes. |
| `migrations/` | yes | Versioned schema history applied by `bun run db:migrate:*`. |
| `scripts/db-migrate.mjs` | yes | Zero-dependency migration runner (local + remote D1). |
| `.puppeteerrc.cjs` | yes | `skipDownload: true` — keeps `npm install` (and the Pages build) Chromium-free. |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Sync storage is not configured" | The `GISTRY_DB` binding is missing from the Pages project, or you did not redeploy after adding it |
| Build settings in the dashboard are read-only | `wrangler.toml` contains `pages_build_output_dir`; remove it to hand control back to the dashboard |
| "Unknown sync chain" | The device never completed a handshake, or the chain id changed |
| "N change(s) could not be decrypted — wrong passphrase?" | Devices are not using the same passphrase (or not the same chain) |
| "Cannot reach the sync server" | The API isn't deployed next to the app (Pages Functions missing) |

### Lost passphrase

There is no recovery — the encryption key is derived from it.

## License

MIT

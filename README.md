# Gistory

A secure, privacy-first prompt keeper for AI prompting workflows. Built with React + Cloudflare Pages (Functions + D1).

## Features

- **Encrypted sync** — end-to-end encryption (AES-GCM); the server only ever sees ciphertext
- **Multi-device** — one passphrase + a pairing code joins any device to the same chain
- **QR pairing** — scan or paste the pairing code to add a device
- **Privacy first** — your data never leaves your devices unencrypted
- **Conflict resolution** — last-write-wins with a deterministic deviceId tie-breaker
- **Safe deletes** — deletions sync via tombstones so they are never resurrected

## Quick Start

```bash
git clone https://github.com/dhaupin/gistory.git
cd gistory
bun install       # or npm install
bun run db:init:local
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
   bun run db:init:remote
   ```

   `wrangler.deploy.toml` is gitignored — it exists only so Wrangler can resolve
   your database from your machine. Alternatively, paste `schema.sql` into the
   D1 console in the dashboard and skip this file entirely.

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

### Storage (D1 / SQLite)

| Table | Purpose |
|-------|---------|
| `chains` | chain id, created_at, version |
| `devices` | device id → chain, name, last_seen |
| `blobs` | `(chain_id, seq)` → encrypted payload, author device, created_at |

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
| `schema.sql` | yes | D1 schema, applied with `bun run db:init:local` / `db:init:remote`. |
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

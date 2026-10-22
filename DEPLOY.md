# Deploying Gistory

Everything the product needs lives in this repo: the static app (Vite →
`dist/`), the `/sync` API (repo-root `functions/` Pages Functions over one
D1 database), the sync engine npm package, and the maintenance workflows.
This file is the complete setup and operations runbook — the README is the
[npm landing](https://www.npmjs.com/package/gistory-sync) for the sync
engine, so all of it lives here now.

## Local development

```bash
git clone https://github.com/dhaupin/gistory.git
cd gistory
bun install       # or npm install
bun run db:migrate:local
npx wrangler pages dev dist
```

`bun run dev` alone runs the Vite frontend without the `/sync` API; point it
at a deployed API instead with `VITE_SYNC_URL`.

## First-deploy checklist

The whole product — static app **and** `/sync` API — ships as one Pages
project. Pages serves assets from `dist/` and the API from `functions/` in
the same deployment; there is no separate Worker.

1. **Create the database**

   ```bash
   npx wrangler d1 create gistory
   ```

2. **Apply the schema** — migrations, not the flattened `schema.sql`
   (see [Schema changes](#schema-changes) for why):

   ```bash
   cp wrangler.deploy.example.toml wrangler.deploy.toml   # paste database_id
   bun run db:migrate:remote
   ```

3. **Connect the repo** to a Pages project
   (Dashboard → Workers & Pages → Create → Pages → Connect to Git).

   - Build command: `bun run build` (or `npm run build`)
   - Build output directory: `dist`

   The `functions/` directory is detected automatically.

4. **Add the D1 binding** — Settings → Bindings → Add → **D1 database**

   - Variable name: `GISTRY_DB`
   - Database: the one you created

   Add it for **both production and preview**, then redeploy. The name
   `GISTRY_DB` is the only identifier that lives in the source code, and
   binding names are not secret.

   ### No database ids in this repository

   Gistory is open source, so **no real D1 `database_id` is committed**. The
   binding is configured in the Cloudflare dashboard instead. That is the
   supported mechanism: Cloudflare bindings are **not** environment
   variables — `env.GISTRY_DB` is a binding object injected by the platform,
   and a Wrangler config file has no variable interpolation, so no secret or
   `[vars]` entry can supply a database id.

   `wrangler.toml` deliberately **omits** `pages_build_output_dir`. Per
   [Cloudflare's docs](https://developers.cloudflare.com/pages/functions/wrangler-configuration/),
   a Wrangler file containing that key becomes the *source of truth* and locks
   the dashboard's binding fields. Leaving it out keeps the file in "local
   development only" mode, so the dashboard owns preview/production bindings
   and the repo stays free of infrastructure identifiers. With the default
   setup, `wrangler pages deploy` prints a warning that the file is "used for
   local development only" — expected; Git integration deploys read the build
   and binding settings from the dashboard instead.

   ### File-as-source-of-truth (alternative)

   If you deploy with `wrangler pages deploy` from CI and have no dashboard
   access, uncomment `pages_build_output_dir = "dist"` and add your real id
   to `wrangler.toml`. That approach *does* put the id in the repo, so it is
   only recommended for a private fork.

5. **Configure background sync (optional)** — Settings → **Variables and
   Secrets** (add for production AND preview, then redeploy):

   | Variable | Value | Type |
   |---|---|---|
   | `VAPID_PUBLIC_KEY` | base64url P-256 public key | Text |
   | `VAPID_PRIVATE_KEY` | base64url private scalar | **Secret** |
   | `VAPID_SUBJECT` | `mailto:` + your contact address, one string, no space after the colon | Text |

   Generate the pair offline with `node scripts/vapid-keygen.mjs` — nothing
   is fetched, the private key never leaves the machine that prints it.

   - **Which is a secret:** only `VAPID_PRIVATE_KEY`. It signs every wake
     (JWS `Authorization` header) and must not ship anywhere. The public key
     is deliberately public (`GET /sync/subscribe` hands it to any
     `pushManager.subscribe` call), and the subject is just the `sub` claim
     the push service uses as a contact/abuse handle — RFC 8292 needs a real
     shape (`mailto:you@example.com`), not a verified address.
   - **Verify,** after the next deploy: `GET /sync/subscribe` answers
     `{"enabled":true,"publicKey":"…"}`, and the Settings row switches from
     "not configured" to a working toggle.
   - **Rotation caveat:** browsers subscribe against the CURRENT public key.
     Generating a new pair means every phone with Background sync on must
     toggle it off and on once to re-subscribe, so rotate only if the key
     leaked, not on a whim.
   - **Mind the kind:** `GISTRY_DB` (step 4) is a *binding*, but the `VAPID_*`
     entries are plain environment variables — set them here, not as bindings.

6. **Custom domain** — Settings → Custom domains → `gistory.creadev.org`.

7. **Verify** — open the app, enable sync in Settings, pair a second device
   with the QR. Both devices should show each other in the chain's device
   list.

## Schema changes

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

The relay's schema lives in `migrations/` and is applied by
`scripts/db-migrate.mjs`, which records what each database has already
applied and refuses to run if an applied file has since changed.

### Applying migrations from GitHub Actions

`.github/workflows/migrate.yml` runs the same command, triggered two ways:

- **Actions → Migrate D1 → Run workflow** (works from the GitHub mobile app).
  Defaults to a dry run that reports pending migrations without writing;
  untick *dry run* to apply.
- **Automatically** on any push to `main` that touches `migrations/`.

Add these three secrets in GitHub (Settings → Secrets and variables →
Actions):

| Secret | What it is |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with *Account → D1 Database → Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Account holding the D1 database |
| `CLOUDFLARE_D1_DATABASE_ID` | From `wrangler d1 create gistory` |

**These are never written to the repository.** GitHub stores them encrypted
and only exposes them to a workflow run — there is nothing to commit and no
`.env` file, so an open-source repo is not a problem here. The workflow writes
the database id into `wrangler.deploy.toml` at run time, which is why that
file is gitignored.

**Prefer environment secrets in an open-source repo.** The migrate job
declares `environment: production`, so the tighter home for these is
**Settings → Environments → production → Environment secrets** rather than
repository secrets. Same three names, same workflow, but they are then only
readable by jobs that declare that environment. Use whichever you prefer;
both work with the workflow as written. Before it touches the database the
workflow re-runs typecheck, the sync smoke test and the migration-history
check on the same commit, and sits behind the `production` environment — add
required reviewers or a wait timer there for a human in the loop.

## Maintenance (prune, retention, test debris)

The relay is append-only by design, so a scheduled job keeps three tables
from growing forever:

- **`rate_limits`** — full sweep of long-expired buckets.
- **`blobs`** — per chain, only the newest few full-state snapshots are kept
  (default 5). Any surviving snapshot is a complete restore point, and the
  client jumps its watermark to `serverSeq` when a pull page comes back empty,
  so old sequence numbers disappearing costs a device nothing.
- **`live-test-*` chains** — debris from `bun run sync:live`, removed whole
  once past a 7-day grace / 30-day age window. Chains with no blobs are
  included — the obvious `MAX(created_at) < x` check is NULL for them and
  they would otherwise survive forever.
- **Stale devices** — `last_seen` older than 90 days; one handshake
  re-registers, nothing server-side needs the row.
- **Stale wake targets** — no confirmed stamp for 30 days.

Real chains are **never** deleted — the server cannot tell "on holiday since
March" from "abandoned", and guessing wrong destroys the only server-side
copy of a synced library. There is deliberately no delete endpoint.

Run it yourself:

```bash
bun run db:maintain:local              # local .wrangler state
bun run db:maintain:local -- --status  # report what WOULD be pruned
bun run db:maintain:remote             # real D1 (needs wrangler.deploy.toml)
bun run db:maintain:check              # verifies the SQL on in-memory SQLite
```

`.github/workflows/maintenance.yml` runs the remote path daily (03:17 UTC)
after re-running the full verify suite on the same commit, and prints row
counts every run. A manual dispatch defaults to a dry run; untick `dry_run`
to apply.

## Storage (D1 / SQLite)

| Table | Purpose |
|-------|---------|
| `chains` | chain id, created_at, version, push_hash (write-secret hash) |
| `devices` | device id → chain, name, last_seen |
| `blobs` | `(chain_id, seq)` → encrypted payload, author device, created_at |
| `rate_limits` | throttle buckets: key, window_start, count |
| `push_subscriptions` | wake targets: endpoint, keys, last_seen |

## Edge rate-limit rule on `/sync/*` (recommended, one click away)

The relay already defends itself in-app (see the fallback section below), but
an edge rule sheds floods **before** they consume any D1 time. The free plan
includes exactly **one** rate-limiting rule, keyed by client IP.

Dashboard steps:

1. In the Cloudflare dashboard, select the **zone** that serves the Pages site
   (the apex domain), then go to **Security → Security rules** (older
   dashboards: Security → WAF → Rate limiting rules).
2. **Create rule → Rate limiting rules** and give it a name, e.g.
   `gistory-sync-edge-limit`.
3. Match only the sync API:
   - Field **URI Path**, operator **starts with**, value `/sync/`
   - or, in the expression editor:
     `starts_with(http.request.uri.path, "/sync/")`
4. **With the same characteristics**: IP address (the free plan fixes this).
5. **When rate exceeds**: **50 requests** per **10 seconds**.

   The free plan's smallest counting window is 10 seconds — there is no
   1-minute option — and 50/10s ≈ the ~300 req/min per IP target.
6. **Then take action**: **Block**, duration **10 seconds** (also fixed on
   free). A custom response body is a Pro-plan feature; the default 429 is
   all this API needs.
7. **Deploy**.

Sizing notes:

- One device's worst case is roughly 40 pushes/min (the client debounces to
  one push per 1.5 s) plus a paged sync of ~20 pulls, call it ~60 req/min ≈
  10 req/10s. 50/10s comfortably covers a few devices; **raise to 100/10s**
  if you expect a larger group behind one NAT.
- All devices behind one public IP (one office, one carrier-grade NAT) share
  a single counter. The threshold is per IP, not per device — the in-app
  per-device guards are what keep individual devices honest.

## Graceful fallback — the edge rule is optional

**The relay is safe without the rule.** Every `/sync` route already runs
in-app guards (`functions/_shared/guards.ts`), checked in this order:

| Guard | Bucket | What it stops |
|-------|--------|---------------|
| flood | connecting IP (`CF-Connecting-IP`), 1200/min | an identity-rotating flood — the one bucket a caller cannot walk around |
| throttle | per-device / per-chain, various limits | one runaway client, or a chain being filled with junk |
| write-fail | per chain, 20/min | write-secret guessing; a missing secret is charged too |
| breaker | in-memory | a failing D1 pile-up (5 consecutive failures → fast 503s for 15 s) |
| WAF | shape + size caps | bodies that are not this protocol, or too big to be benign |

So the edge rule is **defense-in-depth**, not a dependency. Skip it and the
worst case is an in-app throttled flood at 1200/min per IP instead of an
edge-shed one.

Two things to know about how the rule behaves when it exists:

- **It is not a precise cap.** Edge rate counters are per data center with a
  few seconds of delay, so a burst can overshoot before the block lands. The
  in-app guards remain the authoritative limit.
- **A legitimate client that trips it degrades gracefully.** The app receives
  the 429, treats it as a pause rather than an error, backs off on its own
  exponential curve, and retries. Changes made while blocked stay local and
  are pushed on the next successful sync — local-first means nothing is lost.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Sync storage is not configured" | The `GISTRY_DB` binding is missing from the Pages project, or you did not redeploy after adding it |
| Build settings in the dashboard are read-only | `wrangler.toml` contains `pages_build_output_dir`; remove it to hand control back to the dashboard |
| "Unknown sync chain" | The device never completed a handshake, or the chain id changed |
| "N change(s) could not be decrypted — wrong passphrase?" | Devices are not using the same passphrase (or not the same chain) |
| "Cannot reach the sync server" | The API isn't deployed next to the app (Pages Functions missing) |

### Lost passphrase

There is no recovery — the encryption key is derived from it. Keep a JSON
export from Settings somewhere safe.

## Configuration files

| File | Committed? | Purpose |
|------|-----------|---------|
| `wrangler.toml` | yes | Local development only (`wrangler pages dev`). Placeholder D1 id, no `pages_build_output_dir`. |
| `wrangler.deploy.example.toml` | yes | Template for the private config below. |
| `wrangler.deploy.toml` | **no** (gitignored) | Your real `database_id`, used only by remote D1 commands. |
| `schema.sql` | yes | Flattened D1 schema for a fresh build. Use `migrations/` for changes. |
| `migrations/` | yes | Versioned schema history applied by `bun run db:migrate:*`. |
| `scripts/db-migrate.mjs` | yes | Zero-dependency migration runner (local + remote D1). |
| `.puppeteerrc.cjs` | yes | `skipDownload: true` — keeps `npm install` (and the Pages build) Chromium-free. |

## Ongoing operations

- **Migrations** — `migrate.yml` applies pending migrations on any push to
  `main` that touches `migrations/`, or on demand from the Actions tab (dry
  run by default).
- **Maintenance** — `maintenance.yml` runs daily at 03:17 UTC (see above).
- **Logs** — `npx wrangler pages deployment tail` for the live `/sync` log.
- **Releases** — version tags publish `gistory-sync` and cut GitHub releases;
  the runbook lives in
  [`AGENTS.md` → npm release](AGENTS.md#releasing-gistory-sync) and the
  landing [README](README.md#development).

Usage (creating a chain, pairing, sync timings, background sync) lives in the
[documentation site](https://docs.creadev.org/gistory/getting-started) rather
than this file — same content, better home.

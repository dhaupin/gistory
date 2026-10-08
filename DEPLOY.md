# Deploying Gistory

The [README](README.md#deploying-to-cloudflare-pages) tells the full story of
how the app deploys (Cloudflare Pages serves `dist/` plus the `/sync` Pages
Functions from `functions/`, backed by one D1 database). This file is the
short operational runbook: the order of operations for a first deploy, and the
one piece of infrastructure README does not cover — the **edge rate-limiting
rule** on `/sync/*`.

## First-deploy checklist

1. **Create the database**
   ```bash
   npx wrangler d1 create gistory
   ```
2. **Apply the schema** — migrations, not the flattened `schema.sql`:
   ```bash
   cp wrangler.deploy.example.toml wrangler.deploy.toml   # paste database_id
   bun run db:migrate:remote
   ```
3. **Create the Pages project** — connect the git repo in the Cloudflare
   dashboard. Build command `npm run build`, output directory `dist/`. The
   `functions/` directory is detected automatically; there is no separate
   Worker.
4. **Add the D1 binding** — Pages project → Settings → Bindings → Add →
   D1 database → variable name `GISTRY_DB`. Add it for **both** production and
   preview, then redeploy. (Dashboard bindings, not `wrangler.toml` — see
   README for why the database id must stay out of git.)
5. **Verify** — open the app, enable sync in Settings, and pair a second
   device with the QR. Both devices should show each other in the chain's
   device list.

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

## Graceful fallback — the rule is optional

**The relay is safe without the rule.** Every `/sync` route already runs
in-app guards (`functions/_shared/guards.ts`), checked in this order:

| Guard | Bucket | What it stops |
|-------|--------|---------------|
| flood | connecting IP (`CF-Connecting-IP`), 1200/min | an identity-rotating flood — the one bucket a caller cannot walk around |
| throttle | per-device / per-chain, various limits | one runaway client, or a chain being filled with junk |
| write-fail | per chain, 20/min | write-secret guessing; a missing secret is charged too |
| breaker | in-memory | a failing D1 pile-up (5 consecutive failures → fast 503s for 15 s) |
| WAF | shape + size caps | bodies that are not this protocol, or too big to be benign |

So the edge rule is **defense-in-depth**, not a dependency: it saves D1
operations on a flood; nothing about correctness depends on it. Skip it and
the worst case is an in-app throttled flood at 1200/min per IP instead of an
edge-shed one.

Two things to know about how the rule behaves when it exists:

- **It is not a precise cap.** Edge rate counters are per data center with a
  few seconds of delay, so a burst can overshoot before the block lands. The
  in-app guards remain the authoritative limit.
- **A legitimate client that trips it degrades gracefully.** The app receives
  the 429, treats it as a pause rather than an error, backs off on its own
  exponential curve, and retries. Changes made while blocked stay local and
  are pushed on the next successful sync — local-first means nothing is lost.

## Ongoing operations

- **Migrations** — `migrate.yml` applies pending migrations on any push to
  `main` that touches `migrations/`, or on demand from the Actions tab (dry
  run by default). Needs the three `CLOUDFLARE_*` secrets (README, *Applying
  migrations*).
- **Maintenance** — `maintenance.yml` runs daily at 03:17 UTC: blob retention,
  `rate_limits` sweep, live-test debris, stale devices. Verifies the SQL on
  in-memory SQLite before applying.
- **Logs** — `npx wrangler pages deployment tail` for the live `/sync` log.

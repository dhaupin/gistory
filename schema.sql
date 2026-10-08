-- Gistory sync storage (Cloudflare D1 / SQLite)
--
-- The server is a blind relay: it stores opaque AES-GCM blobs and hands out
-- monotonically increasing sequence numbers per chain. Encryption keys are
-- derived on-device from the user's passphrase + chainId and never sent here.
--
-- Apply with:
--   npx wrangler d1 execute gistory --remote --file=schema.sql
--   npx wrangler d1 execute gistory --local  --file=schema.sql
--
-- PREFER THE MIGRATIONS over this file. `schema.sql` is a flattened snapshot
-- that can only ever BUILD a database: re-running it on a database that
-- already exists is a no-op, so it cannot add a column to an existing D1
-- database. Once the schema needs to change, add `migrations/NNNN_*.sql` and
-- run `bun run db:migrate:local` / `db:migrate:remote`, which applies pending
-- migrations in order and records what each database has already applied.
-- `db:migrate:check` builds a fresh database from the full migration history.
--
-- Keep this file in sync with the full `migrations/` history — it is the same
-- schema those produce, flattened. `db:migrate:check` asserts that.

CREATE TABLE IF NOT EXISTS chains (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  push_hash  TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  chain_id  TEXT NOT NULL,
  id        TEXT NOT NULL,
  name      TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (chain_id, id)
);

CREATE INDEX IF NOT EXISTS idx_devices_chain ON devices (chain_id);

CREATE TABLE IF NOT EXISTS blobs (
  chain_id   TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  device_id  TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chain_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_blobs_chain_seq ON blobs (chain_id, seq);

CREATE INDEX IF NOT EXISTS idx_chains_push_hash ON chains (push_hash);

-- Throttle bookkeeping for the guards (migrations/0003_guards.sql).
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

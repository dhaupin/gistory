-- Gistory sync storage (Cloudflare D1 / SQLite)
--
-- The server is a blind relay: it stores opaque AES-GCM blobs and hands out
-- monotonically increasing sequence numbers per chain. Encryption keys are
-- derived on-device from the user's passphrase + chainId and never sent here.
--
-- Apply with:
--   npx wrangler d1 execute gistory --remote --file=schema.sql
--   npx wrangler d1 execute gistory --local  --file=schema.sql

CREATE TABLE IF NOT EXISTS chains (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS devices (
  id        TEXT PRIMARY KEY,
  chain_id  TEXT NOT NULL,
  name      TEXT NOT NULL,
  last_seen INTEGER NOT NULL
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

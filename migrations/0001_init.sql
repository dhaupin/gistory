-- 0001_init.sql — baseline schema for the Gistory sync relay.
--
-- The server is a blind relay: it stores opaque AES-GCM blobs and hands out
-- monotonically increasing sequence numbers per chain. Encryption keys are
-- derived on-device from the user's passphrase + chainId and never sent here.
--
-- This file is the FIRST entry in the migration history. It is what
-- `bun run db:migrate:local` / `db:migrate:remote` apply on an empty database,
-- so a fresh build and a database that has been migrated forward end up with
-- the same tables.
--
-- Later changes belong in a NEW numbered file (0002_*, 0003_*, ...) rather
-- than being edited in here: the runner records which files a database has
-- already applied, so editing an applied migration leaves existing databases
-- stranded on the old shape.

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
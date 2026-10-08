-- 0004_devices_pk.sql — a device belongs to a chain, not to the table.
--
-- The devices table keyed rows by bare device id, so one physical device that
-- paired with a second chain MOVED its row: registering with chain B overwrote
-- the chain_id the row held for chain A, and chain A silently lost sight of
-- the device (status listed it under B only). Pushes never depended on the
-- row — the pull filter compares device ids from the request, not the table —
-- so nothing broke; it was a visible nuisance: a device appeared and
-- disappeared from chains' device lists depending on which it had joined last.
--
-- The key is now (chain_id, id): one row per (chain, device) pair, so joining
-- a second chain APPENDS a row instead of stealing the first. `touchDevice`
-- already matched `WHERE id = ? AND chain_id = ?`, and stale-device pruning
-- matches the same pair, so neither needed a change.
--
-- Copy-then-rename is the SQLite way to change a primary key. The INSERT
-- cannot collide: the old PK made `id` unique, so every (chain_id, id) pair
-- selected from it is unique already.

CREATE TABLE devices_new (
  chain_id  TEXT NOT NULL,
  id        TEXT NOT NULL,
  name      TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (chain_id, id)
);

INSERT INTO devices_new (chain_id, id, name, last_seen)
  SELECT chain_id, id, name, last_seen FROM devices;

DROP TABLE devices;
ALTER TABLE devices_new RENAME TO devices;

-- Rebuilt with the table (the old index belonged to the dropped table). The
-- composite PK's implicit index covers (chain_id, ...) lookups, but keeping
-- the named index preserves the shape 0001 shipped and what listDevices scans.
CREATE INDEX IF NOT EXISTS idx_devices_chain ON devices (chain_id);

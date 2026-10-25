-- 0005_attachments.sql — per-chain attachment byte storage.
--
-- Message images ride TWO planes: metadata in the sync payload (whole-item
-- LWW, no new merge rules) and BYTES in this table via POST/GET /sync/attach.
-- Full-state push replaying blobs is the cost class that filled the chain
-- budget twice, so bytes never enter the payload; they get their own channel
-- with their own write-auth discipline and byte budget.
--
-- Blindness holds: `data` is the same AES-GCM ciphertext format the push
-- payload uses (iv.cipher, base64) — the relay never sees pixels, only bytes.

CREATE TABLE IF NOT EXISTS attachments (
  chain_id   TEXT NOT NULL,
  att_id     TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  data       TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chain_id, att_id)
);

-- The maintenance sweep prunes attachments by chain + created_at (blob
-- retention law); this index keeps the worker/read paths off full scans.
CREATE INDEX IF NOT EXISTS idx_attachments_chain_created
  ON attachments (chain_id, created_at);

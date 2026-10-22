-- 0005_push_subscriptions.sql — wake targets for background sync (step 3).
--
-- Every push lands on the chain in D1; a device with no open page learns of
-- it only when its user reopens Gistory — or, once the fan-out ships, when
-- the relay wakes its service worker via web push. This table stores the
-- wake targets: the push endpoints each device's own browser registered,
-- with the per-endpoint key pair needed to encrypt a ping so only that
-- device can decrypt it.
--
-- No chain data ever rides a ping: the payload the relay sends is padded
-- ciphertext (RFC 8291) meaning "something landed", nothing more. The keys
-- here are protocol plumbing from the W3C Push API, not chain material.
--
-- `endpoint` is the PRIMARY KEY, not (chain_id, device_id): the endpoint URL
-- is a long-lived bearer route the push service issued to this browser, and
-- it is what FCM/autopush identify on delivery. A device that re-subscribes
-- under a new chain must MOVE the row, not multiply it — duplicated rows
-- would double-wake one browser for two chains.
--
-- Cleanup belongs to the fan-out job (step 4): the push service answers
-- 410 Gone when a subscription has died (device purged the site data,
-- service worker was replaced, browser regenerated the endpoint), and the
-- relay deletes the row on sight. The weekly maintenance sweep adds a
-- fallback prune for rows whose failures or silence outlived them.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  chain_id   TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  PRIMARY KEY (endpoint)
);

-- The fan-out lookup: every successful push needs this chain's wake targets.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_chain ON push_subscriptions (chain_id);

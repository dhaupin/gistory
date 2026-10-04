-- 0002_push_auth.sql — per-chain write capability.
--
-- Until now the chain had no write auth: knowing the chainId (which travels in
-- the pairing QR) was enough to append a blob. Anyone holding a QR could push
-- a blob encrypted with a different key, and because the client parks its
-- watermark below the first blob it cannot read, that one blob blocked every
-- legitimate change behind it, permanently.
--
-- `push_hash` holds SHA-256 of a random write secret generated on the device
-- that creates the chain. The server stores only the hash and never sees the
-- secret — and never sees anything derived from the passphrase, so the
-- "server is blind to your key material" property is preserved.
--
-- NULL means the chain predates write auth and is not yet secured. Such a
-- chain still accepts writes without a secret so existing installs keep
-- working; an owner can claim one via POST /sync/claim.

ALTER TABLE chains ADD COLUMN push_hash TEXT;

-- Index for the claim path, which looks chains up by their capability.
CREATE INDEX IF NOT EXISTS idx_chains_push_hash ON chains (push_hash);
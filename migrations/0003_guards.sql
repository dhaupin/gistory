-- 0003_guards.sql — throttle bookkeeping for the sync relay.
--
-- `push` was already capped by SIZE (MAX_PAYLOAD_BYTES) but not by RATE, so a
-- caller with a valid write secret could fill a chain with blobs as fast as the
-- network allowed — every blob is a row that every other device must pull and
-- attempt to decrypt. This table gives the functions a fixed-window counter to
-- throttle against. D1 has no built-in rate-limit primitive, so the window is
-- stored here and incremented with one atomic upsert per request.
--
-- `push_hash` (0002) means only a paired device can *write*; this table is what
-- bounds how fast it can do so, and — via the `writeFail` bucket — how fast it
-- can *guess* a write secret it does not have.

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- Supports the opportunistic sweep of rows whose window has long expired.
-- Without it that DELETE is a full scan of every bucket ever seen.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);
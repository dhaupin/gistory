-- Migration 0005: devices.last_ip
--
-- The Devices tab gains a "last IP" cell so an unexpected guest in a chain is
-- apparent (a device appearing from an unfamiliar address). The relay already
-- sees one IP per request; recording the latest one per device row is free —
-- no new table, no new request, just a column upserted with the row it is
-- already stamping last_seen on.
--
-- Deliberately plain: an opaque string, sanitized to the characters IPs use,
-- never geo-resolved by the relay. It is the proof of "where this device was
-- last seen from", not an intelligence feature.
--
-- Old rows have no recorded address; NULL is the honest value. Their next
-- handshake or push fills it naturally.

ALTER TABLE devices ADD COLUMN last_ip TEXT;

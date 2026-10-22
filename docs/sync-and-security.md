---
version: '1.0'
permalink: /sync-and-security
layout: default
title: Sync & Security
nav_order: 4
---

# Sync & Security

Gistory's sync model is deliberately boring where it counts and strict where
it matters: devices hold the data locally and push to a relay that cannot
read any of it.

## The encryption layer

Your encryption key is derived on your device from two inputs:

```
passphrase + chainId  →  PBKDF2  →  AES-GCM key  (never leaves the device)
data  →  AES-GCM encrypt  →  opaque ciphertext blob  →  relay
```

The chainId doubles as the derivation salt, and it travels in the pairing
code. That is what lets a second device — same passphrase, same chainId —
derive the same key and decrypt everything, while a stranger holding the
chain id alone still has nothing. The passphrase itself never leaves the
device.

## The relay stays blind

The relay is four small Cloudflare Pages Functions over a D1 database. It
assigns a monotonically increasing sequence number per chain, stores
ciphertext blobs, and hands out diffs — it has no ability to inspect, query,
or reconstruct your content, and it never holds anything derived from your
passphrase.

Three facts worth knowing:

- **A chain needs a write secret, not just an id.** Reading a chain only
  ever took the passphrase; *writing* to one needs the random secret minted
  by whatever device created the chain. It travels in the pairing token
  (`GS1-…`), and the relay only ever sees its SHA-256 hash.
- **Deletes are tombstones.** A deletion carries `deletedAt` timestamps that
  merge by max across devices; a newer edit can resurrect a deleted item, and
  a confirmed delete wins place against stale copies.
- **Conflict resolution is timestamp-based.** Two devices editing the same
  item resolve by newest edited time, with the larger device id as a
  deterministic tie-breaker. Clock skew between your devices shifts which
  edit wins; it never loses data outright.

## What the relay defends against

The relay is a backstop as well as a relay:

- **Throttles** — fixed-window budgets in D1 on pushes (per device and per
  chain), pulls, handshakes, and secret-guessing attempts. A throttled sync
  answers `429` with a `Retry-After`; the client backs off and retries.
- **A circuit breaker** — repeated database failures open a short, fast
  `503` window so a dead backend reads as "paused", not as an error.
- **A structural filter** — bodies that cannot be a real sync request (wrong
  shape, prototype-key, oversized ciphertext) are refused before any work.

These shape abusive traffic; the privacy boundary is the cryptography, not
the rate limits.

## Offline behavior

The app is local-first: reads and writes happen on-device, and sync is
best-effort on top. An offline edit is queued and pushed when the connection
returns; a throttled push is held and retried without losing the change.
Nothing on the critical path requires the relay to be up.

**Timings.** Local edits push about 1.5 s after you stop typing; changes are
pulled every 60 s, and immediately when the tab regains focus or comes back
online. **Sync Now** forces a pull → merge → push.

## Background sync (web push, optional per device)

Where the browser supports it (Android Chrome/Brave; iOS needs an installed
PWA, so it stays on catch-up), Settings → Sync gains a **Background sync**
toggle. With the relay's `VAPID_*` environment configured, turning it on
registers the browser's own push subscription with the relay (`POST
/sync/subscribe`), and from then on every push on the chain wakes all
*other* subscribed devices — even with no tab open — with a **silent** ping:

```
A pushes ──▶ relay stores blob ──▶ VAPID-signed aes128gcm wake (RFC 8291,
                                    payload {chainId, n} — opaque, no data)
                                        ──▶ OS wakes /sw.js
sw: pull → decrypt → merge (shared IndexedDB)
    → BroadcastChannel-nudge any open tab → push merged state
```

Rules that keep it safe and cheap: the wake never touches the push that
spawned it (all failures swallowed), a per-chain fan budget skips rather
than queues (the catch-up pull is what guarantees convergence), a 404/410
prunes the dead target on sight, and every successful wake stamps
`last_seen` — the daily maintenance sweep drops targets nothing has
confirmed alive in 30 days, while each app open re-posts the stored target
so a well device self-heals from its own subscription.

Correctness never depends on the ping: it is pacing, not truth. Watermarks
make sync converge regardless; devices that never subscribe (or anyone on
iOS) keep the exact same behavior as before.

**Optional "N new messages" notice.** Silent stays the default: after a
closed-tab wake delivers messages, the worker can show one notification —
"Gistory · 3 new messages" — only if the device opted in inside the
Settings row (nothing moves on the wire; the count is computed in the
worker from the snapshot diff, so the relay still never learns anything
about content). Tapping it focuses or opens the app. An open tab never
triggers one — the wake is redirected there instead.

**Observability.** Wake outcomes appear in `npx wrangler pages deployment
tail`: every `pruned` / `failed` / budget-`skip` outcome always logs (with
the push service hostname only — endpoints carry a subscription token);
a round summary logs when a `DEBUG_WAKE=1` variable is added to the Pages
project.

## Self-hosting

The relay is plain Cloudflare Pages Functions plus a D1 database —
`schema.sql`, migrations, and the deploy runbook live in the
[repository](https://github.com/dhaupin/gistory). Point the app at your own
relay and your data flows through infrastructure you control.

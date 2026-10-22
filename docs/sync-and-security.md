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

## Self-hosting

The relay is plain Cloudflare Pages Functions plus a D1 database —
`schema.sql`, migrations, and the deploy runbook live in the
[repository](https://github.com/dhaupin/gistory). Point the app at your own
relay and your data flows through infrastructure you control.

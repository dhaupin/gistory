// crashtest.config.js — Gistory's run root.
//
// The relay IS crashtest's native shape (plain handlers over a request ctx),
// and since crashtest v1.1.0 (FakeD1 v0.2/v0.3 — built and verified against
// real SQLite for exactly the statements this relay runs: INSERT..SELECT
// MAX(seq)+1 RETURNING, ON CONFLICT upserts, INSERT OR IGNORE, CASE/COALESCE
// value expressions, parameter-bound LIMIT), the run root speaks crashtest's
// own env spec — no hand-built engine anymore. The node:sqlite D1 fixture this
// config carried from day one was retired the release that closed the gap.
//
// What remains target-specific:
//   * the table plan below (migrations-equivalent shape: FakeD1 rows are
//     objects, so columns come free; the declared UNIQUES are what feed the
//     constraint reading for INSERT OR IGNORE and the ON CONFLICT targets),
//   * the bundled handlers (scripts/build-crashtest.mjs -> crashtest/handlers.mjs;
//     plain Node inside the CLI cannot import gistory's TS sources),
//   * the agent crypto that builds REAL push bodies — an "accepted" write is
//     a body the relay itself would happily take from a legitimate device,
//     never junk ciphertext that makes every attack a 4xx for the wrong reason,
//   * real budgets, not guesses, for the guard-hygiene attack.
//
// One fixture instance backs the whole campaign: attacks see each other's
// materialized rows on purpose (e.g. takeover asserts the digest the create
// attack installed survived the joiner's handshake). The binding is captured
// from the first request; moduleCtx oracles only ever read through it, so
// there is deliberately no per-request reset. Determinism: fixed ids
// everywhere (the handlers never re-roll them), fixed passphrases, fixed seed.
//
// The six bounded attacks carry gistory's documented accepted risks here —
// the same lines the relay's own red-team log labels — so a bound that stops
// being true in code reads as a finding in CI, not as a stale doc.

import {
  handshakeHandler,
  pushHandler,
  pullHandler,
  statusHandler,
  deriveKey,
  encryptPayload,
  newWriteSecret,
  POLICIES,
} from './crashtest/handlers.mjs'
import { createHash } from 'node:crypto'

// Migrations-equivalent table plan for env.d1.GISTRY_DB. Empty tables — the
// campaign's attacks materialize every row themselves, through the real relay
// handlers. Uniques mirror migrations/000x: chains.id, devices(chain_id,id),
// blobs(chain_id,seq), rate_limits.key.
const tables = {
  chains: { rows: [], uniques: { pk: ['id'] } },
  devices: { rows: [], uniques: { pk: ['chain_id', 'id'] } },
  blobs: { rows: [], uniques: { pk: ['chain_id', 'seq'] } },
  rate_limits: { rows: [], uniques: { pk: ['key'] } },
}

// The chain key material belongs to the "honest device" speaking for the
// target in the vocabulary body factories: a chain created through the real
// handshake can push real, decryptable ciphertext; the pack's poison-blob
// attack asks for bodies under a DIFFERENT one.
const PASS = 'crashtest fixture passphrase'

// Oracles run through the same binding the handlers run through. A database
// backstop exists only after the first request, so an oracle that fires
// before any attack has spoken to the relay is a harness mistake — fail it
// loudly instead of inventing a zero.
let fixtureD1 = null
const d1 = () => {
  if (!fixtureD1) {
    throw new Error(
      'crashtest.config.js: the GISTRY_DB binding was never captured — oracles run through it and only materialize after the first request',
    )
  }
  return fixtureD1
}
const captureD1 = (ctx) => {
  fixtureD1 ??= ctx.env.GISTRY_DB
  return ctx
}
const one = async (sql, ...params) =>
  (await d1().prepare(sql).bind(...params).first()) ?? null

export default {
  baseUrl: 'https://relay.crashtest.local',

  // crashtest's native fake env: one D1 binding, no secrets/vars/kv needed —
  // the handlers read everything else from the request itself.
  env: {
    d1: { GISTRY_DB: { tables } },
  },

  routes: {
    handshake: (ctx) => handshakeHandler(captureD1(ctx)),
    push: (ctx) => pushHandler(captureD1(ctx)),
    pull: (ctx) => pullHandler(captureD1(ctx)),
    status: (ctx) => statusHandler(captureD1(ctx)),
  },

  moduleCtx: {
    'sync-relay-shapes': {
      routes: { handshake: 'handshake', push: 'push', pull: 'pull', status: 'status' },

      // Body factories: gistory's wire shapes. `data` is opaque ciphertext at
      // the relay, so the factories do not invent one — they encrypt a small
      // REAL payload under the chain key the fixture device holds.
      async makeCreateBody({ chainId, deviceId, deviceName = 'Fixture Device', writeSecret = newWriteSecret() }) {
        return { chainId, deviceId, deviceName, writeSecret }
      },
      async makePushBody({ chainId, deviceId, writeSecret, data }) {
        const payload = data ?? (await encryptPayload({ fixture: true }, await deriveKey(PASS, chainId)))
        return { chainId, deviceId, data: payload, writeSecret }
      },
      // The poison blob: a valid write capability, a DIFFERENT passphrase —
      // so the ciphertext cannot be read by the chain's derived key.
      async makeUndecryptablePushBody({ chainId, deviceId, writeSecret = newWriteSecret() }) {
        const payload = await encryptPayload({ evil: true }, await deriveKey('attacker passphrase here', chainId))
        return { chainId, deviceId, data: payload, writeSecret }
      },

      // Query/url shapes for the GET routes.
      makePullUrl: ({ chainId, deviceId, since, limit }) =>
        `/sync/pull?chain=${encodeURIComponent(chainId)}&deviceId=${encodeURIComponent(deviceId)}` +
        (since != null ? `&since=${encodeURIComponent(since)}` : '') +
        (limit != null ? `&limit=${encodeURIComponent(limit)}` : ''),
      makeStatusUrl: ({ chainId, deviceId }) =>
        `/sync/status?chain=${encodeURIComponent(chainId)}&deviceId=${encodeURIComponent(deviceId)}`,

      // Materialized-state oracles (same binding, same instance, no reset).
      hashMatches: async (chainId, writeSecret) => {
        const row = await one('SELECT push_hash FROM chains WHERE id = ?', chainId)
        const digest = createHash('sha256').update(writeSecret).digest('hex')
        return row?.push_hash === digest
      },
      counts: {
        chains: async () =>
          Number((await one('SELECT COUNT(*) AS n FROM chains'))?.n ?? 0),
        deviceRows: async (chainId) =>
          (await d1().prepare('SELECT id, name FROM devices WHERE chain_id = ?').bind(chainId).all()).results ?? [],
        blobsByDevice: async (chainId, deviceId) =>
          Number(
            (await one(
              'SELECT COUNT(*) AS n FROM blobs WHERE chain_id = ? AND device_id = ?',
              chainId,
              deviceId,
            ))?.n ?? 0,
          ),
      },

      // Real budgets, not guesses: the header-hygiene attack drives the actual
      // handshake throttle dry before reading its shaped response.
      limits: { handshake: POLICIES.handshake.limit },

      // The six accepted risks (owner + bound REQUIRED for BOUNDED). A risk
      // that stops holding in code turns into an EXPLOITED finding in CI.
      bounds: {
        'existence-oracle': {
          owner: 'gistory relay (dhaupin)',
          bound: 'handshake status codes distinguish existing vs unknown chain ids; chain ids are uuid-strength (~122 bits) and the per-IP flood bucket caps probes at 1200/min',
        },
        'member-rename-nuisance': {
          owner: 'gistory relay (dhaupin)',
          bound: 'a member holding any secret can rewrite another device display name via handshake; names are metadata only — pushes, blobs, and data are never touched',
        },
        'status-nonmember-read': {
          owner: 'gistory relay (dhaupin)',
          bound: '/sync/status returns member names to any valid-shaped deviceId; names are the only readable content, blobs are ciphertext, and status draws from the same per-device pull budget that rate-limits it',
        },
        'chain-rows-farm': {
          owner: 'gistory relay (dhaupin)',
          bound: 'fresh chain ids create permanent rows (~1200/min per IP behind the edge flood bucket, per-device handshake bucket 20/min); real chains are never deleted, so the cap is edge rate policy, not row hygiene',
        },
        'phantom-device-rows': {
          owner: 'gistory relay (dhaupin)',
          bound: 'anyone who knows a chain id can add device rows to it; the device list is capped at 50 in responses and maintenance prunes rows idle for 90 days',
        },
        'watermark-pin': {
          owner: 'gistory relay (dhaupin)',
          bound: 'the relay cannot validate ciphertext (it is blind by design), so a valid-secret blobs hold the victim watermark — the client-side consequence is a watermark that holds before the poison blob and RETRIES on the next sync, never skips; pinned behaviorally in tests/sync-smoke.ts',
        },
      },
    },
  },

  seed: 0xc0ffee,
}

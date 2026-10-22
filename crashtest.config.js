// crashtest.config.js — Gistory's run root.
//
// The relay IS crashtest's native shape (plain handlers over a request ctx),
// so the config is thin: register the four routes, attach the in-memory D1
// fixture as `GISTRY_DB`, and arm `sync-relay-shapes` with this target's
// vocabulary — the pack itself knows nothing about gistory.
//
// The crypto used to build REAL push bodies comes from the bundled agents
// (scripts/build-crashtest.mjs -> crashtest/handlers.mjs), so an "accepted"
// write in an attack is a body the relay itself would happily accept from a
// legitimate device. Junk ciphertext would make every attack a 4xx for the
// wrong reason.
//
// One fixture instance backs the whole campaign: attacks see each other's
// materialized rows on purpose (e.g. takeover asserts the stored digest the
// create attack installed survived the joiner's handshake). Determinism:
// fixed ids everywhere (the handlers never re-roll them), fixed passphrases.
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
import { buildFixtureDb } from './crashtest/fixture.mjs'

const db = buildFixtureDb()
const env = { GISTRY_DB: db.d1 }

// The chain key material belongs to the "honest device" speaking for the
// target in the vocabulary body factories: a chain the fixture CREATES with a
// startPassphraseKey can push real, decryptable ciphertext; the pack's
// poison-blob attack asks the fixture for bodies under a DIFFERENT one.
const PASS = 'crashtest fixture passphrase'

const withEnv = (ctx) => ({ ...ctx, env })

export default {
  baseUrl: 'https://relay.crashtest.local',

  routes: {
    handshake: (ctx) => handshakeHandler(withEnv(ctx)),
    push: (ctx) => pushHandler(withEnv(ctx)),
    pull: (ctx) => pullHandler(withEnv(ctx)),
    status: (ctx) => statusHandler(withEnv(ctx)),
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

      // Materialized-state oracles (the fixture keeps one DB for the run).
      hashMatches: async (chainId, writeSecret) =>
        db.hashMatches(chainId, writeSecret),
      counts: {
        chains: () => db.chainCount(),
        deviceRows: (chainId) => db.deviceRows(chainId),
        blobsByDevice: (chainId, deviceId) => db.blobsByDevice(chainId, deviceId),
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

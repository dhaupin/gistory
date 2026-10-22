// Entry for the crashtest handlers bundle (built to crashtest/handlers.mjs
// by scripts/build-crashtest.mjs — see that file for why the build exists).
//
// Exports exactly the surface crashtest.config.js needs: the four relay
// route handlers (Pages Functions shape: { request, env } => Response) and
// the agent crypto used to build target-native push bodies for the pack's
// vocabulary. Everything else — the React app, the storage seam, QoS — is
// intentionally NOT here: the run root attacks the relay, not the client.
//
// `functions/sync/*` are Pages Files: they export onRequestPost/
// onRequestGet alongside `onRequestOptions`. The option handlers are not
// exported here on purpose — CORS preflight is an app-level concern the
// in-process harness never exercises.

export { onRequestPost as handshakeHandler } from '../functions/sync/handshake'
export { onRequestPost as pushHandler } from '../functions/sync/push'
export { onRequestGet as pullHandler } from '../functions/sync/pull'
export { onRequestGet as statusHandler } from '../functions/sync/status'

// Agent crypto, for building REAL bodies into the relay's push shape.
// Real bodies matter: junk ciphertext would make every attack indistinguishable
// from an ordinary malformed-write, and the pack's point is abusing *valid-looking*
// traffic.
export { deriveKey, encryptPayload, newWriteSecret } from '../src/sync/agent'

// The guard policies, so the pack can spend a real budget to its edge (the
// header-hygiene attack drives the handshake throttle dry before reading the
// shaped response) instead of guessing at a limit.
export { POLICIES } from '../functions/_shared/guards'

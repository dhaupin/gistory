#!/usr/bin/env node
// Generate a VAPID keypair for the background-sync fan-out (rollout step 4 of
// labs/prd-sync.md).
//
//   node scripts/vapid-keygen.mjs
//
// Web Crypto P-256: exports the raw public point (what the browser's
// `applicationServerKey` wants, base64url) and the private scalar `d` (what
// the relay signs the JWS with, base64url). Nothing leaves the machine; the
// values print once. Store them in the RELAY's environment settings —
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT — and never in git.

import { webcrypto as crypto } from 'node:crypto'

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
)

const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
const privScalar = b64url(Buffer.from(privJwk.d, 'base64url'))
// 65-byte uncompressed point: the exact form `applicationServerKey` wants.
const pubPoint = b64url(await crypto.subtle.exportKey('raw', pair.publicKey))

console.log(`
  VAPID keypair generated. Nothing left this machine; the values print once.

  VAPID_PUBLIC_KEY  (base64url; the client receives it via GET /sync/subscribe)
    ${pubPoint}

  VAPID_PRIVATE_KEY (base64url EC scalar 'd'; signs the JWS inside the relay)
    ${privScalar}

  VAPID_SUBJECT     (mailto: contact in the signed JWS; edit to your address)
    mailto:you@example.com

  Set all three in the relay project's environment variables — the same place
  the GISTRY_DB binding is configured — NOT in a static-site or repository
  secret store. The static host never signs a push, and the private key never
  ships to a device.
`)

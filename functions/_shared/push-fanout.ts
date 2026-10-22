// Background-sync fan-out: wake the upstream devices when a blob lands.
//
// Rollout step 4 of labs/prd-sync.md. After a successful push, the relay
// sends ONE contentless ping to every OTHER subscribed device on the chain.
// The ping carries a padded, RFC 8291-encrypted hint ({chainId, count}) that
// names no message content; the receiving service worker does the same
// pull→decrypt→merge the page does. Push ACCELERATES sync here — the
// watermarks and the catch-up loop keep being the correctness net.
//
// Its blocks, each small so review can be byte-exact:
//
//   vapidAuthHeader  — ES256 JWS per RFC 8292, "vapid t=…, k=…" scheme
//   encryptWake      — RFC 8291 aes128gcm using the RFC's own HKDF expansion
//   sendFanOut       — parallel POSTs, 404/410 row pruning, budget guard
//
// Every failure path degrades to "no ping was sent": fan-out never delays a
// push response beyond its own (small) work and never errors the push.

import type { D1Database } from './sync'
import { POLICIES, consumeLimit } from './guards'

// --- Web Push wire format (RFC 8292: VAPID) ----------------------------------

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

/** Read the fan-out configuration from the Pages Functions environment. */
export function vapidFromEnv(env: unknown): VapidConfig | null {
  const vars = env as { VAPID_PUBLIC_KEY?: unknown; VAPID_PRIVATE_KEY?: unknown; VAPID_SUBJECT?: unknown } | undefined
  const publicKey = typeof vars?.VAPID_PUBLIC_KEY === 'string' ? vars.VAPID_PUBLIC_KEY : ''
  const privateKey = typeof vars?.VAPID_PRIVATE_KEY === 'string' ? vars.VAPID_PRIVATE_KEY : ''
  if (!publicKey || !privateKey) return null
  const subject = typeof vars?.VAPID_SUBJECT === 'string' && vars.VAPID_SUBJECT
    ? vars.VAPID_SUBJECT
    : 'mailto:gistory@example.invalid'
  return { publicKey, privateKey, subject }
}

const b64urlDecode = (s: string): Uint8Array => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const b64urlEncode = (bytes: Uint8Array): string => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function importVapidKeys(config: VapidConfig): Promise<{ privImported: CryptoKey; pubRaw: Uint8Array }> {
  const pubRaw = b64urlDecode(config.publicKey)
  const privRaw = b64urlDecode(config.privateKey)
  // The private scalar is `d`; x/y come from the public point (04 || X || Y).
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(pubRaw.slice(1, 33)),
    y: b64urlEncode(pubRaw.slice(33, 65)),
    d: b64urlEncode(privRaw),
  } as JsonWebKey
  return (async () => {
    const privImported = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
    return { privImported, pubRaw }
  })()
}

/**
 * Build the `vapid` Authorization header for one endpoint (RFC 8292 §4: the
 * Authorization header scheme). One header per wake: the audience claim is
 * the endpoint's ORIGIN, and a fresh ephemeral key is NOT required — the
 * receiver's push service only verifies the key against the audience
 * (browser pushes verify on receipt, not on signature).
 */
export async function vapidAuthHeader(
  endpoint: string,
  config: VapidConfig,
  now = Date.now(),
): Promise<string> {
  const url = new URL(endpoint)
  const exp = Math.floor(now / 1000) + 12 * 60 * 60
  // Encoding uses a JOSE JSON: JWT segments are base64url WITHOUT padding.
  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ aud: url.origin, sub: config.subject, exp })),
  )
  const signingInput = `${header}.${payload}`

  const { privImported, pubRaw } = await importVapidKeys(config)
  // WebCrypto ECDSA returns JWS ES256's wire form already: raw r||s (64 bytes).
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privImported,
    new TextEncoder().encode(signingInput),
  )
  const sig = new Uint8Array(signature)
  return `vapid t=${signingInput}.${b64urlEncode(sig)}, k=${b64urlEncode(pubRaw)}`
}

// --- RFC 8291 aes128gcm message encryption -----------------------------------

/**
 * Encrypt one wake. Payload is a small JSON bundle; each wake gets a fresh
 * ephemeral ECDH keypair and salt (§2: "The ECDH key pair can be discarded
 * after encrypting the message").
 *
 * The HKDF expansion below is verbatim from RFC 8291 §3.4 — the RFC spells
 * WebPush's chained HMAC steps in full precisely so implementers can copy
 * it without guessing (notably: the CEK/nonce derive uses the SALT FROM THE
 * CONTENT CODING HEADER, not the auth secret, as the extraction salt).
 */
export async function encryptWake(
  payload: object,
  p256dhB64url: string,
  authB64url: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dhB64url)
  const authSecret = b64urlDecode(authB64url)

  // 1. Salt (16) + ephemeral sender keys. Public point: 04 || X || Y (65).
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephPublic = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))

  // 2. ECDH shared secret.
  const uaImported = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaImported }, eph.privateKey, 256),
  )

  // 3. HKDF per §3.4 (verbatim chain). key_info = "WebPush: info" 0x00 ua || as.
  const keyInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info'),
    0x00,
    ...uaPublic,
    ...ephPublic,
  ])
  // HKDF's input keying material is the ECDH secret; the auth secret is the
  // extraction salt. (Exchange and the IETF test vectors will not match.)
  const ikmKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits'])
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfo },
      ikmKey,
      256,
    ),
  )

  // 4. RFC 8188 HKDF now: salt = the HEADER salt (not auth!).
  const prkKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new Uint8Array([...new TextEncoder().encode('Content-Encoding: aes128gcm'), 0x00]),
      },
      prkKey,
      128,
    ),
  )
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new Uint8Array([...new TextEncoder().encode('Content-Encoding: nonce'), 0x00]),
      },
      prkKey,
      96,
    ),
  )

  // 5. Record: plaintext || padding-delimiter 0x02 || zero padding (RFC 8188).
  const plain = new TextEncoder().encode(JSON.stringify(payload))
  const plaintext = new Uint8Array(plain.length + 1)
  plaintext.set(plain, 0)
  plaintext.set(new Uint8Array([0x02]), plain.length)

  // 6. aes128gcm binary header: salt(16) | rs(4, big-endian) | idlen(1) | keyid.
  const rs = 1352 // plaintext + delimiter + tag all fit; single record only
  const header = new Uint8Array(16 + 4 + 1 + ephPublic.length)
  header.set(salt, 0)
  const dv = new DataView(header.buffer)
  dv.setUint32(16, rs)
  dv.setUint8(20, ephPublic.length)
  header.set(ephPublic, 21)

  // 7. AES-128-GCM encrypt; the tag is appended by the cipher.
  const encKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, encKey, plaintext),
  )
  const body = new Uint8Array(header.length + ciphertext.length)
  body.set(header, 0)
  body.set(ciphertext, header.length)
  return body
}

// --- Paraphernalia: one row's wake --------------------------------------------

interface SubscriptionRow {
  chain_id: string
  device_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Send and react: 2xx keeps the row, 404/410 removes a dead target. */
async function wakeOne(
  row: SubscriptionRow,
  count: number,
  config: VapidConfig,
): Promise<'sent' | 'pruned' | 'failed'> {
  try {
    const auth = await vapidAuthHeader(row.endpoint, config)
    const body = await encryptWake({ chainId: row.chain_id, n: count }, row.p256dh, row.auth)
    const res = await fetch(row.endpoint, {
      method: 'POST',
      headers: {
        TTL: '60',
        // 'normal' delivery wakes even closed browsers; silent by design.
        Urgency: 'normal',
        Authorization: auth,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(body),
    })
    if (res.status === 404 || res.status === 410) return 'pruned'
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * Wake the other subscribed devices on a chain. Called AFTER a push has
 * stored its blob — never instead of, never blocking anything user-visible.
 * Paper rules:
 *   • the sender's own target is excluded (it knows already);
 *   • the per-chain `fanout` budget bounds wakes; over-budget is skipped
 *     quietly, because the catch-up pull is what guarantees convergence;
 *   • no VAPID env → fan-out off entirely (the GET answer stays honest).
 * Every failure stays here: the caller's push cannot be worse for this.
 */
export async function sendFanOut(
  db: D1Database,
  chainId: string,
  senderDeviceId: string,
  count: number,
  env: unknown,
): Promise<void> {
  try {
    const config = vapidFromEnv(env)
    if (!config) return

    const budget = await consumeLimit(db, 'fanout-chain', chainId, POLICIES.fanout)
    if (!budget.ok) return

    const { results } = await db
      .prepare(
        `SELECT chain_id, device_id, endpoint, p256dh, auth FROM push_subscriptions
         WHERE chain_id = ? AND device_id <> ? LIMIT 50`,
      )
      .bind(chainId, senderDeviceId)
      .all<SubscriptionRow>()
    if (!results || results.length === 0) return

    const outcomes = await Promise.all(results.map((row) => wakeOne(row, count, config)))

    // Prune dead targets: 404/410 from the push service means the endpoint is
    // gone (site data purged, worker replaced). Failed rows stay for now — the
    // maintenance sweep drops targets that stay silent forever.
    const pruned = results.filter((_, i) => outcomes[i] === 'pruned')
    for (const row of pruned) {
      try {
        await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(row.endpoint).run()
      } catch {
        /* pruned next wake; nothing depends on it */
      }
    }

    // A 2xx wake is the one true liveness signal for a row: it proves the push
    // service accepted the target AND the row was charged to a working fan
    // budget, so stamp it — this is exactly what the maintenance sweep ages
    // rows against. Failed rows are deliberately NOT touched: their staleness
    // is the signal the sweep acts on, and they already cost nothing to retry.
    // One statement for all survivors (the IN list is bounded by LIMIT 50).
    const survived = results.filter((_, i) => outcomes[i] === 'sent')
    if (survived.length > 0) {
      try {
        await db
          .prepare(
            `UPDATE push_subscriptions SET last_seen = ?
             WHERE endpoint IN (${survived.map(() => '?').join(', ')})`,
          )
          .bind(Date.now(), ...survived.map((row) => row.endpoint))
          .run()
      } catch {
        /* a missed stamp only shortens the row's life; nothing breaks */
      }
    }
  } catch {
    // Fan-out failing can never break the push that triggered it.
  }
}

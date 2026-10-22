// sync-relay-shapes — the chain-relay dialect pack (generic HTTP surface
// speaks, hence no adapter prefix; see the naming rule in the pack docs).
//
// WHAT IT ATTACKS: any "chain relay" — a push/pull sync relay where a random
// per-chain write secret (stored server-side only as a digest) gates writes
// and a public-ish read surface hands out opaque ciphertext by sequence
// number. Gistory's relay is the reference target; nothing here names it.
//
// THE CONTRACT with the target (moduleCtx['sync-relay-shapes']):
//
//   routes          { handshake, push, pull, status }  → harness route NAMES
//   makeCreateBody  ({ chainId, deviceId, deviceName?, writeSecret })  → body
//   makePushBody    ({ chainId, deviceId, writeSecret })               → body
//                     (data is the target's own valid-looking ciphertext —
//                      the pack never fabricates one; a target that cannot
//                      produce one also gets an honest attack shape by way
//                      of `makeUndecryptablePushBody`)
//   makeUndecryptablePushBody ({ chainId, deviceId, writeSecret }) → body
//                     (cipher text the chain's PASSPHRASE key cannot read:
//                      the poison-blob scenario)
//   makePullUrl     ({ chainId, deviceId, since? })  → '  path?query' style URI
//   makeStatusUrl   ({ chainId, deviceId })          → same syntax family
//   hashOf          (chainId) → stored write-secret digest | null
//   hashMatches     (chainId, writeSecret) → boolean   (same digest? async)
//   counts          { chains(): n, deviceRows(chainId): [{id,name}],
//                     blobsByDevice(chainId, deviceId): n }
//   limits          { handshake: <the relay's per-device handshake budget> }
//   bounds          { '<attack-name>': { owner, bound } }   (ONLY for risks the
//                     target documents as accepted — a BOUNDED verdict loses
//                     meaning without both fields, so absent bounds stay
//                     findings, per the contract)
//
// Every scenario imports NOTHING from its target: the shapes read config
// moduleCtx, fire real Requests at the registered routes, and judge by the
// observable Response + the materialized-state oracles. Missing vocabulary
// fails the run loudly naming this pack — an un-armed pack must not read as
// "everything refused".

const PKG = 'packs/public/sync-relay-shapes'

/** The moduleCtx keys this pack refuses to run without. */
const REQUIRED_KEYS = [
  'routes', 'makeCreateBody', 'makePushBody', 'makeUndecryptablePushBody',
  'makePullUrl', 'makeStatusUrl', 'hashMatches', 'counts', 'limits', 'bounds',
]

function take(ctx, key) {
  const value = ctx?.[key]
  if (value == null) {
    throw new TypeError(`${PKG}: moduleCtx['sync-relay-shapes'].${key} is missing — arm the run root (see docs.creadev.org/crashtest/reference/packs)`)
  }
  return value
}

/**
 * Secrets shaped like the pack's own clients mint them: ≥43 base64url chars
 * — the wire shape a RELAY validates — so an attack never 400s for the
 * embarrassing reason that its own fixture looked malformed. (The first run
 * of this pack did exactly that: uuid-derived 32-char secrets made every
 * create 400, and the downstream attacks then read as refusals while the
 * precondition had silently failed.)
 */
function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** Precondition check: an attack whose OWN setup failed must throw loudly, never read as REFUSED. */
function precondition(ok, attack, what) {
  if (!ok) {
    throw new TypeError(`${PKG}: ${attack}: precondition failed — ${what} (check the run root's vocabulary, this is not a verdict)`)
  }
}

async function post(harness, routeName, body, { rawBody = false } = {}) {
  return harness.run(routeName, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody ? body : JSON.stringify(body),
  })
}

/**
 * BOUNDED-or-EXPLOITED helper for the accepted risks a target may declare.
 * A risk is bounded ONLY when the target declares owner + bound in
 * `moduleCtx['sync-relay-shapes'].bounds[<attack>]` — without both, the
 * finding stays a finding (contract rule: a bound without an owner is a
 * finding).
 */
function verdictFor(ctx, attack, { detail } = {}) {
  const bound = ctx.bounds?.[attack]
  if (!bound || !bound.owner || !bound.bound) {
    return { verdict: 'EXPLOITED', detail: `${detail} (and no accepted bound is declared in moduleCtx['sync-relay-shapes'].bounds['${attack}'])` }
  }
  return { verdict: 'BOUNDED', owner: bound.owner, bound: bound.bound, detail }
}

export default {
  name: 'sync-relay-shapes',
  // One loud arming check up front (instead of thirteen scattered failures
  // mid-campaign): every vocabulary key the pack refuses to run without.
  // A partially armed run root must read as a configuration error, not as
  // "everything refused".
  async beforeAll(ctx) {
    const missing = REQUIRED_KEYS.filter((key) => ctx?.[key] == null)
    if (missing.length > 0) {
      throw new TypeError(
        `${PKG}: moduleCtx['sync-relay-shapes'] is missing ${missing.join(', ')} — arm the run root (see docs.creadev.org/crashtest/reference/packs)`,
      )
    }
  },
  description:
    'Chain-relay abuse shapes over one injected dialect: takeover + create races on the write secret, existence/identity oracles, "' +
    'storage-economic floods, watermark pinning, WAF/parser probes, guard header hygiene.',

  attacks: [
    {
      name: 'takeover-by-own-secret',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const makePush = take(ctx, 'makePushBody')
        const hashMatches = take(ctx, 'hashMatches')
        const chainId = 'relay-shape-takeover-01'
        const ownerSecret = newSecret()
        const created = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-victim', writeSecret: ownerSecret }))
        precondition(created.status === 200, 'takeover-by-own-secret', `victim chain create answered ${created.status}`)

        const attackerSecret = newSecret()
        // A1a: the joiner handshakes with their OWN secret — a takeover would
        // overwrite the stored digest with the attacker's capability.
        const join = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-attacker', writeSecret: attackerSecret }))

        // A1b: and then pushes under it.
        const write = await post(harness, routes.push, await makePush({ chainId, deviceId: 'shape-attacker', writeSecret: attackerSecret }))

        const stillOwner = await hashMatches(chainId, ownerSecret)
        if (stillOwner && write.status !== 200) {
          return {
            verdict: 'REFUSED',
            detail: `joining handshake ${join.status} did not replace the stored secret; attacker write ${write.status}`,
            attack: 'takeover-by-own-secret',
          }
        }
        return {
          verdict: 'EXPLOITED',
          detail: `stored digest ${stillOwner ? 'kept' : 'REPLACED by the joiner'}, attacker write ${write.status}`,
          attack: 'takeover-by-own-secret',
        }
      },
    },

    {
      name: 'create-race-second-writer',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const makePush = take(ctx, 'makePushBody')
        const hashMatches = take(ctx, 'hashMatches')
        const chainId = 'relay-shape-race-0001'
        const first = newSecret()
        const second = newSecret()

        await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-racer-1', writeSecret: first }))
        await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-racer-2', writeSecret: second }))
        precondition(await hashMatches(chainId, first), 'create-race-second-writer', 'the first creator did not install the stored digest')

        // The loser (second creator) must keep its write refused while the
        // winner keeps writes: the digest must still match the FIRST secret.
        const loser = await post(harness, routes.push, await makePush({ chainId, deviceId: 'shape-racer-2', writeSecret: second }))
        const winner = await post(harness, routes.push, await makePush({ chainId, deviceId: 'shape-racer-1', writeSecret: first }))
        if (winner.status === 200 && loser.status !== 200 && !(await hashMatches(chainId, second))) {
          return { verdict: 'REFUSED', detail: `loser write ${loser.status}, winner ${winner.status} — the first creator kept the chain`, attack: 'create-race-second-writer' }
        }
        return { verdict: 'EXPLOITED', detail: `loser ${loser.status}, winner ${winner.status}, second secret accepted=${await hashMatches(chainId, second)}`, attack: 'create-race-second-writer' }
      },
    },

    {
      name: 'secret-format-variants',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const makePush = take(ctx, 'makePushBody')
        const chainId = 'relay-shape-format-01'
        const secret = newSecret()
        const created = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-owner', writeSecret: secret }))
        precondition(created.status === 200, 'secret-format-variants', `chain create answered ${created.status}`)

        const variants = [secret.toUpperCase(), '0'.repeat(64), 'g'.repeat(43), ` ${secret} `]
        const accepted = []
        for (const variant of variants) {
          const res = await post(harness, routes.push, await makePush({ chainId, deviceId: 'shape-variant', writeSecret: variant }))
          if (res.status === 200) accepted.push(res.status)
        }
        if (accepted.length === 0) {
          return { verdict: 'REFUSED', detail: `no case/format variant (${variants.length} tried) was accepted`, attack: 'secret-format-variants' }
        }
        return { verdict: 'EXPLOITED', detail: `${accepted.length}/${variants.length} format variants authenticated`, attack: 'secret-format-variants' }
      },
    },

    {
      name: 'existence-oracle',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        // Known chain: created by this very attack; unknown: a fresh uuid.
        const chainId = 'relay-shape-oracle-01'
        const created = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-oracle-create', writeSecret: newSecret() }))
        precondition(created.status === 200, 'existence-oracle', `known chain create answered ${created.status}`)

        // writeSecret: null on purpose — the probe MUST go out secretless (the
        // known-chain case is a JOIN; the unknown-chain case is what the relay
        // does with an id it cannot create). Passing nothing would let the
        // vocabulary fire a default secret, and both probes would read alike.
        const known = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-oracle-probe', writeSecret: null }))
        const unknown = await post(harness, routes.handshake, await makeCreate({ chainId: `relay-shape-oracle-${Date.now().toString(36)}`, deviceId: 'shape-oracle-probe', writeSecret: null }))
        if (known.status === unknown.status) {
          return { verdict: 'REFUSED', detail: `status codes ${known.status}/${unknown.status} do not distinguish known from unknown ids`, attack: 'existence-oracle' }
        }
        return verdictFor(ctx, 'existence-oracle', {
          detail: `known chain ${known.status} vs unknown ${unknown.status} — the difference reads as an oracle`,
        })
      },
    },

    {
      name: 'member-rename-nuisance',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const deviceRows = take(ctx, 'counts').deviceRows
        const chainId = 'relay-shape-rename-01'
        const ownerId = 'shape-renamed-victim'
        const victim = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: ownerId, deviceName: 'Renamed Target', writeSecret: newSecret() }))
        precondition(victim.status === 200, 'member-rename-nuisance', `victim registration answered ${victim.status}`)

        // The attacker knows the (public, churnable) device id and re-registers
        // it under their own name — WITH their own secret, which the relay is
        // expected to refuse for WRITES but display-level metadata is not
        // auth-gated the same way. The honest observable: does the rename land?
        const rename = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: ownerId, deviceName: 'PWNED-DEVICE', writeSecret: newSecret() }))
        const after = (deviceRows(chainId) || []).find((row) => row.id === ownerId)
        if (rename.status === 200 && after?.name === 'PWNED-DEVICE') {
          return verdictFor(ctx, 'member-rename-nuisance', {
            detail: `"Renamed Target" is now "PWNED-DEVICE"; names are display-level, pushes and data were never touched`,
          })
        }
        return { verdict: 'REFUSED', detail: `rename did not land (handshake ${rename.status}, row ${JSON.stringify(after)})`, attack: 'member-rename-nuisance' }
      },
    },

    {
      name: 'spoofed-device-write',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const makePush = take(ctx, 'makePushBody')
        const counts = take(ctx, 'counts')
        const chainId = 'relay-shape-spoof-001'
        const ownerId = 'shape-spoof-victim'
        const victim = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: ownerId, writeSecret: newSecret() }))
        precondition(victim.status === 200, 'spoofed-device-write', `victim registration answered ${victim.status}`)
        const before = counts.blobsByDevice(chainId, ownerId)
        const res = await post(harness, routes.push, await makePush({ chainId, deviceId: ownerId, writeSecret: newSecret() }))
        const after = counts.blobsByDevice(chainId, ownerId)
        if (res.status !== 200 && after === before) {
          return { verdict: 'REFUSED', detail: `push ${res.status} and the victim's blob count stayed ${before}`, attack: 'spoofed-device-write' }
        }
        return { verdict: 'EXPLOITED', detail: `spoofed write ${res.status} with rows ${before}→${after}`, attack: 'spoofed-device-write' }
      },
    },

    {
      name: 'status-nonmember-read',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const chainId = 'relay-shape-status-01'
        const registered = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-status-owner', writeSecret: newSecret() }))
        precondition(registered.status === 200, 'status-nonmember-read', `chain with one member answered ${registered.status}`)

        const res = await harness.run(routes.status, { method: 'GET', url: take(ctx, 'makeStatusUrl')({ chainId, deviceId: 'shape-status-outsider' }) })
        let sawNames = false
        if (res.status === 200 && typeof res.response?.json === 'function') {
          try {
            const body = await res.response.clone().json()
            sawNames = Array.isArray(body?.devices) && body.devices.length > 0
          } catch { /* unpackable body counts as no read */ }
        }
        if (!sawNames) {
          return { verdict: 'REFUSED', detail: `status ${res.status} exposed no device list to a non-member`, attack: 'status-nonmember-read' }
        }
        return verdictFor(ctx, 'status-nonmember-read', {
          detail: `a valid-shape (non-member) deviceId read the chain's device names`,
        })
      },
    },

    {
      name: 'chain-rows-farm',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const chains = take(ctx, 'counts').chains
        const before = await (typeof chains === 'function' ? chains() : chains)
        const created = 25
        for (let i = 0; i < created; i++) {
          await post(harness, routes.handshake, await makeCreate({
            chainId: `relay-shape-farm-${String(i).padStart(4, '0')}`,
            deviceId: `relay-farm-${String(i).padStart(2, '0')}`,
            writeSecret: newSecret(),
          }))
        }
        const after = await (typeof chains === 'function' ? chains() : chains)
        const landed = after - before
        if (landed < created) {
          return { verdict: 'REFUSED', detail: `of ${created} fresh chains, only ${landed} materialized`, attack: 'chain-rows-farm' }
        }
        return verdictFor(ctx, 'chain-rows-farm', {
          detail: `${landed} permanent chain rows from one prober; storage growth is bounded only by the relay's edge rate policy`,
        })
      },
    },

    {
      name: 'phantom-device-rows',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const deviceRows = take(ctx, 'counts').deviceRows
        const chainId = 'relay-shape-phantom-01'
        const registered = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-phantom-owner', writeSecret: newSecret() }))
        precondition(registered.status === 200, 'phantom-device-rows', `owner registration answered ${registered.status}`)
        const before = (deviceRows(chainId) || []).length
        for (let i = 0; i < 5; i++) {
          await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: `relay-phantom-${String(i).padStart(2, '0')}`, deviceName: 'Phantom' }))
        }
        const after = (deviceRows(chainId) || []).length - before
        if (after < 5) {
          return { verdict: 'REFUSED', detail: `of 5 join attempts, only ${after} rows materialized`, attack: 'phantom-device-rows' }
        }
        return verdictFor(ctx, 'phantom-device-rows', {
          detail: `${after} phantom device rows joined a chain they hold no secret for; the device list is a metadata surface`,
        })
      },
    },

    {
      name: 'waf-body-shapes',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const makePush = take(ctx, 'makePushBody')
        // A chain with a REAL secret (stored digest matches) so any door these
        // shapes opened would be an auth bypass, not just an unroutable probe.
        const chainId = 'relay-shape-waf-0001'
        const secret = newSecret()
        const registered = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-waf-owner', writeSecret: secret }))
        precondition(registered.status === 200, 'waf-body-shapes', `chain with a stored secret answered ${registered.status}`)
        const validPush = await makePush({ chainId, deviceId: 'shape-waf-owner', writeSecret: secret })

        // Raw-wire bodies (the harness passes strings straight into the
        // Request, so JSON.parse — not JSON.stringify — is what the target sees):
        // Built by string surgery on a REAL push body (not `.replace` on a
        // rendered JSON: a flattened push JSON ends in ONE brace, so a '}}'
        // needle never matches — the first run of this attack silently
        // "attacked" with the plain body and misread its 200 as the WAF
        // passing the proto key).
        const inner = JSON.stringify(validPush).slice(0, -1)
        const protoRaw = `${inner},"__proto__":{"isAdmin":true}}`
        const dupKeys = JSON.stringify(validPush).replace(`"chainId":"${chainId}"`, `"chainId":"${chainId}","chainId":"relay-shape-waf-other"`)
        const shapes = [
          ['top-level array', JSON.stringify([validPush])],
          ['raw __proto__ key', protoRaw],
          ['duplicate chainId keys', dupKeys],
          ['numeric data field', JSON.stringify({ ...validPush, data: 123456 })],
        ]
        const opened = []
        for (const [label, body] of shapes) {
          const res = await post(harness, routes.push, body, { rawBody: true })
          if (res.status === 200 || res.status == null) opened.push(`${label}→${res.status ?? 'THREW'}`)
        }
        if (opened.length === 0) {
          return { verdict: 'REFUSED', detail: `${shapes.length} hostile body shapes rejected, none authenticated`, attack: 'waf-body-shapes' }
        }
        return { verdict: 'EXPLOITED', detail: `hostile shapes got through: ${opened.join(', ')}`, attack: 'waf-body-shapes' }
      },
    },

    {
      name: 'parser-query-shapes',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const makePullUrl = take(ctx, 'makePullUrl')
        const deviceRows = take(ctx, 'counts').deviceRows
        // Hostile query params must not break pull; oversize names must not
        // store in full. Both: clamping/oracle checks, never 5xx/throw (the
        // fuzz floor, hard-coded for this attack).
        const chainId = 'relay-shape-query-01'
        const registered = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-query-owner', writeSecret: newSecret() }))
        precondition(registered.status === 200, 'parser-query-shapes', `chain answered ${registered.status}`)

        const probes = [
          ['since=1e999', await makePullUrl({ chainId, deviceId: 'shape-query-reader', since: '1e999' })],
          ['since=-5', await makePullUrl({ chainId, deviceId: 'shape-query-reader', since: -5 })],
          ['limit=abc', await makePullUrl({ chainId, deviceId: 'shape-query-reader', limit: 'abc' })],
        ]
        const broke = []
        for (const [label, url] of probes) {
          const res = await harness.run(routes.pull, { method: 'GET', url })
          if (res.threw || (res.status != null && res.status >= 500)) broke.push(`${label}→${res.status ?? 'THREW'}`)
        }
        const longNameChain = 'relay-shape-namelen-1'
        const named = await post(harness, routes.handshake, await makeCreate({ chainId: longNameChain, deviceId: 'shape-query-nameflooder', deviceName: 'A'.repeat(5000), writeSecret: newSecret() }))
        precondition(named.status === 200, 'parser-query-shapes', `oversize-name chain answered ${named.status}`)
        const stored = deviceRows(longNameChain).find((row) => row.id === 'shape-query-nameflooder')
        const nameLen = stored?.name?.length ?? Infinity
        if (broke.length === 0 && nameLen <= 64) {
          return { verdict: 'REFUSED', detail: `hostile since/limit clamped (${probes.length} probes) and the overlong deviceName stored at ${nameLen} chars`, attack: 'parser-query-shapes' }
        }
        return { verdict: 'EXPLOITED', detail: `broke: ${broke.join(', ') || '(pull ok)'}; deviceName stored at ${nameLen} chars`, attack: 'parser-query-shapes' }
      },
    },

    {
      name: 'watermark-pin',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const makePush = take(ctx, 'makePushBody')
        const makeUndecryptable = take(ctx, 'makeUndecryptablePushBody')
        const chainId = 'relay-shape-pin-0001'
        // The poisoner holds a VALID write capability (the owner's pairing-time
        // secret — anyone in a chain has one) but supplies ciphertext the
        // chain's passphrase key cannot read. A hardening relay would still
        // accept the write, because the data is opaque by design — the accepted
        // part is that the relay CANNOT validate ciphertext; the client-side
        // consequence (a watermark that holds rather than skips, retried on
        // the next sync) is the documented bound.
        const ownerSecret = newSecret()
        const registered = await post(harness, routes.handshake, await makeCreate({ chainId, deviceId: 'shape-pin-owner', writeSecret: ownerSecret }))
        precondition(registered.status === 200, 'watermark-pin', `chain create answered ${registered.status}`)
        const ownerPush = await post(harness, routes.push, await makePush({ chainId, deviceId: 'shape-pin-owner', writeSecret: ownerSecret }))
        precondition(ownerPush.status === 200, 'watermark-pin', `the owner's own valid write was refused (${ownerPush.status})`)
        const poison = await post(harness, routes.push, await makeUndecryptable({ chainId, deviceId: 'shape-pin-poisoner', writeSecret: ownerSecret }))
        if (poison.status !== 200) {
          return { verdict: 'REFUSED', detail: `owner chain ${ownerPush.status}, poison write ${poison.status} — the relay is not a passive poison conduit`, attack: 'watermark-pin' }
        }
        return verdictFor(ctx, 'watermark-pin', {
          detail: `poison ciphertext (wrong-for-the-chain passphrase) relayed through a valid write secret (${poison.status})`,
        })
      },
    },

    {
      name: 'guard-header-hygiene',
      async run(harness, ctx) {
        const routes = take(ctx, 'routes')
        const makeCreate = take(ctx, 'makeCreateBody')
        const limit = (take(ctx, 'limits').handshake ?? 0) + 3
        // One deviceId, many fresh chain ids, standard bodies: guard-refused
        // responses hand-roll their headers, so they are the likeliest place
        // for a caching mistake. The attack: drive the budget dry, then read
        // the shaped response's headers.
        let throttled = null
        for (let i = 0; i < limit; i++) {
          const res = await post(harness, routes.handshake, await makeCreate({
            chainId: `relay-shape-guard-${String(i).padStart(3, '0')}`,
            deviceId: 'shape-guard-prober',
            writeSecret: newSecret(),
          }))
          if (res.status === 429) { throttled = res; break }
        }
        if (!throttled) {
          return { verdict: 'EXPLOITED', detail: `no 429 within ${limit} attempts — the handshake guard never tripped under its own budget`, attack: 'guard-header-hygiene' }
        }
        const cacheControl = throttled.response?.headers?.get?.('cache-control')
        if (cacheControl === 'no-store') {
          return { verdict: 'REFUSED', detail: 'a shaped 429 carries Cache-Control: no-store', attack: 'guard-header-hygiene' }
        }
        return { verdict: 'EXPLOITED', detail: `a shaped 429 answers with cache-control: ${String(cacheControl)} — cacheable`, attack: 'guard-header-hygiene' }
      },
    },
  ],
}

// Guards: throttle, circuit breaking, and a small WAF for the /sync routes.
//
// Three separate concerns that all answer "what should this request not be
// allowed to do", kept in one module because they share the same vocabulary
// (policies, retry hints, guard responses) and the same failure mode: a guard
// that throws takes the sync down with it.
//
//   Throttle — fixed-window counters in D1. Bounds how *fast* a caller can
//              push/pull/handshake. `push` was already capped by SIZE
//              (MAX_PAYLOAD_BYTES) but not by RATE, so a device holding a valid
//              write secret could fill a chain as fast as the network allowed.
//              Every blob is a row that every other device must pull and try to
//              decrypt, so the cost lands on other people.
//
//   Breaker  — an in-isolate circuit breaker around D1. When the database is
//              down, every request that touches it fails slowly and expensively.
//              After N consecutive failures the breaker opens and requests are
//              refused immediately, so an outage is cheap instead of a pile of
//              timeouts. It is deliberately in-memory and per-isolate: the
//              breaker protects *this* isolate's connection pool, not a fleet,
//              and resetting it on a new isolate is harmless because it only
//              ever shortens the tail of an outage.
//
//   WAF      — cheap rejections that cost nothing when they pass: oversized
//              bodies, wrong content types, control characters in fields the
//              protocol says are base64/base64url, and prototype-pollution keys.
//              This is NOT a general SQL-injection defence — every statement in
//              the relay is already parameterised and no request field is ever
//              concatenated into SQL. It targets the two things that are true
//              here: requests that are not the protocol at all, and requests
//              big enough to be a denial-of-service.
//
// Every decision function in this file is pure so `sync:smoke` can test the
// exact rules without needing a running database to fail first.

import type { D1Database } from './sync'

// --- Policies ---------------------------------------------------------------
//
// Limits are per (scope, subject) pair — a chain, a device, or a chain+device
// bucket. They are chosen to sit well above what the real client does and well
// below what a flood costs. The client's own debounce/coalescing is the first
// line of defence (see src/sync/qos.ts); these are the backstop for a client
// that ignores it, a loopback script, or an attacker.

export interface RatePolicy {
  /** Requests allowed per window. */
  limit: number
  /** Window length in ms. Fixed window: a client can burst across a boundary. */
  windowMs: number
}

export const POLICIES = {
  /**
   * One device pushing.
   *
   * Sized from the client's own debounce rather than from a guess about human
   * typing: `SyncQos` pushes at most once per `PUSH_DEBOUNCE_MS` (1.5s), so the
   * theoretical worst case for a user who keeps touching the app is ~40 pushes
   * a minute. The limit sits at 3x that so an ordinary client never sees a
   * throttle, while a runaway loop still hits it within seconds.
   */
  push: { limit: 120, windowMs: 60_000 },
  /**
   * A whole chain pushing, summed across devices. Higher than the per-device
   * limit on purpose: a legitimate chain of 4 devices should not have 3 of them
   * throttled because the 4th is spamming. This is the anti-junk-blob guard.
   */
  pushChain: { limit: 600, windowMs: 60_000 },
  /**
   * Pulls are cheap (an indexed range scan) and are how a device notices other
   * devices' edits, so this is the loosest limit of the data routes. One
   * `pull()` is up to 20 HTTP requests when paging, so the allowance has to
   * cover a paged sync plus the periodic and focus-driven refreshes. It exists
   * mainly to stop a pull loop from starving pushes of D1 time.
   */
  pull: { limit: 240, windowMs: 60_000 },
  /**
   * Handshakes write a row and are only done on setup / reconnect, so the limit
   * is tight. A tight limit here is the anti-enumeration guard: it makes
   * walking chain ids to discover which chains exist expensive.
   */
  handshake: { limit: 20, windowMs: 60_000 },
  /**
   * Claiming is a once-ever operation per chain. Five a minute is far above
   * the UI's needs and low enough to make racing many claim attempts pointless.
   */
  claim: { limit: 5, windowMs: 60_000 },
  /**
   * Repeated write-secret failures for one chain. This is the guess-the-secret
   * guard: the secret is 256 bits of base64url, so guessing is hopeless, but
   * this also throttles a wrong-pairing loop from burning D1 writes forever.
   */
  writeFailures: { limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, RatePolicy>

// Fixed windows need eviction or the table grows without bound. One bucket row
// per (scope, subject) pair; prune anything whose window closed long ago.
const PRUNE_AFTER_MS = 10 * 60_000

// --- Throttle ---------------------------------------------------------------

export interface LimitRow {
  window_start: number
  count: number
}

export interface LimitDecision {
  /** Requests left in this window after this one. Never negative. */
  remaining: number
  /** The window this request lands in, for assertions and tests. */
  windowStart: number
}

export type LimitOutcome =
  | { ok: true; decision: LimitDecision }
  | { ok: false; retryAfterMs: number }

/**
 * Decide whether a request is allowed, given the stored row and a policy.
 *
 * A fixed window rather than a sliding log on purpose: a log would grow per
 * request and need a read-modify-write of every recent hit, and this throttle
 * is a backstop behind Cloudflare's edge rate limiting, not a billing meter.
 * The known consequence is that a caller can send `2 * limit` requests either
 * side of a boundary; the limits above are set so that is still far below the
 * cost of a real flood.
 *
 * Pure, and `now` is a parameter so the smoke test can step across window
 * boundaries without sleeping.
 */
export function evaluateLimit(
  row: LimitRow | null,
  policy: RatePolicy,
  now: number,
): LimitOutcome {
  // A window that has not started yet (`window_start` in the future) is treated
  // as absent, not as an open window. That case is real: these timestamps are
  // written by whichever Cloudflare PoP served the request, so a device can
  // legitimately see a window start a few seconds ahead of its own clock. If we
  // counted that as "inside the window", a row stored 10 minutes in the future
  // would refuse every request until real time caught up — a self-inflicted
  // outage for that chain that no amount of waiting in the client would fix.
  const usable =
    row !== null && now - row.window_start < policy.windowMs && row.window_start <= now

  if (!usable) {
    // Either the first ever hit, the previous window closed, or the stored
    // window is unusable: this request opens a fresh one and is always allowed.
    // Resetting the count here is also what stops a long flood from inflating
    // the stored count without bound.
    return {
      ok: true,
      decision: { remaining: Math.max(policy.limit - 1, 0), windowStart: now },
    }
  }

  // `row.count` is the number already spent in this window.
  if (row!.count >= policy.limit) {
    return {
      ok: false,
      retryAfterMs: Math.max(policy.windowMs - (now - row!.window_start), 1),
    }
  }

  return {
    ok: true,
    decision: {
      remaining: Math.max(policy.limit - row!.count - 1, 0),
      windowStart: row!.window_start,
    },
  }
}

/** Seconds, rounded up, for a `Retry-After` header. */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000))
}

/**
 * Read a bucket's row, for assertions and for the failure-budget path.
 */
export async function readLimit(
  db: D1Database,
  scope: string,
  subject: string,
): Promise<LimitRow | null> {
  const row = await db
    .prepare('SELECT window_start, count FROM rate_limits WHERE key = ?')
    .bind(`${scope}:${subject}`)
    .first<LimitRow>()
  if (!row) return null
  return { window_start: Number(row.window_start), count: Number(row.count) }
}

/**
 * Count this request against a bucket and report whether it is allowed.
 *
 * The counter is written with a single upsert, so a concurrent burst cannot let
 * two requests both read count=0 and both be admitted.
 */
export async function consumeLimit(
  db: D1Database,
  scope: string,
  subject: string,
  policy: RatePolicy,
  now = Date.now(),
): Promise<LimitOutcome> {
  const key = `${scope}:${subject}`
  const existing = await readLimit(db, scope, subject)
  const outcome = evaluateLimit(existing, policy, now)

  // A denied request does not advance the counter. Charging it would make a
  // caller that keeps hammering the door unable to recover until the counter
  // happened to roll over exactly, which reads as "permanently banned" and is
  // far harsher than the policy intends.
  if (!outcome.ok) return outcome

  // One statement, because the alternative — SELECT then INSERT/UPDATE — races:
// two concurrent requests would both read count=0 and both be allowed, so a
// burst would slip past the limit by exactly the burst size.
//
// The CASE is the reset rule: if the window we computed is the window already
// stored, this is another hit in the same window, so increment; if it differs,
// `evaluateLimit` decided the old window was finished and this is the first hit
// of a new one, so start at 1. `window_start` on the right-hand side is the
// *existing* row's value during an upsert, which is what makes this work.
await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start = ? THEN count + 1 ELSE 1 END,
         window_start = ?`,
    )
    .bind(key, outcome.decision.windowStart, outcome.decision.windowStart, outcome.decision.windowStart)
    .run()

  return outcome
}

/**
 * Charge a *rejected* request — a wrong write secret, say — to its own budget.
 *
 * Kept separate from `consumeLimit` because these are different kinds of thing:
 * a wrong secret is not a request the chain wanted to serve, so it must not
 * spend the caller's normal push allowance, but twenty of them a minute is
 * someone guessing. This deliberately does not touch the push bucket, so a
 * legitimate device that has one stale secret cannot be pushed below its own
 * limit by the attempts of a third party hammering the same chain.
 */
export async function chargeFailure(
  db: D1Database,
  scope: string,
  subject: string,
  policy: RatePolicy,
  now = Date.now(),
): Promise<LimitOutcome> {
  return consumeLimit(db, scope, subject, policy, now)
}

/** Drop buckets whose window closed long ago. Cheap, safe to run often. */
export async function pruneLimits(db: D1Database, now = Date.now()): Promise<void> {
  await db
    .prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(now - PRUNE_AFTER_MS)
    .run()
}

// --- Circuit breaker --------------------------------------------------------

export type BreakerState = 'closed' | 'open'

export interface BreakerPolicy {
  /** Consecutive failures before the breaker opens. */
  failures: number
  /** How long the breaker stays open before allowing a trial request. */
  cooldownMs: number
}

export const BREAKER_POLICY: BreakerPolicy = { failures: 5, cooldownMs: 15_000 }

export interface BreakerVerdict {
  state: BreakerState
  /** Failures left before the breaker opens. Zero once it is open. */
  budget: number
  /** Populated when the breaker is open. */
  retryAfterMs: number
}

export const BREAKER_CLOSED: BreakerState = 'closed'

/**
 * Advance the breaker for one observed outcome.
 *
 * `budget` is passed in rather than tracked internally, which keeps this pure
 * and therefore walkable in a test: the caller owns the running count, this
 * function owns the rule about what to do with it.
 *
 * The open case matters. A failure while already open does NOT re-arm the
 * cooldown — otherwise a dead database under continuous traffic would keep
 * pushing `openedAt` forward and the breaker would never serve a trial request.
 * It would just refuse everything, forever.
 */
export function advanceBreaker(
  state: BreakerState,
  budget: number,
  outcome: 'success' | 'failure',
  policy: BreakerPolicy = BREAKER_POLICY,
): BreakerVerdict & { next: BreakerState } {
  if (outcome === 'success') {
    // Any success proves the dependency is healthy again, so the full budget is
    // restored. This is what stops a database that flaps from spending most of
    // its life open.
    return { state, next: 'closed', budget: policy.failures, retryAfterMs: 0 }
  }

  if (state === 'open') {
    return { state, next: 'open', budget: 0, retryAfterMs: 0 }
  }

  const left = budget - 1
  if (left <= 0) return { state, next: 'open', budget: 0, retryAfterMs: policy.cooldownMs }
  return { state, next: 'closed', budget: left, retryAfterMs: 0 }
}

/**
 * Whether the breaker currently allows a request, and for how long it must
 * wait if not. Time is injected for the same reason as `advanceBreaker`.
 */
export function breakerAllows(
  state: BreakerState,
  openedAt: number,
  policy: BreakerPolicy,
  now: number,
): BreakerVerdict {
  if (state === 'closed') {
    return { state, budget: policy.failures, retryAfterMs: 0 }
  }
  const elapsed = now - openedAt
  if (elapsed >= policy.cooldownMs) {
    // Cooldown served: let one request through to test whether D1 is back.
    return { state, budget: 0, retryAfterMs: 0 }
  }
  return { state, budget: 0, retryAfterMs: Math.max(policy.cooldownMs - elapsed, 1) }
}

/**
 * The relay's own breaker instance.
 *
 * Module scope = one per isolate, which is exactly the scope a circuit breaker
 * is correct at: it protects this isolate's database connection pool. A new
 * isolate starts closed and simply re-discovers an outage, which costs a few
 * failed requests and no correctness.
 *
 * D1 does not expose per-request error classification, so "failure" here means
 * "the database call threw". A caller that wants a guard for a narrower failure
 * class should count it into the breaker explicitly.
 */
let breakerState: BreakerState = BREAKER_CLOSED
let breakerBudget = BREAKER_POLICY.failures
let breakerOpenedAt = 0

export function breakerPeek(now = Date.now()): BreakerVerdict {
  const verdict = breakerAllows(breakerState, breakerOpenedAt, BREAKER_POLICY, now)
  // Report the live budget, not the policy default, so the number reflects
  // the failures actually seen so far.
  return breakerState === 'closed' ? { ...verdict, budget: breakerBudget } : verdict
}

export function breakerRecord(outcome: 'success' | 'failure', now = Date.now()): BreakerState {
  if (outcome === 'success') {
    // Any success proves the dependency is healthy again, so reset both the
    // budget and the cooldown — otherwise a database that flaps would spend
    // most of its time open.
    breakerBudget = BREAKER_POLICY.failures
    breakerOpenedAt = 0
    breakerState = 'closed'
    return breakerState
  }

  // While the cooldown is still running, failures are absorbed but change
  // nothing: not the timer, not the budget.
  if (breakerAllows(breakerState, breakerOpenedAt, BREAKER_POLICY, now).retryAfterMs > 0) {
    return breakerState
  }

  // Only reached when the breaker is closed, or open with its cooldown served
  // (the trial request). A failed trial re-opens from this instant.
  const transition = advanceBreaker(breakerState, breakerBudget, 'failure')
  breakerState = transition.next
  breakerBudget = transition.budget
  if (transition.next === 'open') breakerOpenedAt = now
  return breakerState
}

/** Test seam: forget any breaker state recorded so far. */
export function resetBreaker(): void {
  breakerState = BREAKER_CLOSED
  breakerBudget = BREAKER_POLICY.failures
  breakerOpenedAt = 0
}

// --- WAF --------------------------------------------------------------------

/**
 * Hard ceiling on any request body, independent of the protocol's own payload
 * cap. `MAX_PAYLOAD_BYTES` bounds the encrypted `data` field; this bounds what
 * the edge will even buffer for us, so a multi-megabyte junk body is refused
 * before it is parsed into objects.
 */
export const MAX_BODY_BYTES = 6_000_000

export type WafVerdict = { ok: true } | { ok: false; reason: string }

/**
 * Reject a request that is not shaped like the protocol.
 *
 * Deliberately conservative: it only rejects what is *structurally* impossible
 * for a legitimate client, so it cannot produce a false positive that blocks a
 * user's sync. Device names and the encrypted payload are passed through —
 * `data` is checked for size only, because it is opaque ciphertext by design.
 */
export function inspectBody(body: unknown, policy: { maxDataBytes: number }): WafVerdict {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'Body must be a JSON object' }
  }

  // Prototype pollution: `__proto__`/`constructor` keys in a parsed body are a
  // way to make downstream merges do surprising things. No legitimate client
  // sends them at this level, so refuse rather than sanitise.
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return { ok: false, reason: 'Body contains a forbidden key' }
    }
  }

  // Reject an object whose declared field count is absurd. A JSON body of
  // `{"a":1,"b":1,...}` repeated a few million times is a cheap way to burn
  // parse time; the protocol has a handful of fields.
  if (Object.keys(record).length > 32) {
    return { ok: false, reason: 'Body has too many fields' }
  }

  const data = record.data
  if (data !== undefined && typeof data !== 'string') {
    return { ok: false, reason: 'Field "data" must be a string' }
  }
  if (typeof data === 'string' && data.length > policy.maxDataBytes) {
    return { ok: false, reason: 'Encrypted payload is too large' }
  }

  return { ok: true }
}

/**
 * `chainId`/`deviceId`/secret fields must not carry control characters. These
 * are matched against strict regexes elsewhere, so this is belt-and-braces for
 * the paths that only trim the value.
 */
export function hasControlChars(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001F\u007F]/.test(value)
}
// --- Guard responses --------------------------------------------------------

/**
 * 429 with a `Retry-After` header.
 *
 * The header is the part that matters: it is how a standards-compliant client
 * knows when to come back, and `src/sync/agent.ts` reads it to schedule its
 * backoff instead of guessing. The message is written for a human reading the
 * sync panel, so it says what happened and what to do, not just "rate limited".
 */
export function throttledResponse(retryAfterMs: number, message: string): Response {
  return new Response(JSON.stringify({ error: message, retryAfterMs }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Retry-After': String(retryAfterSeconds(retryAfterMs)),
      'X-RateLimit-Remaining': '0',
    },
  })
}

/**
 * 503 while the breaker is open.
 *
 * 503 (not 429) because the client should back off but this is not the caller's
 * fault, and `Retry-After` still tells it when to try again.
 */
export function breakerResponse(retryAfterMs: number): Response {
  return new Response(
    JSON.stringify({ error: 'Sync storage is temporarily unavailable', retryAfterMs }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Retry-After': String(retryAfterSeconds(retryAfterMs)),
      },
    },
  )
}

// --- The one call a route makes ---------------------------------------------

/**
 * Run the breaker and the throttle, in that order, before a route does any
 * work. Returns the response to send when the request must be refused, or
 * `{ ok: true }` to proceed.
 *
 * Breaker first because it is free: when the database is down the throttle's
 * own read would also fail, so checking the breaker first is what turns an
 * outage into a fast 503 instead of a slow pile of errors.
 *
 * Deliberately never throws. A guard that throws takes sync down with it, so
 * every failure path here degrades to "allow", and the route's own logic is
 * still the thing that decides. `guardRoute` is not a security boundary on its
 * own — write auth in `push.ts` is.
 */
export async function guardRoute(
  db: D1Database,
  options: { scope: string; subject: string; policy: RatePolicy },
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const verdict = breakerPeek()
  if (verdict.retryAfterMs > 0) {
    return { ok: false, response: breakerResponse(verdict.retryAfterMs) }
  }

  try {
    const outcome = await consumeLimit(db, options.scope, options.subject, options.policy)
    if (!outcome.ok) {
      return {
        ok: false,
        response: throttledResponse(
          outcome.retryAfterMs,
          `Too many ${options.scope} requests — slow down and try again shortly.`,
        ),
      }
    }
  } catch {
    // If the throttle itself cannot run, do not fail the user's sync. The route
    // will hit the same broken database and record the failure against the
    // breaker, which is where it belongs.
    return { ok: true }
  }

  return { ok: true }
}

/**
 * Wrap a route so an unexpected database error becomes a breaker failure.
 *
 * Without this, every route would need its own try/catch around every D1 call
 * purely to feed the breaker, and the ones that forgot would leave the breaker
 * starved of failures exactly when the database was down — the one situation it
 * exists for.
 *
 * A thrown error means the storage layer itself failed: `push.ts` and `claim.ts`
 * already catch the specific errors they can describe, so this is the fallback
 * for the rest (and for a genuinely broken D1).
 *
 * The response is a 503 rather than a 500 because it is temporary and the
 * client should retry — which is precisely what `SyncQos` does with it.
 */
export function withBreaker(
  handler: (db: D1Database, context: { request: Request; env: unknown }) => Promise<Response>,
): (context: { request: Request; env: unknown }) => Promise<Response> {
  return async (context) => {
    const db = (context.env as { GISTRY_DB?: D1Database } | undefined)?.GISTRY_DB ?? null
    if (!db) {
      // Missing binding is a configuration error, not an outage: it will not
      // fix itself, so charging it against the breaker would only ever delay
      // the (correct) 500 the route returns anyway.
      return new Response(JSON.stringify({ error: 'Sync storage is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const response = await handler(db, context)
      // A 500 the handler produced on purpose (e.g. "could not allocate a
      // sequence number") still means storage is not working.
      if (response.status >= 500) breakerRecord('failure')
      return response
    } catch {
      breakerRecord('failure')
      return breakerResponse(BREAKER_POLICY.cooldownMs)
    }
  }
}

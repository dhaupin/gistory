// Client-side QoS: debounce, coalesce, and back off.
//
// The server guards (functions/_shared/guards.ts) are the backstop. This is the
// first line: a client that never gets ahead of itself generates no traffic for
// the server to reject, which means the user never sees a throttle error and
// never loses a change to one.
//
// Three behaviours, in the order they matter:
//
//   Debounce   — the server's push limit is per window, so a burst of keystroke
//                saves must not become a burst of pushes. The existing 1.5s
//                effect in App.tsx does this; `PUSH_DEBOUNCE_MS` is that number
//                moved here so the delay and the retry policy are argued about
//                in one place.
//
//   Coalesce   — if a change arrives while a push is in flight, remember only
//                that "something changed" and push once more afterwards. Without
//                this, N edits during one slow push turn into N queued pushes
//                that each carry a snapshot nobody needs.
//
//   Back off   — on 429/503 the server says how long to wait in `Retry-After`.
//                Honour it. On any other failure, back off exponentially. The
//                crucial detail is that a push is **never** dropped on failure:
//                `SyncQos` keeps the pending flag set, so the retry always
//                carries the newest state.
//
// Pure where it can be: the backoff maths is exported on its own and takes its
// inputs as arguments, so `sync:smoke` can assert the curve without waiting on
// real timers.

import { SyncError } from './agent'

/** Matches the debounce the App previously hard-coded. */
export const PUSH_DEBOUNCE_MS = 1500

/** Pulls are cheap and idempotent; retry them sooner than a push. */
export const RETRY_BASE_MS = 2000
export const RETRY_MAX_MS = 60_000

export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
  /** Server-supplied hint. When present it wins over the computed delay. */
  retryAfterMs?: number
  /** Injected so tests are deterministic. */
  jitter?: (attempt: number) => number
}

/**
 * Delay before retrying, in ms.
 *
 * Doubling from `baseMs` up to `maxMs`, plus jitter. Jitter matters more than it
 * looks: every device in a chain that hit a 429 at the same moment would
 * otherwise retry in lockstep and immediately hit it again, which is how a
 * thundering herd turns a brief limit into a sustained one.
 *
 * `retryAfterMs` overrides the curve entirely when the server sent one — it
 * knows more than we do, and ignoring it is how a client ends up hammering a
 * door that has explicitly told it to wait.
 */
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? RETRY_BASE_MS
  const max = options.maxMs ?? RETRY_MAX_MS

  if (options.retryAfterMs != null && options.retryAfterMs > 0) {
    // Never trust a server hint beyond our own ceiling: a hostile or buggy
    // `Retry-After` must not be able to park this client for an hour.
    return Math.min(options.retryAfterMs, max)
  }

  const safeAttempt = Math.max(1, Math.floor(attempt))
  const exponential = Math.min(base * Math.pow(2, safeAttempt - 1), max)
  const jitter = options.jitter ? options.jitter(safeAttempt) : 0
  return Math.min(Math.max(exponential + jitter, 0), max)
}

/**
 * Whether a failed push can NEVER succeed by retrying.
 *
 * 429/503 are load responses — the server explicitly says "later", so the
 * change stays pending and the retry carries it. But a 4xx like 401/403
 * (write auth) or 413 (payload too large) describes the request itself: the
 * same bytes will be refused forever until the user acts (re-pairs, or prunes
 * their library). Retrying those on a timer is an infinite futile loop — and
 * a 403 loop even keeps charging the chain's server-side write-fail budget.
 *
 * Deliberately narrow: anything that is not a `SyncError`, and any 5xx, stays
 * retryable — the never-drop invariant is for failures that are transient or
 * unknown, and only the narrow class above is PROVEN permanent.
 */
export function isTerminalPushFailure(err: unknown): boolean {
  if (!(err instanceof SyncError)) return false
  const { status } = err
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

// --- Coalescing push scheduler ----------------------------------------------

export type QosStatus = 'idle' | 'scheduled' | 'pushing' | 'backing-off'

export interface QosState {
  status: QosStatus
  /** A change happened while a push was in flight and still owes a push. */
  pending: boolean
  /** When the next push will run, if one is scheduled. */
  dueAt: number | null
  /** Consecutive failures; resets on success. */
  failures: number
}

export interface SyncQosOptions {
  onPush: () => Promise<void>
  debounceMs?: number
  retryBaseMs?: number
  retryMaxMs?: number
  /** Injected for tests; defaults to the real clock and timers. */
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  jitter?: (attempt: number) => number
}

/**
 * Debounces, coalesces, and retries pushes.
 *
 * Deliberately not a React hook: `App.tsx` keeps it in a ref, because the
 * scheduler's whole job is to survive across renders and a hook that rebuilt on
 * every render would cancel the timer it is meant to own.
 *
 * The invariant that matters, and the one the tests pin: **`onPush` is never
 * called concurrently, and a failed push is always retried.** Everything else is
 * a QoS nicety on top of those two.
 */
export class SyncQos {
  private timer: unknown = null
  private dueAt: number | null = null
  private inFlight = false
  private pending = false
  private failures = 0
  private stopped = false

  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private readonly debounceMs: number
  private readonly retryBaseMs: number
  private readonly retryMaxMs: number
  private readonly jitter: ((attempt: number) => number) | undefined

  constructor(private readonly options: SyncQosOptions) {
    this.now = options.now ?? (() => Date.now())
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as never))
    this.debounceMs = options.debounceMs ?? PUSH_DEBOUNCE_MS
    this.retryBaseMs = options.retryBaseMs ?? RETRY_BASE_MS
    this.retryMaxMs = options.retryMaxMs ?? RETRY_MAX_MS
    this.jitter = options.jitter
  }

  /** Snapshot for tests and for a UI that wants to show sync state. */
  getState(): QosState {
    return {
      status: this.inFlight
        ? 'pushing'
        : this.dueAt !== null && this.failures > 0
          ? 'backing-off'
          : this.dueAt !== null
            ? 'scheduled'
            : 'idle',
      pending: this.pending,
      dueAt: this.dueAt,
      failures: this.failures,
    }
  }

  /**
   * Note that local state changed and a push is owed.
   *
   * Restarts the debounce timer every time, so a burst of edits collapses into
   * one push. Does nothing while a push is in flight beyond setting `pending`;
   * `flush` picks it up when that push settles.
   */
  schedule(): void {
    if (this.stopped) return

    if (this.inFlight) {
      this.pending = true
      return
    }

    this.pending = true
    this.arm(this.debounceMs)
  }

  /** Push now if anything is owed, ignoring the debounce. Used on manual sync. */
  flush(): void {
    if (this.stopped) return
    this.pending = true
    if (this.inFlight) return
    this.cancelTimer()
    void this.run()
  }

  /** Stop scheduling and drop any pending timer. Safe to call repeatedly. */
  stop(): void {
    this.stopped = true
    this.cancelTimer()
    this.dueAt = null
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
    this.dueAt = null
  }

  private arm(delayMs: number): void {
    this.cancelTimer()
    const wait = Math.max(delayMs, 0)
    this.dueAt = this.now() + wait
    this.timer = this.setTimer(() => {
      this.timer = null
      this.dueAt = null
      void this.run()
    }, wait)
  }

  private async run(): Promise<void> {
    // The re-entrancy guard that makes the "never concurrent" invariant hold
    // even if something calls flush() from inside onPush.
    if (this.inFlight || this.stopped) return
    this.inFlight = true
    this.pending = false

    try {
      await this.options.onPush()
      this.failures = 0
    } catch (err) {
      this.failures += 1
      // A terminal refusal (write auth, payload too large) cannot succeed on
      // retry, so stop the automatic loop: go idle with the error already
      // surfaced by the `onPush` caller. The change itself is not lost — it is
      // still in local state, and the next edit schedules a fresh push. Every
      // other failure sets `pending` again, so the change is never dropped —
      // that is a retry, not a drop.
      this.pending = isTerminalPushFailure(err) ? false : true
    } finally {
      this.inFlight = false
    }

    if (this.stopped) return

    if (this.pending) {
      const delay =
        this.failures > 0
          ? backoffDelay(this.failures, {
              baseMs: this.retryBaseMs,
              maxMs: this.retryMaxMs,
              // A `SyncError` may carry the server's Retry-After; the caller
              // reads it off `lastError` via `retryAfterHint`.
              retryAfterMs: this.retryAfterHint(),
              jitter: this.jitter,
            })
          : this.debounceMs
      this.arm(delay)
    }
  }

  /** Server-supplied wait, when the last failure was a throttled response. */
  private retryAfterHint(): number | undefined {
    return this.lastRetryAfterMs
  }

  private lastRetryAfterMs: number | undefined

  /**
   * Tell the scheduler what the server asked for after a 429/503.
   *
   * Kept separate from `schedule()` so the hint is applied to the retry that is
   * already scheduled rather than to the failure that caused it.
   */
  setRetryAfter(ms: number | undefined): void {
    this.lastRetryAfterMs = ms && ms > 0 ? ms : undefined
  }

  /** Forget any backoff, e.g. when the user enables sync or comes back online. */
  reset(): void {
    this.failures = 0
    this.lastRetryAfterMs = undefined
    this.stopped = false
  }
}
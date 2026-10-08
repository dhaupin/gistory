// User-facing sync error messages.
//
// The Pages Functions return accurate strings, but they are written for a log.
// This maps the ones a user can actually act on — above all the write-auth
// failures, which are a normal consequence of pairing with an older code
// rather than something being broken.
//
// Kept pure and dependency-free so `sync:smoke` can cover it without pulling
// in the React tree that `App.tsx` sits on.

import { SyncError } from './agent'

export function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)

  // A throttle is the server asking us to slow down. Nothing is lost: the QoS
  // scheduler is already holding the pending change and will retry it, so the
  // user needs to know this is a pause and not a failure — otherwise a 429
  // reads as "sync is broken" and invites pointless retries.
  if (err instanceof SyncError && err.throttled) {
    const wait = err.retryAfterMs ? Math.max(Math.round(err.retryAfterMs / 1000), 1) : null
    return wait
      ? `Sync is busy right now — changes are saved locally and will upload in about ${wait}s.`
      : 'Sync is busy right now — changes are saved locally and will upload shortly.'
  }

  // A device paired with a pre-write-auth code: it can pull, but every push is
  // refused. Re-pairing with a current code is the fix.
  if (/missing or malformed write secret/i.test(message)) {
    return 'This device can read the chain but cannot write to it. Pair it again with a current pairing code to sync changes back.'
  }
  if (/wrong write secret/i.test(message)) {
    return 'This device is not allowed to write to the chain. Re-pair it with a current pairing code.'
  }
  // A blob the client cannot read. Wrong passphrase is the common cause;
  // tampering is the other, and both look identical from here.
  if (/could not be decrypted/i.test(message)) {
    return message
  }

  return message
}
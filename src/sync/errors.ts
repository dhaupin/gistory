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

// --- Undecryptable-blob attribution -----------------------------------------

/**
 * Turn a pull's per-sender decrypt-failure bookkeeping into ONE actionable
 * string.
 *
 * The plain count ("49 changes could not be decrypted") tells the user nothing
 * they can act on. The notably different situations are:
 *
 *   • no other device's blob ever decrypted  → THIS device is out of key with
 *     the chain: a stale cached app version (older builds derived the key with
 *     a different salt) or a passphrase variant from when it paired. Fix on
 *     this device.
 *   • exactly one (or a few) senders always fail while others read cleanly   →
 *     THOSE devices write a key the rest cannot read. Fix on those devices.
 *   • a failing sender that is NOT in the chain's device list → someone wrote
 *     to the chain without ever handshaking under a name: probably junk or
 *     tampering. Say who, and suggest rotating the chain.
 *
 * Pure and dependency-free so `sync:smoke` can cover every branch.
 */
export interface DecryptFailureInput {
  failBy: Record<string, number>
  okBy: Record<string, number>
  myDeviceId: string
  /** The chain's device list from status, for id → name mapping. May be empty. */
  devices: { id: string; name: string }[]
  failures: number
}

/** A short label for a sender id: its device name, or a recognizable partial id. */
function senderLabel(id: string, devices: { id: string; name: string }[]): string {
  const device = devices.find(d => d.id === id)
  if (device) return `'${device.name}'`
  return `an unrecognized device (id ${id.slice(0, 8)}…)`
}

export function describeDecryptFailures(input: DecryptFailureInput): string {
  const { failBy, okBy, myDeviceId, devices, failures } = input

  // Only OTHER senders missing — the pull route already excludes own blobs, so
  // an entry under our own id would mean someone is writing under our identity.
  const failingPeers = Object.entries(failBy).filter(([id]) => id !== myDeviceId)
  const okOther = Object.entries(okBy).filter(([id]) => id !== myDeviceId)

  if (failingPeers.length === 0) {
    return `${failures} change(s) could not be decrypted — this chain has content this device cannot read. Turn sync off and re-join with the chain's passphrase.`
  }

  const known = (id: string): boolean => devices.some(d => d.id === id)
  const foreign = failingPeers.filter(([id]) => !known(id) && id !== 'unknown')

  // Tampering branch: a writer the device list does not know. This is about
  // identity, not keys — the pull route lets anyone who knows the chainId
  // register a device, so this signals junk instead of a passphrase story.
  if (foreign.length > 0) {
    const who = foreign.map(([id]) => senderLabel(id, devices)).join(', ')
    const counts = foreign.reduce((sum, [, n]) => sum + n, 0)
    return `${counts} change(s) from ${who} could not be decrypted — written outside this chain's shared key. If you don't recognize ${foreign.length === 1 ? 'that device' : 'those devices'}, someone with your chain id may have tampered with the chain; rotate it in Settings (turn sync off, back on, re-pair your devices).`
  }

  // Nobody else ever decrypted: this device is the mismatched key.
  if (okOther.length === 0) {
    return `${failures} change(s) could not be decrypted — this device is out of key with the rest of the chain. Most often a stale cached app version, or a passphrase variant from when it paired. Hard-reload this device so it runs the current version; if that doesn't help, turn sync off here and re-join the chain with the same passphrase your other devices use.`
  }

  // Some peers read cleanly, some fail: the failing sender is the odd key out.
  if (failingPeers.length === 1) {
    const [id, count] = failingPeers[0]
    const label = id === 'unknown' ? 'a device it cannot identify' : senderLabel(id, devices)
    return `${count} change(s) from ${label} could not be decrypted — that device is writing with a different key than the rest of the chain. Hard-reload THAT device so it runs the current version; if it still reports errors, turn sync off there and re-join this chain with the chain's passphrase. Your other devices' changes still sync meanwhile.`
  }

  const list = failingPeers
    .map(([id, n]) => `${n} from ${id === 'unknown' ? 'an unidentified device' : senderLabel(id, devices)}`)
    .join(', ')
  return `${failures} change(s) could not be decrypted (${list}) — those devices are writing with a different key than this one. Hard-reload them so they run the current version; if it persists, re-join the chain there with the chain's passphrase. Your other changes still sync meanwhile.`
}
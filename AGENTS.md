# Gistory - Agent Knowledge

This file documents deep mechanics for anyone working on the codebase.

## Sync Architecture

### The Core Problem
Browser-based apps can't maintain server state. Every device has the full data locally and pushes to sync. This creates challenges:

1. **Offline editing** - Device makes changes while offline
2. **Race conditions** - Two devices edit simultaneously 
3. **Data loss** - Without persistence, server deploy drops data

### How It Works

#### Encryption Layer
```
passphrase + deviceId → PBKDF2 → CryptoKey (never leaves device)
data → AES-GCM encrypt → encrypted blob → server
```

The encryption key is derived from your passphrase + unique device ID. Same passphrase on different devices = different keys (by design).

#### Sequence Protocol
```
Device A (seq 10): edits prompts → push() → server (seq 11)
Device B: pull() ← server → receives A's blob → merge
```

Each push sends **full state**. Server doesn't know what's in the blob - just stores and sequences it. Client is the smart part.

### Filtering Trick

Worker filters on pull to avoid re-downloading your own changes:

```typescript
// pull.ts
for (seq = since+1; seq <= serverSeq; seq++) {
  blob = get(seq)
  if (blob.deviceId === requestingDeviceId) continue  // Skip self
  results.push(blob)
}
```

This means:
- You push at seq 100
- You pull → get seq 100's diff (other devices' blobs), NOT your own
- You see their changes, they don't re-see yours

### Conflict Resolution

When two devices have the same item modified:

```typescript
// App.tsx handleRefresh()
if (t.updatedAt > local.updatedAt) keep_remote()
else if (t.updatedAt === local.updatedAt) {
  if (t.senderDeviceId > myDeviceId) keep_remote()
  // else keep local
}
```

Rules:
1. **Later timestamp wins** (trusts clock)
2. **Tie-breaker**: lexicographically larger deviceId wins (deterministic)

Drawback: Clock skew can cause issues. Future: vector clocks could fix.

## Data Flow

### Initial Sync
```
Settings → Enable Sync → 
  1. Generate identity (deviceId from crypto.random)
  2. Derive encryption key (passphrase + deviceId)
  3. Handshake → create/get chainId
  4. Push full state
```

### Ongoing Sync
```
Manual Refresh → 
  pull() → decrypt → merge → 
  push() with updated data

Auto-sync option: 
  push(data, autoPull=true) → if serverSeq > lastSeq → pull first → push
```

## Key Interfaces

### SyncAgent
```typescript
class SyncAgent {
  config: { workerUrl, syncKey, deviceName }
  identity: { id, name, pubkey } | null
  key: CryptoKey | null
  chain: { id, devices[], version } | null
  lastSeq: number
  
  async init()
  async handshake(existingChainId?)
  async push(data, autoPull=false)
  async pull(): object[]
  async checkStatus(): { serverSeq, hasUpdates }
  getDeviceId(): string
}
```

### Worker API
```
POST /sync/push   { chainId, seq, data, deviceId } → { ok, seq }
GET  /sync/pull   ?chain=X&since=Y&deviceId=Z → { blobs[], serverSeq }
GET  /sync/status ?chain=X → { chainId, serverSeq, devices[] }
```

## Interesting Patterns

### 1. In-Memory Fallback → KV Migration
Workers initially used Map. KV adds persistence:

```typescript
// Old (Map)
const store = new Map()
store.set(key, value)

// New (KV) 
await env.GISTRY_KV.put(key, value)
```

The error handling gracefully degrades:
```typescript
if (!env.GISTRY_KV) {
  return { error: 'KV not configured' }
}
```

### 2. Device-Aware Filtering
Only pushed in later commit. Originally all devices got all blobs. Now:

- Each blob tagged with deviceId
- Pull filters excluding sender
- Prevents re-downloading own changes

### 3. Full State Push
Current design sends entire state each push. Trade-offs:

Pros:
- Simple (no operational transform)
- Works with gaps (any point-to-any sync)
- Offline-friendly (queue locally, push when online)

Cons:
- Larger payloads
- Later timestamp wins (not operational CRDT)
- No undo/redo from historical

Future could switch to incremental operations or CRDT.

## Gotchas

### 1. Same Passphrase ≠ Same Key
Derivation includes deviceId:
```typescript
key = await deriveKey(passphrase, deviceId)
// deviceId varies per device → different key
// Encrypted on A can ONLY decrypt on A
```

This is intentional for security. But means you CANNOT share encrypted data without sharing the same deviceId, which requires same derivation inputs.

### 2. Sequence Gaps
```typescript
// Server: seq 1, 2, 3
// Client: since=2 → pulls 3 only
// What if 2 was from you? Filtered out! ✓
// What if gap in middle?
// Pull iterates: for (seq = since+1; seq <= serverSeq; seq++)
// Returns ALL between, regardless of gaps
```

### 3. Clock Dependency
Conflict resolution uses timestamps. If devices have wrong clocks:
- Device A at 10:00 → edits itemX
- Device B at 09:55 → edits same itemX  
- Later: B's clock is wrong, thinks 09:55 < 10:00
- Resolution: B accepts A's change (correct)
- Reverse: If A's clock shows 09:55, B's shows 10:00 → A accepts B's (also correct per clocks)

Winners follow clock. Future: vector clocks or Lamport timestamps can fix.

## Files Quick Ref

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main state, merge logic in handleRefresh() |
| `src/sync/agent.ts` | Client encryption, push/pull, status |
| `functions/sync/push.ts` | Accept encrypted blobs → KV |
| `functions/sync/pull.ts` | Return filtered blobs ← KV |
| `functions/sync/status.ts` | Chain health checkpoint |
| `wrangler.toml` | Worker config, KV binding |

## Testing Notes

- Worker locally: `npx wrangler dev`
- Worker deploy: `npx wrangler deploy`
- Tail logs: `npx wrangler tail`
- Frontend: vite builds to `dist/`

## Future Improvements

Seen from working on this:
1. **Vector clocks** - Replace timestamp-only conflict
2. **Incremental ops** - Instead of full state push
3. **CRDT** - For automatic conflict-free merges  
4. **History** - Undo/redo from old states
5. **Offline queue** - Better offline handling
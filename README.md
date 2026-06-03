# Gistory

A secure, privacy-first prompt keeper for AI prompting workflows. Built with React + Cloudflare Workers.

## Features

- **Encrypted sync** - End-to-end encryption using device-derived keys (AES-GCM)
- **Multi-device** - Works across PC, phone, tablet with cross-device sync
- **QR pairing** - Easy mobile pairing with QR code scanning  
- **Privacy first** - Your data never leaves your devices unencrypted
- **Conflict resolution** - Smart merge with timestamps + device ID tie-breaking

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works!)
- npm or yarn

### Setup

```bash
# Clone
git clone https://github.com/dhaupin/gistory.git
cd gistory

# Install
npm install
```

### Run Locally

```bash
npm run dev
```

Open http://localhost:5173

### Cloudflare Worker Setup

1. **Create KV Namespace**
   
   ```bash
   npx wrangler kv:namespace create gistory
   ```
   
   Copy the ID to `wrangler.toml`

2. **Deploy Worker**
   
   ```bash
   npx wrangler deploy
   ```

3. **Configure Secrets**
   
   ```bash
   # Set your worker URL as secret
   wrangler secret put WORKER_URL
   # Enter: https://gistory-sync.your-subdomain.workers.dev
   ```

### Frontend Deploy

```bash
npm run build
# Deploy dist/ folder to your hosting provider
```

## Usage

### Starting Sync

1. Go to Settings (⚙️)
2. Enable Sync
3. Enter a memorable passphrase (write it down!)
4. Click "Generate Pairing" to get QR code
5. Scan on other devices

### Pairing Mobile

1. Open app on new device  
2. Go to Settings
3. Choose "Join Sync Chain"
4. Scan QR code or enter code manually
5. Enter SAME passphrase

### Sync Behavior

- **Pulls** automatically fetch changes from paired devices
- **Pushes** send your full state to others
- Uses `autoPull` option to prevent race conditions

## Architecture

### Client (React)

- `src/sync/agent.ts` - Encryption + sync logic
- `src/App.tsx` - Main app with merge handling

### Worker (Cloudflare Workers)

```
functions/sync/
├── push.ts    # Accept encrypted blobs
├── pull.ts   # Return filtered blobs  
├── status.ts  # Chain health check
└── handshake.ts  # Device registration
```

### Data Model

```typescript
interface Thread {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number  // For merge conflict resolution
}

interface Project {
  id: string
  name: string
  threadIds: string[]
  createdAt: number
  updatedAt: number
}
```

## Technical Details

### Encryption

- Derives key from passphrase + device ID using PBKDF2
- Encrypts payloads with AES-GCM
- Each push includes `senderDeviceId` for merge tie-breaking

### Sync Protocol

1. Device A pushes full state (encrypted blob)
2. Server stores + increments sequence  
3. Device B pulls (gets A's blob)
4. Decrypts and merges with timestamp + deviceID rules

### Conflict Resolution

```typescript
// Latest timestamp wins
if (new.updatedAt > old.updatedAt) return new
// Tie-breaker: lexicographically larger deviceId wins
if (new.deviceId > old.deviceId) return new  
return old
```

## Troubleshooting

### "KV not configured"

Make sure KV namespace is created and ID in wrangler.toml:
```toml
[[kv_namespaces]]
binding = "GISTRY_KV"
id = "your-kv-id-here"
```

### Sync Not Working

1. Check worker logs: `wrangler tail`
2. Verify passphrase is identical across devices
3. Try disable/re-enable sync

### Lost Passphrase

There's no recovery - write it down! The encryption key is derived from it.

## License

MIT
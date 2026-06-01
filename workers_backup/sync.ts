// 📋 CF Worker - Blind Sync Storage
// Gistory Sync Chain - Worker Side
// ===============================

import { KV } from '@cloudflare/workers-types'

// Types match spec.ts
interface Env {
  SYNC_KV: KV.Namespace
  SYNC_BUCKET: R2Bucket
}

interface SyncBlob {
  key: string
  chain: string
  seq: number
  nonce: string
  data: string
  hash: string
  timestamp: number
}

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    
    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...HEADERS,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }
    
    try {
      // ═══════════════════════════════════════
      // 1. HANDHAKE - Device registration
      // ═══════════════════════════════════════
      if (path === '/sync/handshake' && method === 'POST') {
        const body = await request.json()
        
        // Store device info (blind - we can't read it anyway)
        const deviceKey = `device:${body.deviceId}`
        await env.SYNC_KV.put(deviceKey, JSON.stringify({
          ...body,
          lastSeen: Date.now(),
        }))
        
        // Get or create chain
        let chainKey = `chain:${body.chainId}`
        let chain = await env.SYNC_KV.get(chainKey)
        
        if (!chain) {
          // Create new chain
          await env.SYNC_KV.put(chainKey, JSON.stringify({
            id: body.chainId,
            devices: [body.deviceId],
            createdAt: Date.now(),
            version: 1,
          }))
        } else {
          // Add device to existing chain
          const c = JSON.parse(chain)
          if (!c.devices.includes(body.deviceId)) {
            c.devices.push(body.deviceId)
            c.version++
            await env.SYNC_KV.put(chainKey, JSON.stringify(c))
          }
        }
        
        // Return chain state
        return new Response(JSON.stringify({
          success: true,
          chainId: body.chainId,
        }), { headers: HEADERS })
      }
      
      // ═══════════════════════════════════════
      // 2. PUSH - Store encrypted blob
      // ═══════════════════════════════════════
      if (path === '/sync/push' && method === 'POST') {
        const blob: SyncBlob = await request.json()
        
        // Store encrypted blob in R2 (cheaper than KV for blobs)
        const blobKey = `blob:${blob.chain}:${blob.seq}:${blob.key}`
        await env.SYNC_BUCKET.put(blobKey, blob.data, {
          httpMetadata: { contentType: 'application/octet-stream' },
          customMetadata: {
            chain: blob.chain,
            key: blob.key,
            seq: String(blob.seq),
            hash: blob.hash,
          },
        })
        
        // Update sequence tracker
        const seqKey = `seq:${blob.chain}`
        const currentSeq = await env.SYNC_KV.get(seqKey) || '0'
        if (blob.seq > Number(currentSeq)) {
          await env.SYNC_KV.put(seqKey, String(blob.seq))
        }
        
        return new Response(JSON.stringify({ success: true }), { headers: HEADERS })
      }
      
      // ═══════════════════════════════════════
      // 3. PULL - Fetch changes
      // ═══════════════════════════════════════
      if (path === '/sync/pull' && method === 'GET') {
        const chainId = url.searchParams.get('chain')
        const sinceSeq = Number(url.searchParams.get('since') || '0')
        
        if (!chainId) {
          return new Response(JSON.stringify({ error: 'chain required' }), 
            { status: 400, headers: HEADERS })
        }
        
        // List all blobs for chain after sequence
        const prefix = `blob:${chainId}:`
        const blobs: SyncBlob[] = []
        
        // Note: R2 listObjects is paginated - implement cursor
        const objects = await env.SYNC_BUCKET.list({
          prefix,
          limit: 100,
        })
        
        for (const obj of objects.objects) {
          const meta = obj.customMetadata as Record<string, string>
          if (Number(meta.seq) > sinceSeq) {
            // Fetch the actual data
            const blob = await env.SYNC_BUCKET.get(obj.key)
            if (blob) {
              blobs.push({
                key: meta.key || '',
                chain: chainId,
                seq: Number(meta.seq) || 0,
                nonce: '',
                data: await blob.text(),
                hash: meta.hash || '',
                timestamp: obj.uploaded?.getTime() || Date.now(),
              })
            }
          }
        }
        
        // Sort by sequence
        blobs.sort((a, b) => a.seq - b.seq)
        
        return new Response(JSON.stringify(blobs), { headers: HEADERS })
      }
      
      // ═══════════════════════════════════════
      // 4. LIST CHAINS
      // ═══════════════════════════════════════
      if (path === '/sync/chains' && method === 'GET') {
        const deviceId = url.searchParams.get('device')
        
        if (!deviceId) {
          return new Response(JSON.stringify({ error: 'device required' }),
            { status: 400, headers: HEADERS })
        }
        
        // Find chains containing this device
        // This requires scanning - optimize with inverted index
        const chains: string[] = []
        // ... lookup from device → chains index
        
        return new Response(JSON.stringify({ chains }), { headers: HEADERS })
      }
      
      // 404
      return new Response(JSON.stringify({ error: 'Not Found' }),
        { status: 404, headers: HEADERS })
        
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }),
        { status: 500, headers: HEADERS })
    }
  }
}

/*
  CF WORKER CONFIG (wrangler.toml)
  ============================

name = "gistory-sync"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "SYNC_KV"
id = "your-kv-namespace-id"

[[buckets]]
binding = "SYNC_BUCKET"
name = "gistory-sync-blobs"

[[unsafe.bindings]]
name = "SYNC_KV"
namespace_id = "your-kv-namespace-id"

[[unsafe.bindings]]
name = "SYNC_BUCKET"
bucket_name = "gistory-sync-blobs"
*/

/*
  BILLING (Cloudflare Free Tier)
  ============================
  
  KV Storage:      1 GB storage / month        FREE
  R2 Storage:     1 GB storage / month        FREE  
  Bandwidth:      1 GB / month                FREE
  
  This costs $0/month for personal use!
*/
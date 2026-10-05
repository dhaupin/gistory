/**
 * Live multi-device convergence probe — `bun scripts/live-multidevice.mjs [baseUrl]`
 *
 * Complements scripts/live-sync.mjs (two devices, full guard coverage) by
 * testing what a user with many instances is actually about to do: several
 * devices joining ONE chain and converging. Four simulated devices — one
 * creates + claims, three join via the pairing token — then all push distinct
 * libraries and pull until settled. Every device must end with the identical
 * union of all four libraries, and the chain must report all four devices.
 * Throwaway `live-test-` chain, append-only, same as live-sync.
 */
const BASE = (process.argv[2] || 'https://gistory.creadev.org').replace(/\/+$/, '')

let passed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`) }
  else { failures.push(detail ? `${name} — ${detail}` : name); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`) }
}

function makeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  }
}
let activeStorage = makeStorage()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => activeStorage })

const { SyncAgent, newWriteSecret, pairingTokenFromChain } = await import('../src/sync/agent.ts')
const { mergePayload } = await import('../src/sync/merge.ts')

const thread = (id, name, ts) => ({
  id, name, projectIds: [], createdAt: ts, updatedAt: ts,
  metadata: { tags: [] },
})

const NAME = ['Laptop', 'Desktop', 'Phone', 'Tablet']
const agents = []
try {
  // 1. The creator makes the chain and installs its write secret (exactly the
  //    Settings → Create Chain path). The others join via the pairing token.
  const secret = newWriteSecret()
  activeStorage = makeStorage()
  const creator = new SyncAgent({
    baseUrl: BASE,
    passphrase: 'multi-device-pass',
    deviceName: NAME[0],
    chainId: `live-test-${Math.random().toString(36).slice(2, 12)}`,
    writeSecret: secret,
  })
  agents.push(creator)
  await creator.init()
  const status = await creator.handshake()
  const CHAIN = status.chainId
  check('creator created the chain', CHAIN.startsWith('live-test-'), CHAIN)
  // handshake that CREATES the chain installs the write secret, so a later
  // claim must already be secured (claim() === false). If this ever returns
  // true, chain creation silently stopped installing the secret.
  check('creating a chain installs the write secret (claim is a no-op)', !(await creator.claim()))
  const token = pairingTokenFromChain(CHAIN, secret)

  for (let i = 1; i < 4; i++) {
    activeStorage = makeStorage()
    const d = new SyncAgent({
      baseUrl: BASE,
      passphrase: 'multi-device-pass',
      deviceName: NAME[i],
      chainId: CHAIN,
      writeSecret: token.split('.')[1],
    })
    agents.push(d)
    await d.init()
    const st = await d.handshake(token)
    check(`${NAME[i]} joined via the pairing token`, st.chainId === CHAIN)
  }

  // 2. Each device pushes a distinct library (like 8 real instances first syncing).
  for (let i = 0; i < 4; i++) {
    await agents[i].push({
      threads: [thread(`lt-m${i}`, `From ${NAME[i]}`, 1000 + i)],
      messages: { [`lt-m${i}`]: [] },
      projects: [],
      deleted: { threads: {}, messages: {}, projects: {} },
    })
  }

  // 3. Every device pulls until it holds all four threads (3 rounds max — the
  //    same settle loop the UI uses for a short page).
  const expect = new Set(['lt-m0', 'lt-m1', 'lt-m2', 'lt-m3'])
  for (let i = 0; i < 4; i++) {
    let merged = {
      threads: [thread(`lt-m${i}`, `From ${NAME[i]}`, 1000 + i)],
      messages: {}, projects: [],
      deleted: { threads: {}, messages: {}, projects: {} },
    }
    for (let round = 0; round < 3; round++) {
      const pulled = await agents[i].pull()
      // Blobs are merged one at a time, exactly as live-sync does — each blob
      // carries its sender so the deviceId tie-break can apply.
      for (const blob of pulled.blobs) {
        merged = mergePayload(merged, blob, agents[i].getDeviceId())
      }
      if (expect.isSubsetOf(new Set(merged.threads.map(t => t.id)))) break
    }
    const ids = new Set(merged.threads.map(t => t.id))
    check(`${NAME[i]} converged on all 4 threads`, expect.isSubsetOf(ids), [...ids].join(','))
  }

  // 4. The chain reports all four devices.
  const final = await agents[0].status()
  check('chain status lists 4 devices', final?.devices?.length === 4, String(final?.devices?.length))

  console.log(`\n${failures.length === 0 ? '\x1b[32mALL PASS\x1b[0m' : '\x1b[31mFAILURES\x1b[0m'}: ${passed} ok, ${failures.length} failed`)
  process.exit(failures.length === 0 ? 0 : 1)
} catch (err) {
  console.error('PROBE CRASHED:', err?.message || err)
  process.exit(2)
}

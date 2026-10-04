#!/usr/bin/env node
// Zero-dependency maintenance for the Gistory D1 database.
//
// The relay is append-only by design, so three things grow forever without a
// periodic job: `rate_limits` buckets (one row per scope:subject ever seen),
// `blobs` (every push is a full-state snapshot), and test debris from
// `sync:live` (`live-test-*` chains have no delete endpoint to clean them up).
// This script is that periodic job. It runs:
//   • locally, against .wrangler state:      bun run db:maintain:local
//   • against the real database:             bun run db:maintain:remote
//                                            (needs wrangler.deploy.toml — the
//                                            weekly GitHub workflow sets that up)
//   • report only, no writes:                append --status
//   • self-check on an in-memory database:   bun run db:maintain:check
//
// What it does, and why each rule is safe:
//
//   1. rate_limits — every bucket whose window closed longer ago than the
//      sweep horizon is deleted. This is the same rule the relay's own sampled
//      sweep uses (guards.ts PRUNE_AFTER_MS + PRUNE_SAMPLE); the job just runs
//      the full sweep on a schedule instead of waiting for an isolate to be
//      the Nth admitted request.
//
//   2. blobs — per chain, only the most recent KEEP_BLOBS snapshots are kept.
//      Safe because every blob is a FULL state snapshot (including tombstones),
//      so any surviving snapshot is a complete restore point, and the client
//      jumps its watermark to `serverSeq` whenever a pull page comes back
//      empty (src/sync/agent.ts) — old sequence numbers disappearing costs a
//      device nothing. The newest blob per chain is ALWAYS kept even if the
//      chain is being abandoned: deleting it would leave a chain that cannot
//      be synced to or read from again.
//
//   3. live-test-* chains — created by scripts/live-sync.mjs on every run
//      (plus the `flood-*` device rows its throttle check registers). They
//      exist only to test the relay and are safe to remove whole: chains,
//      devices, blobs, and their rate-limit buckets together.
//
//   4. devices with last_seen older than --days (default 90) are dropped. A
//      device re-registers itself with one handshake, and nothing server-side
//      needs the row to exist: the pull filter compares device ids from the
//      request, not the table. Status lists at most 50 devices per chain, so
//      pruning ancient rows keeps that list honest too.
//
// What it deliberately does NOT do:
//   • never deletes a real (non live-test) chain. The server cannot tell
//     "on holiday since March" from "abandoned", and guessing wrong destroys
//     the only server-side copy of someone's synced library.
//   • never touches the _migrations ledger, chains.push_hash, or devices on
//     live-test chains within their grace window (see below).
//
// live-test chains are only removed once BOTH of these hold:
//   • the chain's newest blob is older than LIVE_TEST_GRACE_DAYS (7), so a
//     test that just ran is never swept out from under a concurrent run; and
//   • the run that owns them says so — LIVE_TEST_MAX_AGE_DAYS (30) bounds how
//     long any debris can survive even if this job stops being scheduled.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const KEEP_BLOBS = 5
const STALE_DEVICE_DAYS = 90
const PRUNE_HORIZON_MS = 10 * 60_000 // mirrors guards.ts PRUNE_AFTER_MS
const LIVE_TEST_PREFIX = 'live-test-'
const LIVE_TEST_GRACE_DAYS = 7
const LIVE_TEST_MAX_AGE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

function parseArgs(argv) {
  const remote = argv.includes('--remote')
  const local = argv.includes('--local')
  const check = argv.includes('--check')
  const statusOnly = argv.includes('--status')
  if (!check && remote === local) {
    console.error('  Pass exactly one of --local or --remote (or --check).')
    process.exit(2)
  }
  const daysIdx = argv.indexOf('--days')
  const keepIdx = argv.indexOf('--keep')
  return {
    target: remote ? 'remote' : 'local',
    statusOnly,
    check,
    staleDeviceDays: daysIdx >= 0 ? Number(argv[daysIdx + 1]) || STALE_DEVICE_DAYS : STALE_DEVICE_DAYS,
    keepBlobs: keepIdx >= 0 ? Number(argv[keepIdx + 1]) || KEEP_BLOBS : KEEP_BLOBS,
  }
}

/**
 * Run one SQL batch against the chosen target. Statements are separated by
 * ";\n-- statement --\n" so wrangler executes each separately and its JSON
 * output maps 1:1 to the statements — that is what makes D1's RETURNING
 * counts parseable below. Uses --command (not --file) so nothing is written
 * to disk, even in a temp directory.
 */
function execSql(target, statements, { file = false } = {}) {
  const args = ['--yes', 'wrangler', 'd1', 'execute', 'GISTRY_DB']
  if (target === 'remote') args.push('--remote', '--config', 'wrangler.deploy.toml')
  else args.push('--local')
  const batch = statements.join(';\n-- statement --\n')
  args.push(file ? `--file=${batch}` : `--command=${batch}`, '--json')
  const out = execFileSync('npx', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  // Wrangler prints its own progress lines around the JSON payload.
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  if (start < 0 || end < 0) throw new Error(`Unexpected wrangler output: ${out.slice(0, 400)}`)
  return JSON.parse(out.slice(start, end + 1))
}
// All deletes are guarded by this shape-check, which runs before any write in
// a real (non-check) target. If the database does not have exactly the relay's
// tables, this is not the database this script was written for — fail closed
// rather than DELETE against a guess.
function assertRelaySchema(tables) {
  const names = tables.map((t) => t.name || t.tablename || Object.values(t)[0]).sort()
  const required = ['_migrations', 'blobs', 'chains', 'devices', 'rate_limits']
  for (const table of required) {
    if (!names.includes(table)) {
      throw new Error(`Table "${table}" is missing — not a Gistory relay database (found: ${names.join(', ')})`)
    }
  }
}

// --- Check mode: exercise the SQL against a real in-memory SQLite ----------

/** Same runtime detection as scripts/db-migrate.mjs: node:sqlite, else bun:sqlite. */
async function openSqlite() {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    return new DatabaseSync(':memory:')
  } catch {
    const { Database } = await import('bun:sqlite')
    return new Database(':memory:')
  }
}

async function runCheck() {
  const db = await openSqlite()

  const migrationsDir = join(ROOT, 'migrations')
  const { readdirSync, readFileSync } = await import('node:fs')
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrationsDir, f), 'utf8'))
  }

  // A live-test chain that is old enough to sweep, with three blobs.
  const now = Date.now()
  db.prepare(
    `INSERT INTO chains (id, created_at, version) VALUES (?, ?, 1)`,
  ).run(`${LIVE_TEST_PREFIX}ancient`, now - 40 * DAY_MS)
  for (let i = 1; i <= 3; i++) {
    db.prepare(
      `INSERT INTO blobs (chain_id, seq, device_id, data, created_at) VALUES (?, ?, 'dev', 'x', ?)`,
    ).run(`${LIVE_TEST_PREFIX}ancient`, i, now - 40 * DAY_MS)
  }
  db.prepare(`INSERT INTO devices (id, chain_id, name, last_seen) VALUES ('ltdev', ?, 'LT', ?)`).run(
    `${LIVE_TEST_PREFIX}ancient`,
    now - 40 * DAY_MS,
  )

  // A live-test chain inside the grace window (a test that just ran).
  db.prepare(`INSERT INTO chains (id, created_at, version) VALUES (?, ?, 1)`).run(`${LIVE_TEST_PREFIX}fresh`, now)

  // A blobless live-test chain (handshake-only debris). MAX(created_at) over
  // its blobs is NULL — it must still be removed, judged by its own age.
  db.prepare(`INSERT INTO chains (id, created_at, version) VALUES (?, ?, 1)`).run(`${LIVE_TEST_PREFIX}bare`, now - 40 * DAY_MS)
  db.prepare(
    `INSERT INTO blobs (chain_id, seq, device_id, data, created_at) VALUES (?, 1, 'dev', 'x', ?)`,
  ).run(`${LIVE_TEST_PREFIX}fresh`, now)

  // A real chain with 8 old blobs; retention keeps the newest KEEP_BLOBS.
  db.prepare(`INSERT INTO chains (id, created_at, version) VALUES ('real-chain-01', ?, 1)`).run(now - 100 * DAY_MS)
  for (let i = 1; i <= 8; i++) {
    db.prepare(
      `INSERT INTO blobs (chain_id, seq, device_id, data, created_at) VALUES ('real-chain-01', ?, 'dev', 'x', ?)`,
    ).run(i, now - 100 * DAY_MS + i)
  }
  // Its newest blob must survive retention even though it is old.
  db.prepare(
    `INSERT INTO blobs (chain_id, seq, device_id, data, created_at) VALUES ('real-chain-01', 9, 'dev', 'x', ?)`,
  ).run(now - DAY_MS)
  // An ancient device row on a real chain.
  db.prepare(
    `INSERT INTO devices (id, chain_id, name, last_seen) VALUES ('ancient-dev', 'real-chain-01', 'Old', ?)`,
  ).run(now - STALE_DEVICE_DAYS * 2 * DAY_MS)

  // Rate-limit rows: one long-expired, one current.
  db.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES ('push:stale', 1, 1)`).run()
  db.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES ('push:live', ?, 1)`).run(now)

  const counts = () => {
    const q = (sql) => db.prepare(sql).get().n
    return {
      chains: q('SELECT COUNT(*) AS n FROM chains'),
      blobs: q('SELECT COUNT(*) AS n FROM blobs'),
      devices: q('SELECT COUNT(*) AS n FROM devices'),
      rate_limits: q('SELECT COUNT(*) AS n FROM rate_limits'),
    }
  }
  const before = counts()
  const report = maintenanceSql({
    now,
    keepBlobs: KEEP_BLOBS,
    staleDeviceDays: STALE_DEVICE_DAYS,
  })
  for (const stmt of report.statements) db.exec(stmt)
  const after = counts()

  let failed = 0
  const expect = (name, cond, detail) => {
    if (cond) console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    else {
      failed++
      console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
    }
  }

  expect(
    'the fixture starts with debris to clean (4 chains, 13 blobs)',
    before.chains === 4 && before.blobs === 13,
    JSON.stringify(before),
  )
  expect('the blobless live-test chain is removed too (NULL MAX trap)',
    db.prepare(`SELECT COUNT(*) AS n FROM chains WHERE id = '${LIVE_TEST_PREFIX}bare'`).get().n === 0)
  expect('the ancient live-test chain is removed', after.chains === 2, `${before.chains} -> ${after.chains}`)
  expect('the live-test chain inside the grace window survives',
    db.prepare(`SELECT COUNT(*) AS n FROM chains WHERE id = '${LIVE_TEST_PREFIX}fresh'`).get().n === 1)
  expect('blob retention keeps exactly KEEP_BLOBS of the real chain',
    db.prepare(`SELECT COUNT(*) AS n FROM blobs WHERE chain_id = 'real-chain-01'`).get().n === KEEP_BLOBS)
  expect(
    'retention kept the right snapshots (seq 5..9 of real-chain-01)',
    db.prepare(`SELECT COUNT(*) AS n FROM blobs WHERE chain_id = 'real-chain-01' AND seq BETWEEN 5 AND 9`).get().n === KEEP_BLOBS,
  )
  expect(
    'retention never touches another chain\'s newest blob (the regression)',
    db.prepare(`SELECT COUNT(*) AS n FROM blobs WHERE chain_id = '${LIVE_TEST_PREFIX}fresh'`).get().n === 1,
  )
  expect('the ancient live-test chain\'s blobs and device are gone with it',
    db.prepare(`SELECT COUNT(*) AS n FROM blobs WHERE chain_id = '${LIVE_TEST_PREFIX}ancient'`).get().n === 0 &&
      db.prepare(`SELECT COUNT(*) AS n FROM devices WHERE id = 'ltdev'`).get().n === 0)
  expect('stale rate-limit buckets are swept', after.rate_limits === 1, `${before.rate_limits} -> ${after.rate_limits}`)
  expect('current rate-limit buckets survive', db.prepare(`SELECT COUNT(*) AS n FROM rate_limits WHERE key = 'push:live'`).get().n === 1)
  expect('ancient device rows on real chains are dropped',
    db.prepare(`SELECT COUNT(*) AS n FROM devices WHERE id = 'ancient-dev'`).get().n === 0)

  console.log('')
  if (failed) {
    console.log(`\x1b[31m${failed} maintenance check(s) failed.\x1b[0m`)
    process.exit(1)
  }
  console.log('\x1b[32mMaintenance SQL verified against the real schema on in-memory SQLite.\x1b[0m')
}

// --- The SQL, as data, so check mode and real runs cannot drift -------------

export function maintenanceSql({ now, keepBlobs, staleDeviceDays }) {
  const statements = []
  const report = []

  // Each rule is built from ONE WHERE fragment used for both the DELETE and
  // its dry-run COUNT — so `--status` reports exactly what `--apply` would
  // delete, and the two can never drift apart.
  const pushRule = (table, where, label) => {
    statements.push(`DELETE FROM ${table} WHERE ${where}`)
    report.push({ label, sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}` })
  }

  // 1. rate_limits: windows closed longer ago than the sweep horizon.
  pushRule(
    'rate_limits',
    `window_start < ${now - PRUNE_HORIZON_MS}`,
    'expired rate-limit buckets',
  )

  // 2. blobs: keep the newest `keepBlobs` per chain.
  //    The newest blob is covered by the same rule because the ranking is
  //    oldest-first — the newest `keepBlobs` rows are always inside the keep
  //    set, so "always keep the newest snapshot" needs no special case.
  //    The outer DELETE must match (chain_id, seq) as a ROW: seq is only
  //    unique per chain, so `WHERE seq IN (...)` would delete one chain's
  //    victims from EVERY chain — including the newest blob of a quiet chain.
  const retention = `(chain_id, seq) IN (
  SELECT chain_id, seq FROM (
    SELECT chain_id, seq, ROW_NUMBER() OVER (
      PARTITION BY chain_id ORDER BY seq DESC
    ) AS rn FROM blobs
  ) WHERE rn > ${keepBlobs}
)`
  pushRule('blobs', retention, `blobs beyond the newest ${keepBlobs} per chain`)

  // 3. live-test chains: past the per-run grace AND the absolute age bound.
  //    Chains first (their children would otherwise dangle), then children.
  // COALESCE matters: a chain with NO blobs (handshake-only debris — a
  // chain-creation flood makes nothing else) has MAX(created_at) = NULL, and
  // NULL < cutoff is NULL, so the row would survive forever. Fall back to the
  // chain's own creation time.
  const liveTestChainsGone = `id LIKE '${LIVE_TEST_PREFIX}%'
  AND COALESCE((SELECT MAX(created_at) FROM blobs WHERE blobs.chain_id = chains.id), chains.created_at) < ${now - LIVE_TEST_GRACE_DAYS * DAY_MS}
  AND created_at < ${now - LIVE_TEST_MAX_AGE_DAYS * DAY_MS}`
  statements.push(`DELETE FROM chains WHERE ${liveTestChainsGone}`)
  report.push({ label: 'live-test chains past grace + age', sql: `SELECT COUNT(*) AS n FROM chains WHERE ${liveTestChainsGone}` })
  pushRule(
    'devices',
    `chain_id LIKE '${LIVE_TEST_PREFIX}%'
  AND chain_id NOT IN (SELECT id FROM chains)`,
    'devices of removed live-test chains',
  )
  pushRule(
    'blobs',
    `chain_id LIKE '${LIVE_TEST_PREFIX}%'
  AND chain_id NOT IN (SELECT id FROM chains)`,
    'blobs of removed live-test chains',
  )

  // 4. Stale device rows on real chains (live-test devices went with #3).
  pushRule(
    'devices',
    `last_seen < ${now - staleDeviceDays * DAY_MS}
  AND chain_id NOT LIKE '${LIVE_TEST_PREFIX}%'`,
    `devices unseen for ${staleDeviceDays} days`,
  )

  // 5. Report — what the Actions log shows every week.
  statements.push(`SELECT
  (SELECT COUNT(*) FROM chains) AS chains,
  (SELECT COUNT(*) FROM blobs) AS blobs,
  (SELECT COUNT(*) FROM devices) AS devices,
  (SELECT COUNT(*) FROM rate_limits) AS rate_limits`)

  return { statements, report }
}

// --- Main -------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.check) return runCheck()

  console.log(`\n  Gistory maintenance -> ${opts.target === 'remote' ? 'remote D1' : 'local D1'}`)

  const schema = execSql(opts.target, [
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ])
  assertRelaySchema(schema[0]?.results || [])

  const beforeRows = execSql(opts.target, [
    `SELECT
  (SELECT COUNT(*) FROM chains) AS chains,
  (SELECT COUNT(*) FROM blobs) AS blobs,
  (SELECT COUNT(*) FROM devices) AS devices,
  (SELECT COUNT(*) FROM rate_limits) AS rate_limits`,
  ])
  const before = beforeRows[0]?.results?.[0] || {}
  console.log(`  before: chains=${before.chains} blobs=${before.blobs} devices=${before.devices} rate_limits=${before.rate_limits}`)

  const { statements, report } = maintenanceSql({
    now: Date.now(),
    keepBlobs: opts.keepBlobs,
    staleDeviceDays: opts.staleDeviceDays,
  })
  const writes = statements.slice(0, -1) // the last statement is the report query

  if (opts.statusOnly) {
    console.log(`  status-only: ${writes.length} maintenance statement(s) NOT executed.`)
    // Dry-run report: per-rule counts, computed from the SAME WHERE fragments
    // the apply path would run (see pushRule), so this cannot drift from it.
    console.log('  would prune:')
    for (const { label, sql } of report) {
      const rows = execSql(opts.target, [sql])
      console.log(`    ${String(rows[0]?.results?.[0]?.n ?? 0).padStart(6)}  ${label}`)
    }
    console.log('')
    return
  }

  // One statement per exec call so a mid-run failure leaves earlier work done
  // and later work unstarted — every statement here is idempotent, so the
  // weekly run simply finishes the job.
  for (const stmt of writes) {
    execSql(opts.target, [stmt])
  }

  const afterRows = execSql(opts.target, [statements[statements.length - 1]])
  const after = afterRows[0]?.results?.[0] || {}
  console.log(`  after:  chains=${after.chains} blobs=${after.blobs} devices=${after.devices} rate_limits=${after.rate_limits}`)
  const delta = (k) => Number(after[k] ?? 0) - Number(before[k] ?? 0)
  console.log(`  pruned: ${-delta('chains')} chain(s), ${-delta('blobs')} blob(s), ${-delta('devices')} device(s), ${-delta('rate_limits')} limit bucket(s)`)
  console.log('')
}

// Only run main() when executed directly — --check imports this module to
// exercise the exact SQL it will run in production.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('db-maintain.mjs')) {
  main().catch((err) => {
    console.error(`\n  Maintenance failed: ${err?.stack || err}\n`)
    process.exit(1)
  })
}

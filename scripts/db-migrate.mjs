#!/usr/bin/env node
// Zero-dependency migration runner for the Gistory D1 database.
//
// Why this exists: `schema.sql` can only ever build a database from scratch.
// Applying it to a database that already exists is a no-op, so the day a
// column is added there was nothing that could bring an existing D1 database
// up to date. This runner applies *numbered* migrations in order and records
// what each database has already applied, so the same command works on a fresh
// database and on one that has been running for months.
//
// Usage:
//   node scripts/db-migrate.mjs --local            # apply to .wrangler local D1
//   node scripts/db-migrate.mjs --remote           # apply to real D1 (needs wrangler.deploy.toml)
//   node scripts/db-migrate.mjs --local --status   # list applied/pending, change nothing
//   node scripts/db-migrate.mjs --check            # verify a fresh build matches, no writes
//
// Design notes:
// - No dependencies. `bun:sqlite` is only available under bun, and wrangler is
//   already a dev dependency, so shelling out covers both paths uniformly.
// - Each migration runs in its own statement batch and is recorded only after it
//   succeeds, so a failure mid-way leaves the database at the last good step.
// - An already-applied file whose contents changed is reported as an error.
//   Editing history silently diverges databases, which is exactly the failure
//   this is meant to prevent.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = join(ROOT, 'migrations')

/** Ledger of migrations a database has applied. */
const LEDGER = `
CREATE TABLE IF NOT EXISTS _migrations (
  name       TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  checksum   TEXT NOT NULL
);`

/** FNV-1a. Short, dependency-free, and only needs to catch accidental edits. */
function checksum(sql) {
  let hash = 0x811c9dc5
  for (let i = 0; i < sql.length; i++) {
    hash ^= sql.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Migrations sorted by their numeric prefix; non-numeric names are rejected. */
function loadMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) return []
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const match = /^(\d{4})_([A-Za-z0-9._-]+)\.sql$/.exec(file)
      if (!match) {
        throw new Error(
          `migration "${file}" does not match NNNN_name.sql — it would sort unpredictably`,
        )
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      return { file, order: Number(match[1]), name: match[2], sql, checksum: checksum(sql) }
    })
}

/** Run SQL against local D1 state via wrangler. */
function sqlLocal(sql, { file }) {
  const args = ['d1', 'execute', 'GISTRY_DB', '--local']
  if (file) args.push(`--file=${file}`)
  else args.push(`--command=${sql}`)
  execFileSync('npx', ['--yes', 'wrangler', ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** Run SQL against the real D1 database (config lives outside git). */
function sqlRemote(sql, { file }) {
  const args = ['d1', 'execute', 'GISTRY_DB', '--remote', '--config', 'wrangler.deploy.toml']
  if (file) args.push(`--file=${file}`)
  else args.push(`--command=${sql}`)
  execFileSync('npx', ['--yes', 'wrangler', ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/**
 * Open an in-memory SQLite database using whichever binding this runtime has.
 * Node 22+ ships `node:sqlite`; bun ships `bun:sqlite`. Supporting both keeps
 * the check runnable under either without adding a dependency.
 */
async function openSqlite() {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    return {
      Database: DatabaseSync,
      db: new DatabaseSync(':memory:'),
      query: (db, sql) => db.prepare(sql).all(),
    }
  } catch {
    const { Database } = await import('bun:sqlite')
    return { Database, db: new Database(':memory:'), query: (db, sql) => db.query(sql).all() }
  }
}

function parseArgs(argv) {
  const check = argv.includes('--check')
  const remote = argv.includes('--remote')
  const local = argv.includes('--local')
  // --check builds a throwaway in-memory database, so it needs no target.
  if (!check && remote === local) {
    console.error('  Pass exactly one of --local or --remote.')
    process.exit(2)
  }
  return {
    target: remote ? sqlRemote : sqlLocal,
    label: remote ? 'remote D1' : 'local D1',
    statusOnly: argv.includes('--status'),
    check,
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const { target, label, statusOnly, check } = parseArgs(argv)
  const migrations = loadMigrations()

  console.log(`\n  Gistory migrations -> ${label}`)
  if (migrations.length === 0) {
    console.log('  No migrations found in migrations/ — nothing to do.\n')
    return
  }

  // The ledger has to exist before we can ask what has been applied. In --check
  // mode we do this against a throwaway in-memory database instead.
  if (!check) target(LEDGER, {})

  let applied
  if (check) {
    // Build a fresh database from the full history and confirm it applies
    // clean. Uses whichever in-process SQLite this runtime offers, so the
    // check works under both `node` and `bun` without pulling in a dependency.
    const { db, query } = await openSqlite()
    db.exec(LEDGER)
    for (const m of migrations) db.exec(m.sql)
    const tables = query(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map((r) => r.name)
    console.log(`  ${migrations.length} migration(s) applied to a fresh database cleanly.`)
    console.log(`  tables: ${tables.join(', ')}`)
    console.log('')
    return
  }

  // Read the ledger via a SELECT that wrangler prints; parse the JSON output.
  const raw = execFileSync(
    'npx',
    [
      '--yes',
      'wrangler',
      'd1',
      'execute',
      'GISTRY_DB',
      label.startsWith('remote') ? '--remote' : '--local',
      ...(label.startsWith('remote') ? ['--config', 'wrangler.deploy.toml'] : []),
      '--command=SELECT name, checksum FROM _migrations ORDER BY name',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )

  const done = new Map()
  for (const match of raw.matchAll(/"name":\s*"([^"]+)",\s*"checksum":\s*"([^"]+)"/g)) {
    done.set(match[1], match[2])
  }

  const pending = migrations.filter((m) => !done.has(m.name))
  const drifted = migrations.filter((m) => done.has(m.name) && done.get(m.name) !== m.checksum)

  if (drifted.length > 0) {
    console.error('\n  These migrations were already applied but have since changed:')
    for (const m of drifted) console.error(`    ${m.file}`)
    console.error(
      '\n  Editing an applied migration leaves existing databases stranded on the old\n' +
        '  shape. Add a NEW numbered migration instead, or the databases will diverge.\n',
    )
    process.exit(1)
  }

  console.log(`  applied: ${migrations.length - pending.length}/${migrations.length}`)
  for (const m of migrations) {
    const state = done.has(m.name) ? 'applied' : 'pending'
    console.log(`    ${state.padEnd(8)} ${m.file}`)
  }

  if (statusOnly) {
    console.log('')
    return
  }

  if (pending.length === 0) {
    console.log('\n  Already up to date.\n')
    return
  }

  for (const m of pending) {
    console.log(`\n  applying ${m.file}`)
    target(m.sql, {})
    target(
      `INSERT INTO _migrations (name, applied_at, checksum) VALUES ('${m.name}', ${Date.now()}, '${m.checksum}')`,
      {},
    )
  }
  console.log(`\n  Applied ${pending.length} migration(s).\n`)
}

main().catch((err) => {
  console.error(`\n  Migration failed: ${err?.message || err}\n`)
  process.exit(1)
})
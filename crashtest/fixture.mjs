// In-memory D1 fixture for the crashtest run root (crashtest.config.js).
//
// Gistory's relay handlers speak real SQL — INSERT … SELECT MAX(seq)+1
// RETURNING seq, ON CONFLICT upserts, CASE expressions, COALESCE — which sits
// outside the SQL subset crashtest's own FakeD1 models (its stated v0.1
// surface: flat SELECT/INSERT/UPDATE/DELETE). The run root therefore brings
// its own engine: `node:sqlite` (bundled with Node ≥ 22.5; unflagged from
// Node 24 — the CI step pins node-version 24 for exactly this reason).
//
// The fixture is the same pattern the smoke test's bun:sqlite harness uses:
// apply every migration in migrations/ to a fresh :memory: database, expose
// the D1-like prepare().bind().first()/all()/run() surface the handlers
// expect, and keep a few read oracles behind named helpers so the pack's
// moduleCtx vocabulary can assert on materialized state.
//
// One fixture instance backs the WHOLE run: attacks must see each other's
// materialized rows (the takeover attack asserts the secret hash survived a
// joining handshake), so there is deliberately no per-request reset.

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

export function buildFixtureDb() {
  const here = new URL('.', import.meta.url)
  const migrationsDir = new URL('../migrations/', here)
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'))
  }

  // --- D1-shaped surface -----------------------------------------------------
  //
  // Positional binding only — every handler statement uses bare `?`. Values
  // are JS primitives (numbers, strings); node:sqlite stores what it gets.
  const d1 = {
    prepare(query) {
      let bound = []
      const stmt = {
        bind(...values) {
          bound = values
          return stmt
        },
        async first() {
          return sqlite.prepare(query).get(...bound) ?? null
        },
        async all() {
          return { results: sqlite.prepare(query).all(...bound) ?? [] }
        },
        async run() {
          sqlite.prepare(query).run(...bound)
          return { success: true }
        },
      }
      return stmt
    },
  }

  // --- Oracles for the pack's moduleCtx vocabulary ----------------------------

  const one = (sql, ...params) => sqlite.prepare(sql).get(...params) ?? null
  const digest = (secret) =>
    createHash('sha256').update(secret).digest('hex')

  return {
    d1,
    /** The stored write-secret hash for a chain (null = unsecured/unknown). */
    hashOf: (chainId) =>
      one('SELECT push_hash FROM chains WHERE id = ?', chainId)?.push_hash ?? null,
    /** True when the stored digest is that of THIS secret (the pack's takeover oracle). */
    hashMatches: (chainId, writeSecret) =>
      one('SELECT push_hash FROM chains WHERE id = ?', chainId)?.push_hash === digest(writeSecret),
    chainCount: () =>
      Number(one('SELECT COUNT(*) AS n FROM chains')?.n ?? 0),
    deviceRows: (chainId) =>
      sqlite.prepare('SELECT id, name FROM devices WHERE chain_id = ?').all(chainId) ?? [],
    blobsByDevice: (chainId, deviceId) =>
      Number(
        one('SELECT COUNT(*) AS n FROM blobs WHERE chain_id = ? AND device_id = ?', chainId, deviceId)?.n ?? 0,
      ),
  }
}

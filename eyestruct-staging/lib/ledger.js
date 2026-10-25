// The .eyes/ledger.json read/write memory. Append-only rows:
//   { id, ts, agent, commit, artifact, type, note, ratified? }
// Mirrors crashtest's crashledger semantics: rows explain themselves, the
// committed baseline is canon, CI fails on unexplained drift.
//
// Corrupt ledger -> LEDGER_CORRUPT (exit 2): the reader refuses loudly, it
// never guesses past a bad row (the vant inspect receipt).

'use strict'

const fs = require('fs')
const path = require('path')
const { fail } = require('./reasons')

function ledgerPath(cwd, flags) {
  return path.resolve(cwd, flags.ledger || '.eyes/ledger.json')
}

function load(file) {
  let raw = null
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  let rows
  try {
    rows = JSON.parse(raw)
  } catch {
    fail('LEDGER_CORRUPT', file)
  }
  if (!Array.isArray(rows)) fail('LEDGER_CORRUPT', file + ' (not an array)')
  for (const row of rows) {
    if (!row || typeof row !== 'object') fail('LEDGER_CORRUPT', file + ' (bad row)')
    const need = ['id', 'ts', 'agent', 'commit', 'artifact', 'type', 'note']
    for (const k of need) {
      if (!(k in row)) fail('LEDGER_CORRUPT', file + ` (row ${row.id || '?'} missing ${k})`)
    }
  }
  const seen = new Set()
  for (const row of rows) {
    if (seen.has(row.id)) fail('LEDGER_CORRUPT', file + ` (duplicate row id ${row.id})`)
    seen.add(row.id)
  }
  return rows
}

function newId(rows) {
  let n = rows.length + 1
  let id = `row-${String(n).padStart(4, '0')}`
  const taken = new Set(rows.map((r) => r.id))
  while (taken.has(id)) id = `row-${String(++n).padStart(4, '0')}`
  return id
}

const ROW_STRINGS = ['id', 'agent', 'commit', 'artifact', 'type', 'note']

function assertClean(row) {
  // The text-leg guard, applied at the ONLY ledger write surface: control
  // characters in any row string are structurally impossible for a real
  // agent and poison every reader downstream (the gistory WAF rule).
  for (const key of ROW_STRINGS) {
    if (!(key in row)) continue
    const v = row[key]
    if (typeof v === 'string' && /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v)) {
      fail('UNSAFE_TEXT', `row field "${key}" carries a control character`)
    }
  }
}

/**
 * Append atomically (temp file + rename). The ledger NEVER rewrites existing
 * rows - only rows the caller appends are new, by construction.
 */
function append(file, row) {
  assertClean(row)
  const rows = load(file)
  row.id = row.id || newId(rows)
  row.ts = row.ts || (rowTs())
  rows.push(row)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp-' + process.pid
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2) + '\n')
  fs.renameSync(tmp, file)
  return row
}

function rowTs() {
  // Deterministic-ish stamp; the ledger records wall time, not the capture
  // (captures must be reproducible; the ledger does not).
  return Date.now()
}

/** Every artifact path that has at least one row, and rows by artifact. */
function byArtifact(rows) {
  const map = new Map()
  for (const row of rows) {
    const list = map.get(row.artifact) || []
    list.push(row)
    map.set(row.artifact, list)
  }
  return map
}

module.exports = { ledgerPath, load, append, newId, byArtifact }

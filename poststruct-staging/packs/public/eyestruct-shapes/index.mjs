// eyestruct-shapes - file checks over an eyestruct-shaped lab's .eyes canon
// tree, hosted by poststruct (the TEXT leg audits the EYES' receipts). The
// check ids come straight from eyestruct's shipped gate semantics (its
// lib/gate.js + lib/reasons.js named-code census (derived, never
// hand-copied) + the exit contract 0-1-2),
// and the fixture material it was born stress-tested against is the eye's
// own 4-pack, 30-verdict, 0-exploited adversarial campaign. All pure file
// reads: JSON / the family YAML manifest subset / text tables. Zero
// network, zero HTML parsing (poststruct#19's fence deal, same as
// vant-shapes).
//
// THE CONTRACT with the target (moduleCtx['eyestructTree']): the audited
// repo tree - a lab docking the .eyes canon convention, eyestruct itself or
// a sibling adopting the same convention.
//   root            -> absolute path to the audited repo, or null (the
//                      pack then dockets one BOUNDED row and stays honest
//                      about auditing nothing)
//   exists(rel) / read(rel) -> text or null / readBuf(rel) -> Buffer|null
//   readdir(rel)    -> entry names within rel, or []
//
// Verdict taxonomy (family): BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/eyestruct-shapes'

export const REQUIRED_KEYS = ['eyestructTree']

// The UNSAFE_TEXT class, byte-for-byte the host ledger's rule (tab and
// newline are the two readable exceptions; everything else under 0x20 and
// 0x7F is a control character that poisons downstream readers).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

const CANON_EYES = 'labs/.eyes'
const RECEIPT_EYES = 'labs/.eyes-receipt'
const PACK_EYES = 'eyestruct-shapes'

function take(ctx, key) {
  const value = ctx?.[key]
  if (value === undefined) throw new TypeError(`${PKG}: moduleCtx[${JSON.stringify(key)}] is missing - the runner did not arm the ${key} contract`)
  return value
}

// The eyes-relative path contract, mirrored from the host ledger module:
// a row artifact is a path INSIDE the eyes home. Absolute paths
// (posix or win32 drive/UNC) and any `..` segment are escapes, not paths.
export function artifactEscapes(p) {
  if (typeof p !== 'string' || !p.trim()) return true
  if (p.startsWith('/') || p.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(p)) return true
  return p.split(/[\\/]/).includes('..')
}

// ---- the family manifest subset (mirrors eyestruct lib/manifest.js) ----

export function parsePin(text) {
  const pin = {}
  const m = text.match(/^pin:\s*\n((?:\s{2}.+\n?)+)?/m)
  if (m && m[1]) {
    for (const line of m[1].split('\n')) {
      if (!line.trim()) continue
      const kv = line.trim().match(/^([\w-]+):\s*(.+)$/)
      if (!kv) return { ok: false, reason: `pin row not key: value -> "${line.trim()}"` }
      pin[kv[1]] = kv[2].trim()
    }
  }
  return { ok: true, pin }
}

function parseRoutes(text) {
  const routes = []
  const idx = text.search(/^routes:/m)
  if (idx === -1) return routes
  const body = text.slice(idx)
  for (const line of body.split('\n').slice(1)) {
    if (!line.trim() || line.startsWith('routes:')) continue
    if (!/^\s{2}-\s/.test(line)) break
    const row = {}
    for (const kv of line.trim().slice(2).matchAll(/([\w-]+):\s*(\S+)/g)) {
      row[kv[1]] = kv[2]
    }
    routes.push({ row, text: line.trim() })
  }
  return routes
}

/** The pin + route matrix verdict for one manifest text. */
export function manifestFindings(text) {
  const faults = []
  const pinOut = parsePin(text)
  if (!pinOut.ok) {
    faults.push({ code: 'MANIFEST_CORRUPT', problem: pinOut.reason })
    return faults
  }
  const { pin } = pinOut
  for (const key of ['browser-image', 'renderer']) {
    if (!pin[key]) {
      faults.push({ code: 'MANIFEST_CORRUPT', problem: `pin.${key} is required` })
    } else if (CONTROL_CHARS.test(pin[key])) {
      faults.push({ code: 'UNSAFE_TEXT', problem: `pin.${key} carries a control character` })
    } else if (!/[@:]/.test(pin[key])) {
      // A pin that references neither a browser image (name@version) nor a
      // bundle resource (image:tag) is a finding: the pin names a thing the
      // rig cannot actually resolve.
      faults.push({ code: 'MANIFEST_CORRUPT', problem: `pin.${key} is not a pinned image or bundle reference -> "${pin[key]}"` })
    }
  }
  const routes = parseRoutes(text)
  if (!routes.length) {
    faults.push({ code: 'WALK_EMPTY', problem: 'the manifest declares no routes to walk' })
  }
  for (const { row, text: raw } of routes) {
    for (const key of ['path', 'view', 'theme', 'viewport']) {
      if (!row[key]) faults.push({ code: 'MANIFEST_CORRUPT', problem: `route row needs path/view/theme/viewport -> "${raw}"` })
    }
    if (row.theme && row.theme !== 'dark' && row.theme !== 'light') {
      faults.push({ code: 'BAD_THEME', problem: `theme must be dark or light -> "${raw}"` })
    }
    if (row.viewport) {
      const m = /^(\d+)x(\d+)$/.exec(row.viewport)
      const w = m ? Number(m[1]) : 0
      const h = m ? Number(m[2]) : 0
      if (!m || w < 100 || w > 5120 || h < 100 || h > 5120) {
        faults.push({ code: 'BAD_VIEWPORT', problem: `viewport must be WxH within the sane range -> "${raw}"` })
      }
    }
  }
  return faults
}

// ---- the canon ledger schema (mirrors eyestruct lib/ledger.js load) ----

export const LEDGER_NEED = {
  wave: ['id', 'ts', 'agent', 'commit', 'type', 'note'],
  row: ['id', 'ts', 'agent', 'commit', 'artifact', 'type', 'note'],
}

export function ledgerFindings(rows) {
  const faults = []
  if (!Array.isArray(rows)) return [{ code: 'LEDGER_CORRUPT', problem: 'not an array of rows' }]
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      faults.push({ code: 'LEDGER_CORRUPT', problem: 'bad row (not an object)' })
      continue
    }
    const wave = row.type === 'wave'
    for (const k of LEDGER_NEED[wave ? 'wave' : 'row']) {
      if (!(k in row)) faults.push({ code: 'LEDGER_CORRUPT', problem: `row ${row.id || '?'} missing ${k}` })
    }
    if (typeof row.id !== 'string' || !row.id.trim()) {
      faults.push({ code: 'LEDGER_CORRUPT', problem: `row ${row.id === undefined ? '?' : JSON.stringify(row.id)} id is not a useable string` })
    }
    if (!(typeof row.ts === 'number' || (typeof row.ts === 'string' && row.ts.trim()))) {
      faults.push({ code: 'LEDGER_CORRUPT', problem: `row ${row.id || '?'} ts is not a timestamp` })
    }
    if (wave && (!Array.isArray(row.artifacts) || !row.artifacts.length || !row.artifacts.every((a) => typeof a === 'string' && a.trim()))) {
      faults.push({ code: 'LEDGER_CORRUPT', problem: `row ${row.id || '?'} is a wave without a useable artifacts array` })
    }
  }
  const seen = new Set()
  for (const row of rows) {
    if (row && seen.has(row.id)) faults.push({ code: 'LEDGER_CORRUPT', problem: `duplicate row id ${row.id}` })
    if (row) seen.add(row.id)
  }
  return faults
}

// ---- the row strings the text leg guards (UNSAFE_TEXT, mirrored) ----

const ROW_STRINGS = ['id', 'agent', 'commit', 'artifact', 'type', 'note']

export function unsafeFindings(rows) {
  const faults = []
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    for (const key of ROW_STRINGS) {
      const v = row[key]
      if (typeof v === 'string' && CONTROL_CHARS.test(v)) {
        faults.push({ code: 'UNSAFE_TEXT', problem: `row ${row.id || '?'} field "${key}" carries a control character` })
      }
    }
    if (Array.isArray(row.artifacts)) {
      for (const a of row.artifacts) {
        if (typeof a === 'string' && CONTROL_CHARS.test(a)) {
          faults.push({ code: 'UNSAFE_TEXT', problem: `row ${row.id || '?'} artifacts entry carries a control character` })
        }
      }
    }
  }
  return faults
}

// ---- refs + sha fields for the receipt hall ----

function rowRefs(row) {
  const refs = []
  if (typeof row?.artifact === 'string') refs.push(row.artifact)
  if (Array.isArray(row?.artifacts)) refs.push(...row.artifacts.filter((a) => typeof a === 'string'))
  return refs
}

export function shaFindings(rows) {
  const faults = []
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    for (const [key, value] of Object.entries(row)) {
      if (!/^sha[0-9]+(:.*)?$/i.test(key)) continue
      const v = typeof value === 'string' ? value : String(value ?? '')
      if (!/^[0-9a-f]{64}$/.test(v.toLowerCase())) {
        faults.push({ code: 'RECEIPT_PROVENANCE', problem: `${row.id || '?'} ${key} does not parse as a ${key.match(/\d+/)?.[0] || 'sha256'}-shaped hex digest` })
      }
    }
  }
  return faults
}

// ---- the pack runner ----

class Verdicts {
  constructor() { this.rows = []; this.ok = true }
  passed(id, detail) { this.rows.push({ pack: PACK_EYES, id, verdict: 'PASSED', detail: String(detail || '').slice(0, 220) }) }
  bounded(id, bound, detail) {
    this.rows.push({ pack: PACK_EYES, id, verdict: 'BOUNDED', bound, detail: String(detail || '').slice(0, 220) })
  }
  failed(id, fault) {
    this.ok = false
    this.rows.push({ pack: PACK_EYES, id, verdict: 'EXPLOITED', detail: String(fault.problem || JSON.stringify(fault)).slice(0, 220), fault })
  }
  absorb(faults, id, prefixFn = (f) => f) {
    for (const fault of faults) this.failed(id, prefixFn(fault))
  }
}

function parseLedgerFile(fsapi, rel) {
  const text = fsapi.read(rel)
  if (text == null) return { error: 'absent' }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: 'not parseable JSON' }
  }
  // Both committed shapes are honest: a bare row array and the
  // { schemaVersion, rows } envelope the family's pack-ledger baseline
  // writes. Anything else - a broken envelope, a missing rows field - is
  // real corruption, not a shape to guess past.
  if (Array.isArray(parsed)) return { rows: parsed }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rows)) {
    return { rows: parsed.rows }
  }
  return { error: 'not an array of rows (nor a rows envelope)' }
}

/** One shared harness for one canon-carrying tree. */
function audit(fsapi) {
  const v = new Verdicts()
  const manifestRel = `${CANON_EYES}/manifest.yml`
  const ledgerRel = `${CANON_EYES}/ledger.json`

  // The canon contract: the tree claims the convention, so manifest + ledger
  // must BOTH exist and parse honest. A tree that claims nothing is not this
  // pack's scope (the docket lives in run()).
  if (!fsapi.exists(manifestRel)) {
    v.failed('eyes/manifest-pin-drift', { problem: `${manifestRel} is absent - a canon-carrying tree carries the manifest first (MISSING_MANIFEST)` })
    v.failed('eyes/ledger-corrupt', { problem: `${ledgerRel} is absent with no manifest to name the canon` })
    return v.rows
  }
  const manifestText = fsapi.read(manifestRel)
  if (manifestText == null) {
    v.failed('eyes/manifest-pin-drift', { problem: `${manifestRel} is not readable` })
  } else {
    v.absorb(manifestFindings(manifestText), 'eyes/manifest-pin-drift')

    const pin = parsePin(manifestText).pin
    v.passed('eyes/manifest-pin-drift', `pin ${pin['browser-image'] || '(unset)'} / renderer ${pin.renderer || '(unset)'} parses as the family schema`)
  }

  const canon = parseLedgerFile(fsapi, ledgerRel)
  if (canon.error) {
    v.failed('eyes/ledger-corrupt', { problem: `${ledgerRel}: ${canon.error}` })
  } else {
    v.absorb(ledgerFindings(canon.rows), 'eyes/ledger-corrupt')
    v.passed('eyes/ledger-corrupt', `${canon.rows.length} row(s) parse as the append-only schema`)

    // DANGLING_ROW + UNSAFE_PATH: every pointer a canon row makes must be an
    // eyes-relative path that resolves to a committed file.
    const refs = []
    for (const row of canon.rows) {
      if (!row || typeof row !== 'object') continue
      for (const p of rowRefs(row)) refs.push({ id: row.id, p })
    }
    const dangling = []
    const unsafe = []
    for (const { id, p } of refs) {
      if (artifactEscapes(p)) unsafe.push(`row ${id} (${p})`)
      else if (!fsapi.exists(`${CANON_EYES}/${p}`)) dangling.push(`row ${id} (${p})`)
    }
    for (const u of unsafe) v.failed('eyes/dangling-canon', { problem: `UNSAFE_PATH: ${u} escapes the eyes home` })
    for (const d of dangling) v.failed('eyes/dangling-canon', { problem: `dangling row: ${d} does not resolve to a committed file (DANGLING_ROW)` })
    if (!unsafe.length && !dangling.length) v.passed('eyes/dangling-canon', `${refs.length} canon pointer(s) all resolve`)

    // UNSAFE_TEXT across the canon ledger's row strings.
    v.absorb(unsafeFindings(canon.rows), 'eyes/note-unsafety')
  }

  // The receipt hall, where present.
  const receiptRel = `${RECEIPT_EYES}/ledger.json`
  const receipt = parseLedgerFile(fsapi, receiptRel)
  if (receipt.error === 'absent') {
    v.bounded('eyes/receipt-provenance', 'receipt-hall-absent', `${receiptRel} does not exist - this tree runs no receipt hall`)
  } else if (receipt.error) {
    v.failed('eyes/receipt-provenance', { problem: `${receiptRel}: ${receipt.error}` })
  } else {
    const refs = []
    for (const row of receipt.rows) {
      if (!row || typeof row !== 'object') continue
      for (const p of rowRefs(row)) refs.push({ id: row.id, p })
    }
    const provenanceFaults = []
    for (const { id, p } of refs) {
      if (artifactEscapes(p)) {
        provenanceFaults.push({ code: 'UNSAFE_PATH', problem: `receipt row ${id} (${p}) escapes the receipt home` })
      } else if (!fsapi.exists(`${RECEIPT_EYES}/${p}`)) {
        provenanceFaults.push({ code: 'RECEIPT_PROVENANCE', problem: `receipt row ${id} (${p}) points at a file that does not exist` })
      }
    }
    for (const f of shaFindings(receipt.rows)) provenanceFaults.push(f)
    for (const f of provenanceFaults) v.failed('eyes/receipt-provenance', f)
    if (!provenanceFaults.length) v.passed('eyes/receipt-provenance', `${receipt.rows.length} receipt row(s) provenance-honest`)

    v.absorb(unsafeFindings(receipt.rows), 'eyes/note-unsafety')
  }

  // The committed pack-verdict ledger vs the actually exported packs.
  const verdictRel = 'packs/eye-ledger.json'
  const verdict = parseLedgerFile(fsapi, verdictRel)
  if (verdict.error === 'absent') {
    v.bounded('eyes/verdict-count-drift', 'pack-verdict-baseline-absent', `${verdictRel} does not exist - this tree carries no committed pack campaign`)
  } else if (verdict.error) {
    v.failed('eyes/verdict-count-drift', { problem: `${verdictRel}: ${verdict.error}` })
  } else {
    const exported = new Set(
      (fsapi.readdir('packs/public') || [])
        .filter((n) => n !== 'pack.json' && fsapi.exists(`packs/public/${n}/pack.json`)),
    )
    const named = new Set()
    const coverageFaults = []
    for (const row of verdict.rows) {
      if (!row || typeof row !== 'object') continue
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(row.pack || ''))) {
        coverageFaults.push({ code: 'VERDICT_DRIFT', problem: `row ${row.id || '?'} carries a non-pack name (${JSON.stringify(row.pack)})` })
        continue
      }
      named.add(row.pack)
      if (!exported.has(row.pack)) {
        coverageFaults.push({ code: 'VERDICT_DRIFT', problem: `verdict ledger names pack ${row.pack}, which packs/public does not export` })
      }
    }
    for (const pack of exported) {
      if (!named.has(pack)) {
        coverageFaults.push({ code: 'VERDICT_DRIFT', problem: `exported pack ${pack} has no verdict rows in the committed baseline - claimed counts disagree with the exports` })
      }
    }
    for (const f of coverageFaults) v.failed('eyes/verdict-count-drift', f)
    if (!coverageFaults.length) v.passed('eyes/verdict-count-drift', `${verdict.rows.length} verdict row(s) cover ${exported.size} exported pack(s) exactly`)
  }

  // The reason-table doc vs the lib's named codes (the paper-lie class).
  const libPaths = ['lib/reasons.js', 'lib/reasons.ts']
  const libRel = libPaths.find((p) => fsapi.exists(p))
  const docRel = fsapi.exists('docs/reasons.md') ? 'docs/reasons.md' : null
  if (!libRel || !docRel) {
    v.bounded('eyes/reason-table-drift', 'reason-surfaces-absent', `${libRel ? 'lib' : 'lib/reasons.{js,ts}'} and ${docRel ? 'docs' : 'docs/reasons.md'} present? ${libRel && docRel ? 'yes' : 'no'} - reason drift is only checkable where both surfaces exist`)
  } else {
    const libText = fsapi.read(libRel) || ''
    const docText = fsapi.read(docRel) || ''
    const libNames = new Set()
    for (const m of libText.matchAll(/(^|\n)  ([A-Z][A-Z_]{2,}): \d+[,}]/g)) libNames.add(m[2])
    const docNames = new Set()
    for (const m of docText.matchAll(/^\|\s*`([A-Z][A-Z_]+)`\s*\|/gm)) docNames.add(m[1])
    const faults = []
    for (const code of libNames) {
      if (!docNames.has(code) && !docText.includes(`\`${code}\``)) {
        faults.push({ code: 'REASON_TABLE_DRIFT', problem: `lib exports ${code} (exit ${libExit(libText, code)}); the reason docs never mention it` })
      }
    }
    for (const code of docNames) {
      if (!libNames.has(code)) {
        faults.push({ code: 'REASON_TABLE_DRIFT', problem: `docs table promises ${code}; the lib does not ship it` })
      }
    }
    v.absorb(faults, 'eyes/reason-table-drift')
    if (!faults.length) {
      v.passed('eyes/reason-table-drift', `${libNames.size} named codes, the docs table agrees`)
    }
  }

  // The text leg's own pass for the UNSAFE_TEXT surface (both ledgers
  // already docketed per-row; a clean round is the explicit row).
  if (!v.rows.some((r) => r.id === 'eyes/note-unsafety' && r.verdict !== 'PASSED')) {
    v.passed('eyes/note-unsafety', 'ledger + receipt row strings carry no control characters')
  }

  return v.rows
}

function libExit(libText, code) {
  const m = new RegExp(`${code}: (\\d)[,}]`).exec(libText)
  return m ? m[1] : '?'
}

export function run(ctx) {
  const tree = take(ctx, 'eyestructTree')
  if (!tree || tree.root == null) {
    // No arm, no fake pass: the docket says what was (not) audited.
    const v = new Verdicts()
    v.bounded('eyes/canon-absent', 'target-tree-absent', 'no eyestruct-shaped tree armed (set EYESTRUCT_TREE) - nothing was audited, nothing was passed')
    return { ok: v.ok, rows: v.rows }
  }
  // A tree without any canon surface is out of scope for this pack (the
  // eyestruct-shapes audit is over LABS that dock the canon convention) -
  // docketed, never a silent green.
  const canon = `${CANON_EYES}/manifest.yml`
  const receipt = `${RECEIPT_EYES}/manifest.yml`
  if (!tree.exists(canon) && !tree.exists(receipt)) {
    const v = new Verdicts()
    v.bounded('eyes/canon-absent', 'canon-free-tree', `${tree.root} carries no labs/.eyes or labs/.eyes-receipt - the pack audits canon-docking trees`)
    return { ok: v.ok, rows: v.rows }
  }
  const rows = audit(tree)
  return { ok: !rows.some((r) => r.verdict === 'EXPLOITED'), rows }
}

// SPEC section 3: the default export is what the loader loads; the named
// exports above are the packlint census + the test battery's pure surface.
export default { run, PKG, REQUIRED_KEYS }

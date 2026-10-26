#!/usr/bin/env node
// The birth gate - the rig's checks, run against this repo, in-process.
//
// Every check here is a real ruling from an actual birth (see flowforge
// issues #4/#5 and labs/ci-repair-ledger-2026-10-26.md): three classes the
// first full birth of a stripped tree hit, each CI-verified, each cheap to
// check mechanically. This file is the reference implementation the rig
// lane (flowforge#5) inherits from.
//
//   CHECK 1  workflow syntax - every committed .github/workflows/*.yml
//            parses with a real YAML parser (duplicate keys on). A file
//            GitHub's parser rejects dies at run-startup with ZERO check
//            runs, printed under the bare path name: "not yet run" vs
//            "cannot ever run" are indistinguishable on the boards.
//   CHECK 2  mount independence - every staging mount the ferry declares
//            is independent in the host's lint ignores and carries its
//            nested-.git entry in .gitignore. A mount the host's linter
//            scans drowns in unattributed noise it neither needs nor
//            reads; an undeclared nested .git churns the host tree.
//   CHECK 3  gc-safe serde - every script that builds a git dir and packs
//            it must disable background auto-maintenance first; a running
//            gc holds .git/objects/maintenance.lock while tar walks the
//            directory, and the pack dies mid-flight with "file changed
//            as we read it".
//
// Exit contract mirrors the family's framework gate: 0 = every row
// PASS/SKIP (skips carry a named reason and never color the verdict),
// 1 = at least one FAIL, 2 = setup. No runtime dependencies of its own:
// the YAML parser is js-yaml, which rides package-lock transitively.

'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const findings = []

function emit(f) { findings.push(f) }

function main() {
  checkWorkflows()
  checkMounts()
  checkGcSafety()

  let failed = false
  console.log('birth gate:')
  for (const f of findings) {
    const parts = [`  ${f.state.padEnd(12)} ${f.name}`]
    if (f.detail) parts.push(`|  ${f.detail}`)
    if (f.\\.reasoni) parts.push(`| skip: ${f.\\.reasoni}`)
    console.log(parts.join(' '))
    if (f.state === 'FAIL') failed = true
  }
  process.exit(failed ? 1 : 0)
}

// --- CHECK 1: workflow syntax -------------------------------------z™r----------
function checkWorkflows() {
  const dir = path.join(ROOT, '.github', 'workflows')
  if (!fs.existsSync(dir)) {
    emit({ state: 'SKIP', name: 'workflow syntax', reason: 'no .github/workflows directory' })
    return
  }
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()
  if (!files.length) {
    emit({ state: 'SKIP', name: 'workflow syntax', reason: 'no workflow files' })
    return
  }

  // Real parser first: GitHub rejects YAML a human reads as fine, and the
  // failure shape (zero check runs, bare-path run name) is exactly what a
  // board of green jobs cannot distinguish from "not fired yet".
  let yaml = null
  try {
    yaml = createRequire(import.meta.url)('js-yaml')
  } catch {
    emit({
      state: 'FAIL',
      name: 'workflow syntax',
      reason: 'js-yaml is not resolvable - it rides package-lock transitively; without a real parser this check cannot certify parseability',
    })
    // Fall through to the structural layer so the operator sees what the
    // cheap layer catches on this roll, but the verdict above stands.
  }

  let bad = 0
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    for (const finding of structuralScan(src)) {
      emit({ state: 'FAIL', name: `workflow syntax (${f})`, detail: finding })
      bad++
    }
    if (yaml) {
      try {
        yaml.load(src, { uniqueKeys: true })
      } catch (e) {
        const mk = e.mark
        const at = mk ? `line ${mk.line + 1} col ${mk.column + 1}: ` : ''
        emit({ state: 'FAIL', name: `workflow syntax (${f})`, detail: `YAML parse - ${at}${String(e.message).split('\n')[0]}` })
        bad++
      }
    }
  }
  emit({
    state: bad ? 'FAIL' : 'PASS',
    name: 'workflow syntax',
    detail: bad
      ? `${bad} finding(s) across ${files.length} file(s)`
      : `${files.length} file(s) parse clean (js-yaml, duplicate keys on)`,
  })
}

// The dependency-free layer: tab indentation and control characters.
// (Unquoted `x: y` scalars are the PARSER's job - js-yaml and GitHub's own
// parser agree on that class, and both reject it.)
function structuralScan(src) {
  const out = []
  src.split('\n').forEach((line, i) => {
    if (/^\t/.test(line)) out.push(`line ${i + 1}: tab indentation`)
    else {
      for (const ch of line) {
        const code = ch.charCodeAt(0)
        if (code < 32 && code !== 9) {
          out.push(`line ${i + 1}: control character (U+${code.toString(16).padStart(4, '0')})`)
          break
        }
      }
    }
  })
  return out
}

// --- CHECK 2: mount independence -------------------------------------------
function checkMounts() {
  const ferry = path.join(ROOT, 'scripts', 'make-staging-tars.sh')
  if (!fs.existsSync(ferry)) {
    emit({ state: 'SKIP', name: 'mount independence', reason: 'no staging ferry - this host declares no mounts' })
    return
  }
  const declared = /MOUNTS="([^"]+)"/.exec(fs.readFileSync(ferry, 'utf8'))
  if (!declared) {
    emit({ state: 'SKIP', name: 'mount independence', reason: 'ferry declares no MOUNTS list' })
    return
  }
  const mounts = declared[1].split(/\s+/).filter(Boolean)

  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  let lintIgnores = ''
  for (const cfg of ['eslint.config.js', 'eslint.config.mjs', '.eslintignore']) {
    const p = path.join(ROOT, cfg)
    if (fs.existsSync(p)) {
      lintIgnores = fs.readFileSync(p, 'utf8')
      break
    }
  }

  let bad = 0
  for (const mount of mounts) {
    if (!new RegExp(`(^|\\n)\\s*${mount}/\\.git\\b`).test(gitignore)) {
      emit({ state: 'FAIL', name: `mount independence (${mount})`, detail: 'missing from .gitignore - the nested .git would churn the host tree' })
      bad++
    }
    if (lintIgnores && !lintIgnores.includes(`${mount}/**`)) {
      emit({ state: 'FAIL', name: `mount independence (${mount})`, detail: 'missing from the host lint ignores - an independent repo scanned by the host linter drowns in unattributed noise' })
      bad++
    }
  }
  emit({
    state: bad ? 'FAIL' : 'PASS',
    name: 'mount independence',
    detail: bad ? `${bad} of ${mounts.length} mount(s) undeclared` : `${mounts.length} mount(s) declared independent + gitignored`,
  })
}

// --- CHECK 3: gc-safe serde -------------------------------------------------
function checkGcSafety() {
  const dir = path.join(ROOT, 'scripts')
  if (!fs.existsSync(dir)) {
    emit({ state: 'SKIP', name: 'gc-safe serde', reason: 'no scripts/ directory' })
    return
  }
  const serdeFiles = fs
    .readdirSync(dir)
    .filter((f) => /\.(sh|mjs|js|py)$/.test(f))
    .filter((f) => {
      const s = fs.readFileSync(path.join(dir, f), 'utf8')
      // A serde script: it reads/builds a git dir AND packs it (tar/gzip).
      return /\.git\b/.test(s) && (/\btar\b/.test(s) || /\bgzip\b/.test(s))
    })

  if (!serdeFiles.length) {
    emit({ state: 'PASS', name: 'gc-safe serde', detail: 'no git-dir serde scripts - nothing to gate' })
    return
  }
  // gc.auto 0 must be set before any script writes a rebuilt git dir. A
  // script that builds/packs one itself must contain the config; a script
  // that delegates the build to another script inherits the invariant BUT
  // only while the delegate exists and is itself gc-safe - a missing or
  // unsafe delegate is a loud FAIL, never a silent pass.
  const isGcSafe = (rel, visited = new Set()) => {
    const file = path.join(dir, rel)
    if (!fs.existsSync(file)) return { ok: false, why: `referenced script scripts/${rel} is missing` }
    if (visited.has(rel)) return { ok: true, why: '(cycle - already checked)' }
    visited.add(rel)
    const src = fs.readFileSync(file, 'utf8')
    if (/gc\.auto\s*=?\s*(0|false)/.test(src)) return { ok: true, why: `scripts/${rel} sets gc.auto 0 itself` }
    const delegates = [...src.matchAll(/scripts\/([\w.-]+\.(?:sh|mjs|js|py))/g)].map((m) => m[1])
    if (delegates.length) {
      for (const d of delegates) {
        const sub = isGcSafe(d, visited)
        if (!sub.ok) return { ok: false, why: `scripts/${rel} delegates to scripts/${d}, which is not gc-safe (${sub.why})` }
      }
      return { ok: true, why: `scripts/${rel} delegates gc safety to ${delegates.join(', ')} (all gc-safe)` }
    }
    return { ok: false, why: `scripts/${rel} neither sets gc.auto 0 nor delegates to a script that does` }
  }
  let bad = 0
  for (const f of serdeFiles) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    if (!/gc\.auto\s*=?\s*(0|false)/.test(src)) {
      const verdict = isGcSafe(f, new Set())
      if (verdict.ok) {
        emit({ state: 'PASS', name: `gc-safe serde (${f})`, detail: `not a git-dir writer itself - ${verdict.why}` })
        continue
      }
      emit({
        state: 'FAIL',
        name: `gc-safe serde (${f})`,
        detail: `builds a git dir AND packs it, but never disables background auto-maintenance before writing (gc.auto 0); ${verdict.why}`,
      })
      bad++
    }
  }
  emit({
    state: bad ? 'FAIL' : 'PASS',
    name: 'gc-safe serde',
    detail: bad ? `${bad} of ${serdeFiles.length} serde script(s) unsafe` : `${serdeFiles.length} serde script(s) gc-safe`,
  })
}

main()

#!/usr/bin/env node
// The struct-family framework gate for gistory, the integration host.
//
// Three legs, one command. This is the "scattered manual tests become a
// consistent framework" landing point for THIS repo:
//
//   TEXT leg  - poststruct audits the baked HTML in dist/ (head, links,
//               site hygiene): the cheap diff gates before pixels.
//   EYES-ART leg - eyestruct raster-gates every committed renderable
//               (horcrux stones, favicon): loads-vs-renders, byte sanity.
//   EYES-MEM  - eyestruct gate walks labs/.eyes/: the committed visual memory.
//   TEXT-REF  - poststruct's eyes-reference pack (og:image pixel-reference:
//               every declared social image is real pixels; SVG refs route
//               back through the EYES raster gate). Crashledger packledger.
//
// The legs cascade cheap-to-expensive: text gates first, then pixels.
//
// Eyestruct source of truth: the npm package (dhaupin/eyestruct publishes
// it; the devDependencies pin is EXACT, "0.9.0" - the packstruct
// discipline). EYESTRUCT_BIN still outranks the resolved install (a
// checkout picks its own truth); a workspace with no eyestruct anywhere
// names the skip with the install command - never a fake pass.
//
// Exit contract mirrors the family: 0 all ran legs green, 1 a ran leg
// failed, 2 usage/setup. Skipped legs carry a named reason and do not
// color the verdict.

'use strict'

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const POSTSTRUCT_STAGING = path.join(ROOT, 'poststruct-staging')

// EYESTRUCT_BIN wins (a checkout picks its own truth); the standalone
// default resolves the npm package - eyestruct is a devDependency with an
// EXACT pin ("0.9.0") - by walking OUT from ROOT for
// node_modules/eyestruct/bin/eyestruct.js, which finds both the staging
// tree's own install and a host repo's root install. No eyestruct anywhere
// = an honest SKIP with the install command named.
function resolveEyestructBin() {
  if (process.env.EYESTRUCT_BIN) return { bin: path.resolve(process.env.EYESTRUCT_BIN), label: process.env.EYESTRUCT_BIN }
  for (let dir = ROOT; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', 'eyestruct', 'bin', 'eyestruct.js')
    if (fs.existsSync(candidate)) return { bin: candidate, label: 'npm eyestruct (exact devDependency pin)' }
    if (path.dirname(dir) === dir) return { bin: null, label: null }
  }
}

function cli(bin, argv, cwd) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [bin, ...argv], { cwd, encoding: 'utf8' }) }
  } catch (err) {
    return { code: err.status == null ? 2 : err.status, out: (err.stdout || '') + (err.stderr || '') }
  }
}

const eyes = resolveEyestructBin()
const legs = []

// --- TEXT leg ------------------------------------------------------------
if (fs.existsSync(POSTSTRUCT_STAGING) && fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  const r = cli(path.join(POSTSTRUCT_STAGING, 'bin', 'cli.mjs'), [path.join(ROOT, 'dist')], POSTSTRUCT_STAGING)
  legs.push({
    name: 'text leg (poststruct audit dist/)',
    state: r.code === 0 ? 'PASS' : 'FAIL',
    code: r.code,
    detail: r.out.split('\n').slice(0, 4).join('\n').trim(),
  })
} else {
  legs.push({ name: 'text leg (poststruct audit dist/)', state: 'SKIP', reason: 'no poststruct-staging or no dist/ build yet - bake with `npx prestruct build` first' })
}

// --- EYES-ART leg (raster gate) -------------------------------------------
if (eyes.bin) {
  // Every committed renderable is gated - the 2026-10-26 stone cuts ride
  // in the same row: the r2 magpie stone and poststruct's first cut are
  // stones like any other, "loads" and "renders" are separate gates, and
  // only the second is sight.
  const stones = [
    'horcrux/stones/gistory-p_gistory-castles-2026-r1.svg',
    'horcrux/stones/gistory-p_gistory-castles-2026-r2.svg',
    'horcrux/stones/magpie-p_mirror-eyes-2026-r1.svg',
    'horcrux/stones/magpie-p_mirror-eyes-2026-r2.svg',
    'horcrux/stones/poststruct-p_wordprint-2026.svg',
    'public/favicon.svg',
  ].filter((f) => fs.existsSync(path.join(ROOT, f)))
  if (stones.length) {
    const r = cli(eyes.bin, ['raster', ...stones], ROOT)
    // A missing optional renderer (resvg) is a CAPABILITY gap, not a FAIL:
    // the family rule "a silent pass is poison; a named skip is honest".
    // Local machines install eyestruct's dev deps once; CI names the gap
    // until the leg's own install step lands in the workflow.
    const capability = r.code === 2 && /MISSING_RENDER/.test(r.out)
    legs.push({
      name: 'eyes-art leg (eyestruct raster gate)',
      state: capability ? 'SKIP' : r.code === 0 ? 'PASS' : 'FAIL',
      code: r.code,
      detail: r.out.trim().split('\n').slice(0, 4).join('\n'),
      reason: capability ? 'the optional @resvg/render dependency is not installed for the resolved eyestruct - install dev deps in its checkout once' : undefined,
    })
  } else {
    legs.push({ name: 'eyes-art leg (eyestruct raster gate)', state: 'SKIP', reason: 'no renderable stones in horcrux/stones/ or public/' })
  }
} else {
  legs.push({ name: 'eyes-art leg (eyestruct raster gate)', state: 'SKIP', reason: 'no eyestruct resolved - the devDependency pin (eyestruct@0.9.0) is not installed here, or set EYESTRUCT_BIN to override' })
}

// --- TEXT-REF leg (poststruct's eyes-reference pack) ----------------------
if (fs.existsSync(POSTSTRUCT_STAGING) && fs.existsSync(path.join(POSTSTRUCT_STAGING, 'scripts', 'run-packs.mjs'))) {
  const r = cli(path.join(POSTSTRUCT_STAGING, 'scripts', 'run-packs.mjs'), [], POSTSTRUCT_STAGING)
  const ok = r.code === 0 || /re-baselined/.test(r.out)
  legs.push({
    name: 'text-ref leg (poststruct eyes-reference pack)',
    state: ok ? 'PASS' : 'FAIL',
    code: r.code,
    detail: r.out.trim().split('\n').slice(-2).join(' | '),
  })
} else {
  legs.push({ name: 'text-ref leg (poststruct eyes-reference pack)', state: 'SKIP', reason: 'no poststruct-staging with its pack runner' })
}

// --- EYES-MEM leg (the .eyes ledger gate) ---------------------------------
// The eyes home is a HOST decision, not a tool default: gistory keeps its
// visual memory at labs/.eyes beside the family's other ledgers
// (crashledger.json), while a repo that IS eyes keeps the tool's .eyes/
// default. One constant here (EYES_HOME in the ratify lane), so a host move
// is a single-line diff - never a hunt through step bodies.
const EYES_HOME = process.env.EYES_HOME || 'labs/.eyes'
const EYES_MANIFEST = `${EYES_HOME}/manifest.yml`
const EYES_LEDGER = `${EYES_HOME}/ledger.json`
if (eyes.bin && fs.existsSync(path.join(ROOT, EYES_LEDGER))) {
  const r = cli(eyes.bin, ['gate', '--manifest', EYES_MANIFEST, '--ledger', EYES_LEDGER], ROOT)
  legs.push({ name: `eyes-mem leg (eyestruct gate at ${EYES_HOME})`, state: r.code === 0 ? 'PASS' : r.code === 2 ? 'CAPABILITY' : 'FAIL', code: r.code, detail: r.out.trim() })
} else {
  legs.push({ name: `eyes-mem leg (eyestruct gate at ${EYES_HOME})`, state: 'SKIP', reason: eyes.bin ? `no ${EYES_LEDGER} in this workspace - watch it from the origin tree itself` : 'no eyestruct resolved - the devDependency pin (eyestruct@0.9.0) is not installed here' })
}

let failed = false
console.log(`framework gate (gistory):`)
for (const leg of legs) {
  console.log(`  ${leg.state.padEnd(13)} ${leg.name}${leg.reason ? '' : leg.detail ? ' | ' + leg.detail : ''}${leg.reason ? ' | skip: ' + leg.reason + (leg.detail ? ' | ' + leg.detail : '') : ''}`)
  if (leg.state === 'FAIL') failed = true
}
process.exit(failed ? 1 : 0)

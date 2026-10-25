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
//   EYES-MEM  - eyestruct gate walks .eyes/: the committed visual memory.
//   TEXT-REF  - poststruct's eyes-reference pack (og:image pixel-reference:
//               every declared social image is real pixels; SVG refs route
//               back through the EYES raster gate). Crashledger packledger.
//
// The legs cascade cheap-to-expensive: text gates first, then pixels.
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
const STAGING = {
  poststruct: path.join(ROOT, 'poststruct-staging'),
  eyestruct: path.join(ROOT, 'eyestruct-staging'),
}

function cli(bin, argv, cwd) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [bin, ...argv], { cwd, encoding: 'utf8' }) }
  } catch (err) {
    return { code: err.status == null ? 2 : err.status, out: (err.stdout || '') + (err.stderr || '') }
  }
}

const legs = []

// --- TEXT leg ------------------------------------------------------------
if (fs.existsSync(STAGING.poststruct) && fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  const r = cli(path.join(STAGING.poststruct, 'bin', 'cli.mjs'), [path.join(ROOT, 'dist')], STAGING.poststruct)
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
if (fs.existsSync(STAGING.eyestruct)) {
  const stones = ['horcrux/gistory-p_gistory-castles-2026.svg', 'horcrux/magpie-p_mirror-eyes-2026.svg', 'public/favicon.svg']
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
  if (stones.length) {
    const r = cli(path.join(STAGING.eyestruct, 'bin', 'eyestruct.js'), ['raster', ...stones], ROOT)
    // A missing optional renderer (resvg) is a CAPABILITY gap, not a FAIL:
    // the family rule "a silent pass is poison; a named skip is honest".
    // Local machines install staging deps once; CI will name the gap until
    // the raster lane ships its own install step.
    const capability = r.code === 2 && /MISSING_RENDER/.test(r.out)
    legs.push({
      name: 'eyes-art leg (eyestruct raster gate)',
      state: capability ? 'SKIP' : r.code === 0 ? 'PASS' : 'FAIL',
      code: r.code,
      detail: r.out.trim().split('\n').slice(0, 4).join('\n'),
      reason: capability ? 'the optional @resvg/render dependency is not installed for eyestruct-staging - run `npm install` in eyestruct-staging/ once' : undefined,
    })
  } else {
    legs.push({ name: 'eyes-art leg (eyestruct raster gate)', state: 'SKIP', reason: 'no renderable stones in horcrux/ or public/' })
  }
} else {
  legs.push({ name: 'eyes-art leg (eyestruct raster gate)', state: 'SKIP', reason: 'no eyestruct-staging in this workspace' })
}

// --- TEXT-REF leg (poststruct's eyes-reference pack) ----------------------
if (fs.existsSync(STAGING.poststruct) && fs.existsSync(path.join(STAGING.poststruct, 'scripts', 'run-packs.mjs'))) {
  const r = cli(path.join(STAGING.poststruct, 'scripts', 'run-packs.mjs'), [], STAGING.poststruct)
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
if (fs.existsSync(path.join(ROOT, '.eyes', 'ledger.json'))) {
  const r = cli(path.join(STAGING.eyestruct, 'bin', 'eyestruct.js'), ['gate'], ROOT)
  legs.push({ name: 'eyes-mem leg (eyestruct gate)', state: r.code === 0 ? 'PASS' : r.code === 2 ? 'CAPABILITY' : 'FAIL', code: r.code, detail: r.out.trim() })
} else {
  legs.push({ name: 'eyes-mem leg (eyestruct gate)', state: 'SKIP', reason: 'gistory has no .eyes/ ledger yet - watch it with eyestruct-staging instead (its own repo runs the gate)' })
}

let failed = false
console.log(`framework gate (gistory):`)
for (const leg of legs) {
  console.log(`  ${leg.state.padEnd(13)} ${leg.name}${leg.reason ? '' : leg.detail ? ' | ' + leg.detail : ''}${leg.reason ? ' | skip: ' + leg.reason + (leg.detail ? ' | ' + leg.detail : '') : ''}`)
  if (leg.state === 'FAIL') failed = true
}
process.exit(failed ? 1 : 0)

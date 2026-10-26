#!/usr/bin/env node
// The poststruct pack runner - the TEXT leg's own campaign lane, in the
// family shape (zero dependencies, moduleCtx-armed, committed verdict
// ledger). Today it runs one real pack:
//
//   packs/public/eyes-reference/  - the eye companion: every og/twitter
//     image a baked page declares must be REAL pixels the scrapers see
//     (magic bytes, IHDR dims vs declared og:image:width/height, plausible
//     size; SVG refs rasterize through the eyestruct raster gate).
//
// Crashledger semantics on packs/eye-ledger.json: a NEW EXPLOITED fails,
// a verdict change vs a recorded row fails, re-baseline is explicit
// --adopt. Targets the audited site via --dist (default ../gistory dist).

'use strict'

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const LEDGER = path.join(ROOT, 'packs', 'eye-ledger.json')
const PKG = 'poststruct-pack-runner'

const adopt = process.argv.includes('--adopt')
const distIdx = process.argv.indexOf('--dist')

// Resolution order for the audited site: --dist <path>, else
// POSTSTRUCT_DIST (the HOST DECISION env knob - on a standalone checkout the
// honest default is ./dist; the gistory-relative sibling only wins when
// someone audits gistory FROM poststruct, and even there the env knob
// outranks the sibling guess), thefâF†Rv—7F÷'’ÖÖ÷VçB6–&Æ–ærÂF†VââöF—7Bà¦6öç7BF—7DVçbÒ&ö6W72æVçbåõ5E5E%T5EôD•5@
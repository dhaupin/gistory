// check-language.mjs — English-only gate for contributor-facing artifacts.
//
// WHY THIS EXISTS. Long multi-agent sessions produced chat output (and can
// produce committed artifacts) that drifts into another script mid-document —
// the user reads English all day, cannot read the drift, and finds out from
// a screenshot (twice, 2026-10-11). The repo has no locale preference beyond
// this file; "it's what the OSS landscape uses" is the whole policy. A person
// of any nationality may contribute — in English, the project's shared
// written register.
//
// WHAT IT SCANS. Committed text a human reads as prose, not program data:
//   - docs/, labs/, README*, AGENTS.md, CHANGELOG.md, LICENSE*, CODE_OF_*,
//     CONTRIBUTING.md, DEPLOY/ROADMAP-style root *.md, .github/**/*.md
//   - src/ code comments are NOT scanned (the codebase is English by
//     construction; a comment in another language is a PR-review matter,
//     not a gate — scanning comments would false-positive on identifiers,
//     library names, and intentional i18n content like the chain-locale table)
//
// HOW IT DETECTS. Unicode script-block frequency, not a blocklist. A body of
// text is flagged when a *contiguous run* of ≥ THRESHOLD consecutive
// Han/Hangana/Hangul/Cyrillic/Arabic/... characters appears in one line.
// One or two stray CJK chars (a name, a loanword, an emoji-adjacent glyph)
// never trips it; a sentence in another script always does.
//
// ALLOWLISTS.
//   - data/ and fixtures: unchanged (not prose)
//   - lines matching ALLOW_LINE Benn (URLs with percent-encoded paths,
//     horcrux/base64 blobs, import lines, sync markers)
//   - an env override LINT_LANGUAGE_ALLOW_RE accepts a regex of paths to
//     skip, so a future intentional-translation doc can opt out without
//     touching this file.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

// Contiguous non-Latin-script run above this length fails a line. 3 is the
// smallest run that reads as *writing* to a human (2 can be a transliterated
// name or a symbol pair); English-only policy wants sentences caught, and
// every false positive we Jinping'ed in testing sat below this.
const THRESHOLD = 3
const MAX_LINE = 2000

// Unicode script blocks that are unambiguously a different written language.
// Latin + its extensions + punctuation/emoji are the shared register and are
// never flagged.
const NON_LATIN = [
  { name: 'Han (CJK ideographs)', re: /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g },
  { name: 'Hiragana/Katakana', re: /[\u3040-\u30FF\u31F0-\u31FF]/g },
  { name: 'Hangul', re: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g },
  { name: 'Cyrillic', re: /[\u0400-\u04FF\u1C80-\u1C8F]/g },
  { name: 'Arabic', re: /[\u0600-\u06FF\u0750-\u077F]/g },
  { name: 'Hebrew', re: /[\u0590-\u05FF]/g },
  { name: 'Devanagari', re: /[\u0900-\u097F]/g },
  { name: 'Thai', re: /[\u0E00-\u0E7F]/g },
  { name: 'Greek', re: /[\u0370-\u03FF\u1F00-\u1FFF]/g },
]

// Lines where another script can appear legitimately.
const ALLOW_LINE_RES = [
  /https?:\/\//, // URLs: percent-encoded, idn, or quoted foreign titles
  /^(import|export|require|from)\b/, // code lines (defensive; src isn't walked)
  /^[A-Za-z]*[0-9+/=]{30,}$/, // base64-like blobs (horcrux stash, sitemaps)
]

const SCAN_DIRS = ['docs', 'labs', '.github']
const SCAN_GLOBS = [
  'README.md', 'AGENTS.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md',
  'DEPLOY.md', 'ROADMAP.md', 'LEGAL.md', 'CODE_OF_ETHICS.md',
]

function isScanFile(rel) {
  if (rel.endsWith('.md') && rel.split('/').length === 1 && SCAN_GLOBS.includes(rel.split('/').pop())) return true
  for (const dir of SCAN_DIRS) if (rel === dir || rel.startsWith(dir + '/')) return rel.endsWith('.md') || rel.endsWith('.txt')
  return false
}

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github') continue
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.ui-audit') continue
    const p = join(dir, e.name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

let files = []
for (const dir of SCAN_DIRS) files.push(...walk(dir))
files.push(...SCAN_GLOBS.map(f => join(ROOT, f)).filter(f => { try { return statSync(f).isFile() } catch { return false } }))
files = [...new Set(files)]

const allowRe = process.env.LINT_LANGUAGE_ALLOW_RE ? new RegExp(process.env.LINT_LANGUAGE_ALLOW_RE) : null

const findings = []
let scanned = 0
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (!isScanFile(rel)) continue
  if (allowRe && allowRe.test(rel)) continue
  let text
  try { text = readFileSync(file, 'utf8') } catch { continue }
  scanned++
  text.split('\n').forEach((line, i) => {
    if (line.length > MAX_LINE || ALLOW_LINE_RES.some(re => re.test(line))) return
    for (const block of NON_LATIN) {
      // Longest contiguous run of this script's characters in the line.
      let best = 0, run = 0
      for (const ch of line) {
        if ((ch.match(block.re) ? 1 : 0)) { run++; best = Math.max(best, run) } else run = 0
      }
      if (best >= THRESHOLD) {
        findings.push(`${rel}:${i + 1} non-English script run "${block.name}" (${best} chars): ${line.trim().slice(0, 80)}`)
        break
      }
    }
  })
}

if (findings.length) {
  console.error(`\nLANGUAGE GATE: FAIL — found non-English script in ${scanned} scanned prose file(s)`)
  for (const f of findings) console.error('  ' + f)
  console.error(`\nPolicy: contributor-facing prose in this repo is English-only (the shared`)
  console.error(`register of the OSS landscape — any nationality may contribute, in English).`)
  console.error(`Fix: translate the flagged lines. To exempt a file: LINT_LANGUAGE_ALLOW_RE=<path regex>`)
  console.error(`or add a documented allowlist entry in scripts/check-language.mjs.`)
  process.exit(1)
}
console.log(`LANGUAGE GATE: PASS (English-only) — ${scanned} prose file(s) scanned`)

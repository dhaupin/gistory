#!/usr/bin/env node
/**
 * Language gate (issue #184): contributor-facing prose is English-only.
 *
 * Why: two org agents drifted into Chinese mid-session on 2026-10-11 from
 * an English conversation; committed artifacts can drift the same way via
 * scripted agents. Committed prose a HUMAN reads must be readable by every
 * nationality -- English is what the OSS landscape runs on.
 *
 * Contract (distilled from the gistory reference implementation):
 * 1. SCAN SCOPE: committed files a human reads as prose - docs/, labs/,
 *    any markdown under .github/ (workflows, any depth) plus the root
 *    meta set: every root-level README / AGENTS / CHANGELOG /
 *    CONTRIBUTING / LEGAL / DEPLOY / ROADMAP / SECURITY /
 *    CODE_OF_CONDUCT markdown file.
 *    Code comments are OUT of scope (PR-review matter, false-positives on
 *    identifiers/library names).
 * 2. DETECTION = Unicode script-block longest run, not a word blocklist.
 *    For each Han/Hiragana/Katakana/Hangul/Cyrillic/Arabic/Hebrew/
 *    Devanagari/Thai/Greek block, compute the longest contiguous run per
 *    line; flag when a run is >= MIN_RUN (2 can be a transliterated name;
 *    3 reads as writing). Threshold + block list are DATA at the top --
 *    tuned in <30 lines.
 * 3. ALLOWLIST BY CONSTRUCTION, not intervention: URL-bearing lines,
 *    import/export/require lines, base64-ish blobs, and the
 *    LINT_LANGUAGE_ALLOW_RE env regex so intentional bilingual docs opt
 *    out WITHOUT editing the checker.
 * 4. FAILURE CONTRACT: exit 1 with `path:line <script-block-name> (N chars):
 *    <trimmed line>`; PASS prints
 *    `LANGUAGE GATE: PASS (English-only) -- N prose files scanned`.
 *
 * Inside fenced code blocks and inline-code spans are literal DATA, not
 * prose -- exempt (same posture as check-docs-style.js).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ---- DATA: tune here -------------------------------------------------
const MIN_RUN = 3;
const SCAN_DIRS = ['docs', 'labs'];                       // prose trees
const SCAN_GLOBS_DIR = '.github';                         // workflows' *.md
const SCAN_ROOT_META =
    /^(README|AGENTS|CHANGELOG|CONTRIBUTING|LEGAL|DEPLOY|ROADMAP|SECURITY|CODE_OF_CONDUCT).*\.md$/;

// Non-Latin script blocks. Each is (testFn, name). Longest-run per line.
// Han covers CJK ideographs; Hiragana/Katakana separate (Japanese kana
// mixed with Han is caught by either).
const SCRIPT_BLOCKS = [
    [/\p{Script=Han}[\p{Script=Han}]/u, 'Han'],
    [/\p{Script=Hiragana}/u, 'Hiragana'],
    [/\p{Script=Katakana}/u, 'Katakana'],
    [/\p{Script=Hangul}/u, 'Hangul'],
    [/\p{Script=Cyrillic}/u, 'Cyrillic'],
    [/\p{Script=Arabic}/u, 'Arabic'],
    [/\p{Script=Hebrew}/u, 'Hebrew'],
    [/\p{Script=Devanagari}/u, 'Devanagari'],
    [/\p{Script=Thai}/u, 'Thai'],
    [/\p{Script=Greek}[\p{Script=Greek}]/u, 'Greek'],
];
// Extend beyond the core list with a data-driven pass: longest run of
// consecutive code points of the same script.
function longestRun(line, scriptName, re) {
    // Single pass over the line collecting runs from the regex's same-script class.
    let max = 0;
    let cur = 0;
    for (const ch of line) {
        if (ch.trim() === '') { cur = 0; continue; }
        if (re.test(ch)) { cur++; if (cur > max) max = cur; }
        else cur = 0;
    }
    return { name: scriptName, run: max };
}

// The per-script run function is per-character-class; build a char-level
// matcher from each block's regex via the string-prototype.
const CHAR_TESTS = {
    Han: (c) => /\p{Script=Han}/u.test(c),
    Hiragana: (c) => /\p{Script=Hiragana}/u.test(c),
    Katakana: (c) => /\p{Script=Katakana}/u.test(c),
    Hangul: (c) => /\p{Script=Hangul}/u.test(c),
    Cyrillic: (c) => /\p{Script=Cyrillic}/u.test(c),
    Arabic: (c) => /\p{Script=Arabic}/u.test(c),
    Hebrew: (c) => /\p{Script=Hebrew}/u.test(c),
    Devanagari: (c) => /\p{Script=Devanagari}/u.test(c),
    Thai: (c) => /\p{Script=Thai}/u.test(c),
    Greek: (c) => /\p{Script=Greek}/u.test(c),
};

/** Longest per-line run per script. Returns [{name, run}]. */
function findScriptRuns(line) {
    const out = [];
    for (const [name, test] of Object.entries(CHAR_TESTS)) {
        let max = 0, cur = 0;
        for (const ch of line) {
            if (test(ch)) { cur++; if (cur > max) max = cur; }
            else cur = 0;
        }
        if (max > 0) out.push({ name, run: max });
    }
    return out;
}

// ---- Allowlist -------------------------------------------------------
function isAllowed(line) {
    if (/https?:\/\//.test(line)) return true;              // URL-bearing
    if (/^\s*(import|export|require)\b/.test(line)) return true; // code lines
    if (/[A-Za-z0-9+/]{40,}={0,2}/.test(line)) return true;   // base64-ish
    const env = process.env.LINT_LANGUAGE_ALLOW_RE;
    if (env) { try { if (new RegExp(env).test(line)) return true; } catch (e) { /* hostile regex -- ignore, keep scanning */ } }
    return false;
}

// ---- Scan ------------------------------------------------------------
const files = [];
for (const dir of SCAN_DIRS) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    (function walk(d) {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, f.name);
            if (f.isDirectory()) walk(p);
            else if (f.name.endsWith('.md')) files.push(p);
        }
    })(base);
}
const ghDir = path.join(ROOT, SCAN_GLOBS_DIR);
if (fs.existsSync(ghDir)) {
    (function walk(d) {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, f.name);
            if (f.isDirectory()) walk(p);
            else if (f.name.endsWith('.md')) files.push(p);
        }
    })(ghDir);
}
for (const f of fs.readdirSync(ROOT)) {
    if (fs.statSync(path.join(ROOT, f)).isFile() && SCAN_ROOT_META.test(f)) {
        files.push(path.join(ROOT, f));
    }
}
const seen = new Set();
const unique = files.filter(f => { if (seen.has(f)) return false; seen.add(f); return true; });

let issues = 0;
const findings = [];
for (const f of unique) {
    const rel = path.relative(ROOT, f);
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const n = i + 1;
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;
        line = line.replace(/`[^`]*`/g, '');    // inline-code is data, not prose
        if (isAllowed(line)) continue;
        for (const r of findScriptRuns(line)) {
            if (r.run >= MIN_RUN) {
                findings.push(`${rel}:${n} ${r.name} (${r.run} chars): ${lines[i].trim().slice(0, 100)}`);
                issues++;
            }
        }
    }
}
for (const f of findings) console.log(f);
console.log(issues === 0
    ? `LANGUAGE GATE: PASS (English-only) -- ${unique.length} prose files scanned`
    : `LANGUAGE GATE: FAIL (${issues} findings in ${unique.length} prose files)`);
process.exit(issues === 0 ? 0 : 1);

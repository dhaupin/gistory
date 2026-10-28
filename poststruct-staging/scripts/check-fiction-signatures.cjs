#!/usr/bin/env node
/**
 * Fiction-signature gate - the flowforge shell edition (same scanner logic
 * the struct-family repos run; the seed signatures below are GENERIC, and
 * the shell house law is:
 *
 *     seed your own signatures the moment a fiction is caught twice;
 *     anything caught twice becomes a gate, not a memory.
 *
 * A signature is [regex, human explanation]. Exit 1 on any hit outside the
 * allow-list (a debunking line counts - NEGATION below).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// signature: [regex, human explanation]  -- GENERIC seeds; replace/add yours
const SIGNATURES = [
  [/(artificial\s+)?intelligence\s+(will|is\s+going\s+to)\s+(change|revolution)/i,
    'hype claim - describe what the product DOES, not what it would do someday'],
  [/fastest|blazingly|lightning[- ]fast[^.]{0,40}(fastest|ever|world)/i,
    'superlative performance claims need a receipt (benchmark, file:line) or they are fiction'],
  [/100%\s+(secure|safe|guaranteed)|unhackable/i,
    'absolute security claims are fiction on any surface'],
  [/(enterprise[- ]grade|world[- ]class|cutting[- ]edge)\b/i,
    'banned hype vocabulary (house style: plain verbs, shown not told)'],
];
// a line that admits the fiction (docs explaining the rule) is not a hit
const NEGATION = /do not|never|must not|fiction|example|placeholder|e\.g\.|rule/;
// text extensions + allow-list
const TEXT_EXT = new Set(['.md', '.txt', '.html', '.js', '.mjs', '.cjs', '.yml', '.css']);
const ALLOW = new Set(['scripts/check-fiction-signatures.cjs', 'scripts/check-docs-style.cjs']);

const files = [];
(function walk(d, rel) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + '/' + f.name;
        const r = rel ? rel + '/' + f.name : f.name;
        if (f.isDirectory() && f.name !== 'node_modules' && f.name !== '_site' && f.name !== 'dist') walk(p, r);
        else if (TEXT_EXT.has(path.extname(f.name)) && !ALLOW.has(r)) files.push(p, r);
    }
})(ROOT, '');

let hits = 0;
for (let i = 0; i < files.length; i += 2) {
    const p = files[i], rel = files[i + 1];
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        for (const [re, why] of SIGNATURES) {
            if (re.test(line) && !NEGATION.test(line)) {
                console.log(rel + ':' + (n + 1) + ' ' + why);
                hits++;
                break;
            }
        }
    }
}

console.log(hits === 0
    ? 'FICTION SIGNATURES: PASS (' + files.length / 2 + ' files scanned, ' + SIGNATURES.length + ' signatures)'
    : 'FICTION SIGNATURES: FAIL (' + hits + ' hits)');
process.exit(hits === 0 ? 0 : 1);

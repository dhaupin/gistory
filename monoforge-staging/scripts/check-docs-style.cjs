#!/usr/bin/env node
/**
 * Docs style linter for the QC pass. Checks every docs/*.md file:
 *   - every opening code fence carries a language tag (closing fences exempt)
 *   - no heading level skips (h1 -> h3)
 *   - no trailing whitespace
 *   - no tabs in prose (frontmatter/markdown)
 *   - no em/en dashes in prose (voice rule; use hyphen). CHANGELOG exempt.
 *   - no emoji/dingbat glyphs in prose. CHANGELOG exempt.
 *   - pipe-table shape: lines starting with | must end with |; no pipes
 *     in headings; no bullets ending with | (broken-table residue)
 * Exit 1 on findings.
 */
const fs = require('fs');
const path = require('path');
const DOCS = path.resolve(__dirname, '..', 'docs');

// Voice-rule exempt file: historical changelog entries keep their punctuation.
const VOICE_EXEMPT = /CHANGELOG\.md$/;

const files = [];
(function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + '/' + f.name;
        if (f.isDirectory() && f.name !== '_data' && f.name !== '_layouts' && f.name !== '_plugins') walk(p);
        else if (f.name.endsWith('.md')) files.push(p);
    }
})(DOCS);

let issues = 0;
for (const f of files) {
    const rel = f.replace(DOCS + '/', '');
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    let inFence = false;
    let lastHeading = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const n = i + 1;
        if (/^\s*```/.test(line)) {
            if (!inFence && /^```\s*$/.test(line)) {
                console.log(`${rel}:${n} opening fence missing language tag`);
                issues++;
            }
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        if (/[ \t]+$/.test(line)) { console.log(`${rel}:${n} trailing whitespace`); issues++; }
        if (/\t/.test(line)) { console.log(`${rel}:${n} tab character`); issues++; }
        if (!VOICE_EXEMPT.test(rel)) {
            if (/[\u2013\u2014]/.test(line)) { console.log(`${rel}:${n} em/en dash (use hyphen)`); issues++; }
            // Arrows, dingbats, emoji blocks, variation selectors. Math symbols
            // (U+2200-22FF) are allowed: >= and infinity are technical notation.
            // Glyphs inside inline-code spans are literal data values (e.g. theme
            // icon tables), not prose decoration, so strip spans before checking.
            const prose = line.replace(/`[^`]*`/g, '');
            if (/[\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\uFE0F]|\uD83C[\uDF00-\uDFFF]|\uD83E[\uDD00-\uDDFF]/.test(prose)) { console.log(`${rel}:${n} emoji/glyph in prose`); issues++; }
        }
        // Broken pipe-table residue (earlier automated pass exploded rows):
        // "| a" newline "- b |" pattern and headings that swallowed cells.
        if (/^\|.*[^|\s]\s*$/.test(line) && !/^\|[\s|:-]*$/.test(line)) { console.log(`${rel}:${n} pipe line does not end with | (broken table)`); issues++; }
        if (/^- .*\|\s*$/.test(line)) { console.log(`${rel}:${n} bullet ends with | (broken table)`); issues++; }
        if (/^#{1,6}\s.*\|/.test(line)) { console.log(`${rel}:${n} pipe character in heading (broken table)`); issues++; }
        const h = line.match(/^(#{1,6})\s/);
        if (h) {
            const level = h[1].length;
            if (lastHeading && level > lastHeading + 1) {
                console.log(`${rel}:${n} heading skips h${lastHeading} to h${level}`);
                issues++;
            }
            lastHeading = level;
        }
    }
}

console.log(issues === 0
    ? 'DOCS STYLE: PASS (' + files.length + ' files)'
    : 'DOCS STYLE: FAIL (' + issues + ' issues)');
process.exit(issues === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Docs frontmatter gate (pass 153).
 *
 * docs/advanced/style.md requires every page to carry all 5 frontmatter
 * fields (version, permalink, layout, title, nav_order) -- but until now
 * NOTHING enforced it, and pass 151 found 2 of 118 pages missing
 * `layout:` with a real consequence: docs/_config.yml has no `defaults`
 * block, so Jekyll renders a layout-less page as raw HTML with no site
 * chrome. Silent breakage, invisible to every regex gate until now.
 *
 * Checks every markdown page under docs/:
 *   - all 5 style.md-required fields present and non-empty
 *   - permalink is absolute-ish (starts with /) -- the site links by it
 *   - nav_order is an integer
 *
 * NOTE: the version field is PRESENCE-only. style.md defines it as
 * "version introduced", which legitimately differs from package.json
 * (e.g. "0.8.5" pages on a 0.8.6 package); equality would be a false
 * positive. Drift of the *current* version is caught in judgment reads.
 *
 * Exit 1 on any violation, evidence inline.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

const REQUIRED = ['version', 'permalink', 'layout', 'title', 'nav_order'];

const problems = [];
let pages = 0;
(function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + '/' + f.name;
        if (f.isDirectory() && f.name !== '_data' && f.name !== '_layouts' && f.name !== '_plugins') walk(p);
        else if (f.name.endsWith('.md')) {
            pages++;
            const rel = path.relative(ROOT, p);
            const text = fs.readFileSync(p, 'utf8');
            const fm = text.match(/^---\n([\s\S]*?)\n---/);
            if (!fm) { problems.push(`${rel}: no frontmatter block`); continue; }
            const block = fm[1];
            for (const field of REQUIRED) {
                const m = block.match(new RegExp(`^${field}:\\s*(.*\\S)`, 'm'));
                if (!m) { problems.push(`${rel}: missing frontmatter field "${field}"`); continue; }
                const val = m[1].trim();
                if (!val || val === '""' || val === "''") {
                    problems.push(`${rel}: frontmatter field "${field}" is empty`);
                    continue;
                }
                if (field === 'permalink' && !val.startsWith('/')) {
                    problems.push(`${rel}: permalink "${val}" should start with / (site links by it)`);
                }
                if (field === 'nav_order' && !/^-?\d+$/.test(val)) {
                    problems.push(`${rel}: nav_order "${val}" is not an integer`);
                }
            }
        }
    }
})(DOCS);

if (problems.length) {
    console.error(`FRONTMATTER: FAIL (${problems.length} issue${problems.length === 1 ? '' : 's'} in ${pages} pages)`);
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
}
console.log(`FRONTMATTER: PASS (${pages} pages, all ${REQUIRED.length} fields + format checks)`);

#!/usr/bin/env node
/**
 * Docs link checker (ported from vant's scripts/check-docs-links.js,
 * adapted to this repo's baseurl - docs.creadev.org/eyestruct).
 *
 * Validates every markdown link in docs/:
 * - /eyestruct/<permalink> links must match a real frontmatter permalink
 *   (the gate that catches the doubled-prefix class and dead permalinks)
 * - other absolute links must match a permalink or resolve under docs/
 * - relative links must resolve on disk
 * Skips code fences, inline code, external URLs, and pure anchors.
 * Exit 1 on any broken link.
 */
const fs = require('fs');
const path = require('path');
const DOCS = path.resolve(__dirname, '..', 'docs');
const SITE_PREFIX = '/monoforge'; // the docs baseurl - mirror docs/_config.yml
// normalize: leading slash, no trailing slash ('' -> '/')
const norm = (s) => {
  s = '/' + String(s).replace(/^\/+|\/+$/g, '');
  return s === '/' ? '/' : s;
};
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = d + '/' + f.name;
    if (f.isDirectory() && f.name !== '_data' && f.name !== '_layouts' && f.name !== '_freestruct') walk(p);
    else if (f.name.endsWith('.md')) files.push(p);
  }
})(DOCS);
const perm = new Set();
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const m = t.match(/^permalink: (\S+)/m);
  if (m) perm.add(norm(m[1]));
}
let broken = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const parts = line.split('`');
    for (let s = 0; s < parts.length; s += 2) { // outside inline code only
      for (const m of parts[s].matchAll(/\]\(([^)\s]+)\)/g)) {
        let u = m[1];
        if (/^(https?:|mailto:)/.test(u)) continue;
        const anchor = u.includes('#') ? u.slice(u.indexOf('#')) : '';
        u = anchor ? u.slice(0, u.length - anchor.length) : u;
        if (!u) continue; // pure anchor
        const rel = f.replace(DOCS + '/', '');
        // The doubled-prefix class first (/eyestruct/eyestruct/...): name
        // it, never read it as a missing permalink.
        if (u.startsWith(SITE_PREFIX + '/') && /^\/eyestruct(\/|$)/.test(u.slice(SITE_PREFIX.length))) {
          console.log('BROKEN (doubled site prefix) in', rel, '->', m[1]);
          broken++;
          continue;
        }
        if (u.startsWith(SITE_PREFIX) || u === SITE_PREFIX) {
          const key = norm(u.slice(SITE_PREFIX.length));
          if (!perm.has(key)) {
            console.log('BROKEN (bad /eyestruct/ permalink) in', rel, '->', m[1]);
            broken++;
          }
          continue;
        }
        if (u.startsWith('/')) {
          const key = norm(u);
          if (!perm.has(key) && !fs.existsSync(path.join(DOCS, u))) {
            console.log('BROKEN (abs) in', rel, '->', m[1]);
            broken++;
          }
          continue;
        }
        const p = path.resolve(path.dirname(f), u.replace(/\.md$/, ''));
        if (fs.existsSync(p + '.md') || fs.existsSync(path.join(p, 'index.md')) || fs.existsSync(p)) continue;
        console.log('BROKEN (rel) in', rel, '->', m[1]);
        broken++;
      }
    }
  }
}
console.log(broken === 0
  ? 'DOCS LINKS: PASS (' + files.length + ' files)'
  : 'DOCS LINKS: FAIL (' + broken + ' broken)');
process.exit(broken === 0 ? 0 : 1);

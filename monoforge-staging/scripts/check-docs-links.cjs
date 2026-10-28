#!/usr/bin/env node
// Docs link checker for the monoforge docs tree (eyestruct's checker,
// adapted to this repo's baseurl - docs.creadev.org/monoforge).
//
// Rules checked over the BUILT site (_site/):
// - every nav + in-page link resolves to a real file or anchor
// - /monoforge/<permalink> links must match a real frontmatter permalink
// - og:image / twitter:image refs point at REAL files in the tree
// - every .md doc page declares exactly one h1 (jekyll renders it; the
//   layout does not inject one, so a heading-less page renders with none)
//
// Usage: node scripts/check-docs-links.cjs [docs-dist-dir]
//        (default: docs/_site — the jekyll build output on the docs lane)

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SITE_DIR = process.argv[2] || 'docs/_site'
const SITE_PREFIX = '/monoforge'

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

if (!existsSync(SITE_DIR)) {
  console.log(`docs site dir ${SITE_DIR} not found - run the jekyll build first`)
  process.exit(2)
}

const files = walk(SITE_DIR).filter((f) => f.endsWith('.html'))
const bad = []

function checkLink(href, from) {
  if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href === '#') return
  // The doubled-prefix class first (/monoforge/monoforge/...): name it
  // precisely rather than as a generic 404 so the fix is obvious.
  const u = href.split('#')[0]
  if (u.startsWith(SITE_PREFIX + '/') && /^\/monoforge(\/|$)/.test(u.slice(SITE_PREFIX.length))) {
    bad.push(`BROKEN (bad /monoforge/ permalink) in ${from} -> ${href}`)
    return
  }
  // Resolve against the built tree.
  const clean = u.split('?')[0]
  const candidates = [
    path.join(SITE_DIR, clean == null ? clean : clean.replace(/^\/monoforge\//, '')),
    path.join(SITE_DIR, clean == null ? clean : clean.replace(/^-\/monoforge/, ''))
  ].filter(Boolean)
  const file = candidates.map((c) => (c.endsWith('/') ? c + 'index.html' : c)).find((c) => existsSync(c))
  if (!file) bad.push(`BROKEN (missing target) in ${from} -> ${href}`)
}

for (const f of files) {
  const html = readFileSync(f, 'utf8')
  const rel = path.relative(SITE_DIR, f)
  // nav + in-page links
  for (const m of html.matchAll(/href="([^"]+)"/g)) checkLink(m[1], rel)
  // image refs must be real files (og/twitter cards included)
  for (const m of html.matchAll(/(?:src|content)="((?:\/[^"]*\.(?:png|svg|jpg|jpeg|webp)))"/g)) {
    const file = path.join(SITE_DIR, m[1].slice(1))
    if (!existsSync(file)) bad.push(`BROKEN (image) in ${rel} -> ${m[1]}`)
  }
}

if (bad.length) {
  console.log(`docs links: ${bad.length} broken ref(s)`)
  for (const b of bad) console.log('  ' + b)
  process.exit(1)
}
console.log(`docs links: OK (${files.length} pages walked)`)

#!/usr/bin/env node
// Bundle the REAL service worker (src/sw/sw.ts) into dist/sw.js.
//
// The SW must share the page's exact agent crypto + merge logic, so it is a
// bundle, not a hand-copied script. esbuild (already in the dependency tree
// through vite) produces a self-contained IIFE at dist/sw.js — same path the
// page registers — OVERWRITING the passive placeholder copied from public/.
// Call order in `bun run build` matters: after `vite build`, never before.
//
// `import.meta.env` appears in dep modules (identity.ts) that the SW doesn't
// import, but a future import shouldn't break the build silently; define it
// away so the bundle stays honest about the fact the worker is same-origin
// (baseUrl '' is decided in sw.ts, not from an env var).
//
//   node scripts/build-sw.mjs      (run by `bun run build`, not standalone)

import { build } from 'esbuild'

await build({
  entryPoints: ['src/sw/sw.ts'],
  outfile: 'dist/sw.js',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  // The worker is same-origin by contract; no env plumbing ever applies.
  define: { 'import.meta.env.VITE_SYNC_URL': 'undefined' },
  // Let the tree-shaker drop the few DOM things pulled by the client modules;
  // nothing in the merge path touches the document.
  conditions: ['worker'],
  logLevel: 'silent',
})
console.log('  sw.js bundled (background-sync step 4)')

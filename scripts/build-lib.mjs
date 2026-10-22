#!/usr/bin/env node
// Bundle the npm library runtime: src/index.ts -> dist/lib/index.mjs.
//
// One self-contained ESM file (the sync engine: agent crypto, merge rules,
// QoS, errors, view-state, the idb storage seam, and the shared models).
// The bundled copy exists BECAUSE plain `tsc` output cannot work for this
// tree: every internal import is extensionless, which Node-style resolution
// rejects and TypeScript emit cannot fix retroactively. esbuild inlines, so
// the single file has no internal imports to mis-resolve. The declarations
// ship alongside via `tsc -p tsconfig.lib.json` (see package.json exports:
// the "types" condition points at index.d.ts, the "default" condition at
// index.mjs — they do not need matching basenames).
//
// platform 'neutral': no Node or DOM globals are polyfilled in; the modules
// read `typeof indexedDB`/`typeof localStorage` at runtime and degrade
// exactly like they do inside the service worker (see src/sync/idb.ts),
// which is the whole reason the same code runs on page, worker, npm.
//
//   node scripts/build-lib.mjs   (run by `bun run build:lib`, not standalone)

import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/lib/index.mjs',
  bundle: true,
  format: 'esm',
  target: 'es2020',
  platform: 'neutral',
  minify: true,
  sourcemap: false,
  // The agent's SYNC_BASE reads import.meta.env; the npm bundle is not a
  // Vite build, so pin the same same-origin default the app build ships.
  define: { 'import.meta.env.VITE_SYNC_URL': 'undefined' },
  logLevel: 'silent',
})
console.log('  dist/lib/index.mjs bundled (npm library runtime)')

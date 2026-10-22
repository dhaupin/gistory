#!/usr/bin/env node
// Build the crashtest handlers bundle: crashtest/handlers-entry.ts
// -> crashtest/handlers.mjs.
//
// Why a build exists: the run-root config (crashtest.config.js) is loaded
// by the crashtest CLI inside plain Node, which cannot import gistory's TS
// sources directly. This bundles the four relay route handlers PLUS the
// agent crypto (for building real push bodies behind the pack's vocabulary)
// into ONE self-contained ESM file with no internal imports to mis-resolve.
// It is build output, generated before any crashtest run — locally via
// `bun run crashtest:run`, in CI by the workflow's first step before the
// gate action runs.
//
// platform 'node': the handlers never touch browser globals (they are
// Pages Functions over D1), but the agent modules read `typeof indexedDB`
// etc. at runtime — neutral-ish code that is fine to bundle as Node for a
// run that executes only handlers.

import { build } from 'esbuild'

await build({
  entryPoints: ['crashtest/handlers-entry.ts'],
  outfile: 'crashtest/handlers.mjs',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'node',
  minify: false,
  sourcemap: false,
  define: { 'import.meta.env.VITE_SYNC_URL': 'undefined' },
  logLevel: 'silent',
})
console.log('  crashtest/handlers.mjs bundled (relay handlers + agent crypto)')

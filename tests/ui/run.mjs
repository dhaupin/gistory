#!/usr/bin/env node
// Run every test in tests/ui/ (except this file and underscore-prefixed helpers).
//
//   bun run test:ui                       # against the running preview
//   bun run test:ui http://localhost:5173
//
// Each test module default-exports `run({ check, baseUrl, browser })` and may
// export a `name`. Exits non-zero if any check fails.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, resolveBaseUrl } from '../../scripts/lib/browser.mjs'
import { createChecker } from './_shared.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = await resolveBaseUrl()
const only = process.argv.slice(2).find((a) => !a.startsWith('http') && !a.startsWith('-'))

const files = fs
  .readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && f !== 'run.mjs' && !f.startsWith('_'))
  .filter((f) => !only || f.includes(only))
  .sort()

if (files.length === 0) {
  console.error(`No UI tests found${only ? ` matching "${only}"` : ''}`)
  process.exit(2)
}

console.log(`UI tests: ${files.join(', ')}`)
console.log(`Target: ${baseUrl}`)

const browser = await launchBrowser()

let failures = 0
for (const file of files) {
  const mod = await import(path.join(here, file))
  const suiteName = mod.name || file.replace(/\.mjs$/, '')
  const checker = createChecker(suiteName)
  try {
    await mod.default({ check: checker.check, browser, baseUrl })
  } catch (err) {
    checker.check('suite ran to completion', false, String(err?.message || err))
  }
  failures += checker.report()
}

await browser.close()

console.log(
  failures === 0
    ? '\nAll UI tests passed.'
    : `\n${failures} UI check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)

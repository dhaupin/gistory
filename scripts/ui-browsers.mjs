#!/usr/bin/env node
// Install the headless browser used by scripts/ui-audit.mjs and tests/ui/*.
//
// `.puppeteerrc.cjs` sets skipDownload:true so `npm install` (which the
// Cloudflare Pages build also runs) never pulls Chromium. This script flips
// that back off for its own child process, so the download happens only when
// you ask for it — once per machine.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

console.log('Installing a headless browser for the UI harness...\n')

const result = spawnSync('npx', ['--yes', 'puppeteer', 'browsers', 'install', 'chrome'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  // Overrides .puppeteerrc.cjs for this child only.
  env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'false' },
})

if (result.status !== 0) {
  console.error('\nBrowser install failed. Check the output above.')
  process.exit(result.status ?? 1)
}

// Confirm puppeteer can actually find it.
const { default: puppeteer } = await import('puppeteer')
const expected = await puppeteer.executablePath()
const found = fs.existsSync(expected)
console.log(`\nExpected browser: ${expected}`)
console.log(found ? 'Ready. Try: bun run ui:audit' : 'WARNING: that path does not exist.')
process.exit(found ? 0 : 1)

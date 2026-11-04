// test/check-docs-url-contract.test.cjs - the docs url-contract law's battery.
//
// The law: freestruct.config.yml must keep site.url bare and let basePath
// carry the deploy dir (the engine appends basePath itself, engine/urls.js).
// A url that already ends in the deploy dir doubles it (/gistory/gistory/)
// and 404s every injected metadata URL - the real bug this session fixed.
//
// Both ways, per the house rule: the canon shape passes, the baked shape
// fails by name. The gate is spawned as a subprocess over a fixture docs/
// tree so the exit code is what CI sees.
'use strict'

const test = require('node:test')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const gate = path.join(root, 'scripts', 'check-docs.mjs')

const PAGE = `---
version: 1.0.0
permalink: /
layout: default
title: Home
nav_order: 1
---

# Home

Body.
`

const NAV = `- title: Home
  url: /gistory/
`

function run(urlValue) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gistory-docs-'))
  fs.mkdirSync(path.join(dir, '_data'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.md'), PAGE)
  fs.writeFileSync(path.join(dir, '_data', 'nav.yml'), NAV)
  fs.writeFileSync(path.join(dir, 'freestruct.config.yml'), `site:\n  name: Gistory Docs\n  url: ${urlValue}\nbasePath: /gistory\noutputDir: _site\n`)
  const res = spawnSync(process.execPath, [gate, '--docs', dir], { encoding: 'utf8' })
  fs.rmSync(dir, { recursive: true, force: true })
  return res
}

test('a bare site.url (canon: basePath carries the deploy dir) passes', () => {
  const res = run('https://docs.creadev.org')
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /CHECK-DOCS: PASS/)
})

test('a site.url that already ends in basePath is refused by name', () => {
  const res = run('https://docs.creadev.org/gistory')
  assert.equal(res.status, 1)
  assert.match(res.stderr, /already ends in basePath "\/gistory"/)
  assert.match(res.stderr, /doubles the prefix/)
})

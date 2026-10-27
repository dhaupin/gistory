#!/usr/bin/env node
// bin/forge.mjs - monoforge: stamp / doctor / lock. Zero dependencies.
// Law: generated green is never shipped - the doctor refuses placeholder
// text, missing entries, and broken gates; the lock refuses a dirty tree.
import { resolve } from 'node:path'

const Help = `monoforge - the struct-family factory

Usage:
  monoforge new <dir>       stamp a fleet repo from factory.json (config in <dir>)
  monoforge doctor [dir]    run the truth battery (default: cwd)
  monoforge cut [dir]       cut a component-family workspace (cutlist.json + factory.json required)
  monoforge lock [dir]      doctor, then archive with a checksum
  monoforge lint-packs      packstruct passthrough over the repo's own install (loud exit 2 until the packs land)
  monoforge help            this

factory.json (in <dir>, required):
  { "name": "kebab-name", "species": "one-liner", "pitch": "the one-line pitch",
    "description": "the long form", "siteDomain": "https://x.creadev.org",
    "docsPath": "docs.creadev.org/x (optional, defaults to that)",
    "version": "0.9.0 (optional)" }
`
const [cmd, arg1, arg2] = process.argv.slice(2)
const dir = resolve(arg2 || arg1 || '.')
const show = (r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1) }

if (!cmd || cmd === 'help' || cmd === '--help') { console.log(Help); process.exit(0) }
if (cmd === 'new') {
  const stamp = (await import('../src/stamp.mjs')).default
  show(await stamp(resolve(process.argv[3] || '.')))
} else if (cmd === 'doctor') {
  const doctor = (await import('../src/doctor.mjs')).default
  const r = await doctor(dir)
  for (const f of r.findings) console.log(`${f.level.toUpperCase()} ${f.id}: ${f.message}`)
  console.log(`doctor: ${r.counts.fail} fail(s), ${r.counts.warn} warn(s) - ${r.ok ? 'PASS' : 'FAIL'}`)
  process.exit(r.ok ? 0 : 1)
} else if (cmd === 'cut') {
  const cut = (await import('../src/cut.mjs')).default
  const r = await cut((await import('node:path')).resolve(process.argv[3] || '.'))
  console.log(`cut: OK (${r.packages} packages from rev ${r.sourceRev.slice(0, 7)}) stamped ${r.files} files into ${r.dir}/`)
  process.exit(0)
} else if (cmd === 'lock') {
  const lock = (await import('../src/lock.mjs')).default
  const r = await lock(dir)
  if (!r.ok) { console.error(`lock: ${r.error}`); if (r.doctor) { for (const f of r.doctor.findings) console.log(`  ${f.level.toUpperCase()} ${f.id}: ${f.message}`) } process.exit(1) }
  console.log(`lock: OK (sha256 ${r.sha}...) archived ${r.archive}`)
  process.exit(0)
} else if (cmd === 'lint-packs') {
  // The pack lint lane as a discoverable verb (mirrors crashtest's
  // lint-packs, issue #32): ready now, honest exit 2 until the factory's
  // own packs + packstruct devDep land - never a silent skip.
  const { runLintPacks } = await import('../src/lint-packs.mjs')
  process.exit(runLintPacks({ argv: process.argv.slice(3), cwd: process.cwd(), json: process.argv.includes('--json') }))
} else {
  console.log Help)
  process.exit(2)
}

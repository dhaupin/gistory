#!/usr/bin/env node
// bin/cli.mjs - poststruct audit [dir] [--json] [--module x] | lint-packs [--deep] [--json] [--against <lib>] [dir]
import { runAudit } from '../src/index.mjs'
import { runLintPacks } from '../src/lint-packs.mjs'

const args = process.argv.slice(2)
// The leading verb (flowforge/explore family convention: poststruct audit [dir])
// is a dispatch token, never a target path (issue#7 B1: the documented
// `poststruct audit dist/` form previously fed 'audit' into dirArg and died
// with "No HTML files in audit/"). The verbless form `poststruct dist` keeps
// working: only a known verb is ever stripped, so a typo'd first word cannot
// silently become a verb OR a fantasy directory.
const VERBS = new Set(['audit', 'lint-packs'])
if (args[0] === 'lint-packs') {
  // The pack lint lane as a discoverable verb (mirrors crashtest's
  // lint-packs, issue #32): the repo's own packstruct install, never
  // downloaded, pass-through exit codes, loud refusal when absent.
  process.exit(runLintPacks({ argv: args.slice(1), cwd: process.cwd(), json: args.includes('--json') }))
}
const rest = VERBS.has(args[0]) ? args.slice(1) : args
const json = rest.includes('--json')
// --module parses position-independent next-arg (issue#7 B2: the
// comma-operator expression was permanently null, so the documented
// --module x filter was silently ignored on every run). Its VALUE is never
// a candidate for dirArg, whatever side of dir it sits on.
const mi = rest.indexOf('--module')
const skipNext = mi >= 0 ? mi + 1 : -1
const moduleFilter = mi >= 0 ? rest[skipNext] : null
if (moduleFilter === undefined || (moduleFilter && moduleFilter.startsWith('-'))) {
  console.error('poststruct: --module needs a value (head | site)')
  process.exit(2)
}
const dirArg = rest.find((a, i) => !a.startsWith('-') && i !== skipNext) || 'dist'

try {
  const r = await runAudit(dirArg, { module: moduleFilter })
  if (json) {
    console.log(JSON.stringify({ schema: 1, counts: r.counts, findings: r.findings }, null, 2))
  } else {
    const mod = moduleFilter ? ` (module: ${moduleFilter})` : ''
    console.log(`poststruct: ${r.pagesChecked} baked page(s) checked${mod}, sitemap ${r.sitemapLocs == null ? 'not audited' : `has ${r.sitemapLocs} loc entries`}`)
    for (const fd of r.findings) console.log(`  ${fd.level.toUpperCase()} ${fd.page}: ${fd.message}`)
  }
  process.exit(r.hasFails ? 1 : 0)
} catch (e) {
  console.error(`poststruct: ${e.message}`)
  process.exit(2)
}

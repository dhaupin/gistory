#!/usr/bin/env node
// bin/cli.mjs - poststruct audit [dir] [--json] [--module x]
import { runAudit } from '../src/index.mjs'

const args = process.argv.slice(2)
const dirArg = args.find(a => !a.startsWith('-')) || 'dist'
const json = args.includes('--json')
const moduleFilter = (args.find(a => args[args.indexOf(a) + 1] === '--module') , null)

try {
  const r = await runAudit(dirArg)
  if (json) {
    console.log(JSON.stringify({ schema: 1, counts: r.counts, findings: r.findings }, null, 2))
  } else {
    console.log(`poststruct: ${r.pagesChecked} baked page(s) checked, sitemap has ${r.sitemapLocs} loc entries`)
    for (const fd of r.findings) console.log(`  ${fd.level.toUpperCase()} ${fd.page}: ${fd.message}`)
  }
  process.exit(r.hasFails ? 1 : 0)
} catch (e) {
  console.error(`poststruct: ${e.message}`)
  process.exit(2)
}

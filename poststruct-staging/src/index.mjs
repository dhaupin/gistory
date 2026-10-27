// src/index.mjs - runAudit: the one entry programmatic consumers use.
import { walkHtml, loadPage, Findings } from './core.mjs'
import { auditHead } from './checks/head.mjs'
import { auditSite } from './checks/site.mjs'

export { Findings } from './core.mjs'
export const SCHEMA_VERSION = 1

export async function runAudit(dir = 'dist', opts = {}) {
  const f = new Findings()
  const moduleFilter = opts.module || null
  // Built-in module scoping (issue#7 B2): the CLI's --module flag is now
  // real. Unknown module names refuse loudly instead of silently running
  // everything; a null filter runs every built-in, so programmatic
  // consumers that never pass opts keep their exact old behavior.
  if (moduleFilter && !['head', 'site'].includes(moduleFilter)) {
    throw new Error(`unknown module ${moduleFilter} (built-ins: head, site)`)
  }
  const wantHead = !moduleFilter || moduleFilter === 'head'
  const wantSite = !moduleFilter || moduleFilter === 'site'
  const pages = walkHtml(dir)
  if (!pages.length) throw new Error(`No HTML files in ${dir}/.`)
  if (wantHead) {
    for (const path of pages) {
      const pm = loadPage(dir, path)
      auditHead(pm, f, { is404: pm.page === '404.html' })
    }
  }
  const site = wantSite ? auditSite(dir, f, opts) : { sitemapLocs: null }
  return { dir, pagesChecked: pages.length, sitemapLocs: site.sitemapLocs, counts: f.counts, findings: [...f.fails, ...f.warns], hasFails: f.hasFails }
}

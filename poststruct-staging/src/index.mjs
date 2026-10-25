// src/index.mjs - runAudit: the one entry programmatic consumers use.
import { walkHtml, loadPage, Findings } from './core.mjs'
import { auditHead } from './checks/head.mjs'
import { auditSite } from './checks/site.mjs'

export { Findings } from './core.mjs'
export const SCHEMA_VERSION = 1

export async function runAudit(dir = 'dist', opts = {}) {
  const f = new Findings()
  const pages = walkHtml(dir)
  if (!pages.length) throw new Error(`No HTML files in ${dir}/.`)
  for (const path of pages) {
    const pm = loadPage(dir, path)
    auditHead(pm, f, { is404: pm.page === '404.html' })
  }
  const site = auditSite(dir, f, opts)
  return { dir, pagesChecked: pages.length, sitemapLocs: site.sitemapLocs, counts: f.counts, findings: [...f.fails, ...f.warns], hasFails: f.hasFails }
}

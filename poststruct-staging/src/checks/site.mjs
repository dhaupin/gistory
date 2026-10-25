// src/checks/site.mjs - site-level contract: sitemap + robots.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function auditSite(dist, f, { expectedLocs = null } = {}) {
  let sitemapLocs = 0
  const sitemapPath = join(dist, 'sitemap.xml')
  if (!existsSync(sitemapPath)) {
    f.fail('sitemap.xml', 'site/sitemap-missing', 'sitemap.xml missing')
  } else {
    const s = readFileSync(sitemapPath, 'utf8')
    sitemapLocs = (s.match(/<loc>/g) || []).length
    if (sitemapLocs === 0) f.fail('sitemap.xml', 'site/sitemap-empty', 'no <loc> entries')
    if (!s.includes('<lastmod>')) f.warn('sitemap.xml', 'site/sitemap-lastmod', 'no <lastmod> dates')
  }

  const robotsPath = join(dist, 'robots.txt')
  if (!existsSync(robotsPath)) {
    f.fail('robots.txt', 'site/robots-missing', 'robots.txt missing')
  } else {
    const r = readFileSync(robotsPath, 'utf8')
    if (!/Sitemap:/i.test(r)) f.fail('robots.txt', 'site/robots-sitemap-pointer', 'no Sitemap: pointer')
  }

  return { sitemapLocs }
}

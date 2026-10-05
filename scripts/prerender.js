/**
 * scripts/prerender.js
 * ====================
 * Runs after `vite build && node scripts/inject-brand.js` via `npm run build`.
 * Uses Vite's ssrLoadModule to render each route to static HTML.
 *
 * Why ssrLoadModule instead of `vite build --ssr`:
 *   ssrLoadModule resolves all imports through Vite's unified module registry.
 *   This guarantees a single instance of react-router-dom -- StaticRouter and
 *   Routes share the same context, so location propagates correctly.
 *   A compiled SSR bundle would silently render every route as '/' with no error.
 *   See AGENTS.md for the full root cause analysis.
 *
 * Output (for a 3-route app with /, /about, /contact):
 *   dist/index.html           → /
 *   dist/about/index.html     → /about
 *   dist/contact/index.html   → /contact
 *   dist/404.html             → served by CF Pages for unmatched routes (HTTP 404)
 *   dist/sitemap.xml          → replaces the static one from public/
 *
 * Fails gracefully -- exits 0 on fatal error so CF Pages deploy continues as SPA.
 */

import fs   from 'fs'
import path from 'path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, '..')
const DIST      = path.join(ROOT, 'dist')

// ── Load config ───────────────────────────────────────────────────────────────

let config
try {
  config = (await import('../ssr.config.js')).default
} catch (err) {
  console.error('[prerender] Could not load ssr.config.js:', err.message)
  process.exit(0)
}

const {
  siteUrl,
  siteName = 'Site',
  routes: ROUTES = [],
  appLayoutPath = '/src/AppLayout.jsx',
} = config

// Validate required siteUrl
if (!siteUrl) {
  console.error('[prerender] siteUrl is required in ssr.config.js')
  process.exit(0)
}

if (!ROUTES.length) {
  console.warn('[prerender] No routes defined in ssr.config.js -- skipping')
  process.exit(0)
}

// Validate all routes have valid paths
const invalidRoutes = ROUTES.filter(r => !r.path || !r.path.startsWith('/'))
if (invalidRoutes.length > 0) {
  console.error('[prerender] Invalid routes found:', invalidRoutes.map(r => r.path).join(', '))
  console.error('[prerender] All routes must have a path starting with /')
  process.exit(0)
}

// ── Incremental: load cache ────────────────────────────────────────────

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const CLEAN = args.includes('--clean')

const CACHE_FILE = path.join(ROOT, '.prestruct/cache/routes.json')

function readCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    }
  } catch {
    // A missing or corrupt cache file simply means "nothing cached".
  }
  return {}
}

function writeCache(cache) {
  const dir = path.join(ROOT, '.prestruct/cache')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

function cleanCache() {
  fs.writeFileSync(CACHE_FILE, '{}')
  console.log('[prerender] Cache cleared')
}

// --clean flag
if (CLEAN) {
  cleanCache()
  process.exit(0)
}

const cache = readCache()
const cached = Object.keys(cache).length
console.log(`[prerender] Cache: ${cached} routes cached${FORCE ? ' (forcing rebuild)' : ''}`)

// ── Meta injection ────────────────────────────────────────────────────────────

function injectMeta(html, meta, routePath) {
  // Prevent regex backreference expansion when dynamic values are used in replacement strings.
  const escapeReplacement = (s) => String(s || '').replace(/\$/g, '$$$$')

  const title   = escapeReplacement(meta.title)
  const desc    = escapeReplacement(meta.description)
  const ogImage = escapeReplacement(meta.ogImage || config.ogImage || '')
  const url     = escapeReplacement(`${siteUrl}${routePath === '/' ? '' : routePath}`)

  if (title) {
    html = html.replace(/<title>[^<]*<\/title>/,                                     `<title>${title}</title>`)
    html = html.replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/s,        `$1${title}$2`)
    html = html.replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/s,       `$1${title}$2`)
  }
  if (desc) {
    html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/s,         `$1${desc}$2`)
    html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/s,  `$1${desc}$2`)
    html = html.replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/s, `$1${desc}$2`)
  }
  html = html.replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/s,            `$1${url}$2`)
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/s,                 `$1${url}$2`)
  if (ogImage) {
    html = html.replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/s,        `$1${ogImage}$2`)
    html = html.replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/s,       `$1${ogImage}$2`)
  }

  return html
}

// ── Sitemap ───────────────────────────────────────────────────────────────────

// Escape XML entities in sitemap URLs
function escapeXml(unsafe) {
  if (!unsafe) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function generateSitemap(routes) {
  const now  = new Date().toISOString().split('T')[0]
  const urls = routes.map(r => `
  <url>
    <loc>${escapeXml(siteUrl)}${r.path === '/' ? '' : escapeXml(r.path)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${r.changefreq || 'monthly'}</changefreq>
    <priority>${r.priority || '0.5'}</priority>
  </url>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}\n</urlset>`
}

// ── 404 page ──────────────────────────────────────────────────────────────────
// Uses id="root-404" (not "root") so main.jsx does NOT trigger hydrateRoot.
// hydrateRoot expects SSR React content -- this is plain static HTML.
// The React bundle script tag is stripped -- no JS loads at all on 404 pages.
// See AGENTS.md for the full explanation.

function generate404(shell) {
  const notFoundConfig = config.notFound || {}
  const heading        = notFoundConfig.heading        || 'Page not found.'
  const body           = notFoundConfig.body           || "That page doesn't exist -- or it moved."
  const primaryLabel   = notFoundConfig.primaryCta?.label  || 'Go home'
  const primaryHref    = notFoundConfig.primaryCta?.href   || '/'

  // Class-based markup styled by the app stylesheet (src/index.css .notfound-*):
  // 404.html keeps the stylesheet <link>, so the page matches the app in both
  // themes without any JavaScript. The inline styles this replaced could not
  // follow the host theme (a #000 button on a dark background was invisible).
  const bodyLines = [
    '<div id="root-404" class="notfound">',
    '  <div class="notfound-inner">',
    `    <p class="notfound-brand">${siteName}</p>`,
    `    <h1 class="notfound-title">${heading}</h1>`,
    `    <p class="notfound-body">${body}</p>`,
    `    <a class="notfound-cta" href="${primaryHref}">${primaryLabel}</a>`,
    '  </div>',
    '</div>',
  ]

  let html = shell.replace('<div id="root"></div>', bodyLines.join('\n'))
  html = html.replace(/<title>[^<]*<\/title>/,       `<title>Page Not Found | ${siteName}</title>`)
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/s,
    `$1The page you were looking for does not exist.$2`
  )
  html = html.replace(
    /(<meta\s+property="og:title"\s+content=")[^"]*(")/s,
    `$1Page Not Found | ${siteName}$2`
  )
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/s,
    `$1${siteUrl}/$2`
  )
  // noindex -- 404 pages should not appear in search results
  // Remove existing robots meta first to avoid duplicate, then insert noindex
  html = html.replace(
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/s,
    ''
  )
  html = html.replace(
    '<meta name="author"',
    '<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />\n  <meta name="author"'
  )
  // Strip the React bundle -- 404 is pure static HTML, no React needed
  html = html.replace(/<script type="module"[^>]*><\/script>/, '')

  return html
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function prerender() {
  console.log('\n[prerender] Starting static HTML generation...')

  const { createServer }   = await import('vite')
  const { renderToString } = await import('react-dom/server')
  const React              = (await import('react')).default
  const { StaticRouter }   = await import('react-router-dom')

  // Vite dev server in SSR mode.
  // ssrLoadModule resolves all imports through Vite's unified module registry,
  // guaranteeing a single react-router-dom instance. StaticRouter's location
  // context reaches useLocation() inside Routes correctly.
  const vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    // Inline alias: react-router-dom → the CJS-interop shim
    // (prerender/rr-shim.mjs). Vite's SSR module runner cannot take named
    // exports from react-router-dom v7's Node (CJS) entry ("Named export
    // 'useLocation' not found"), so the shim does the interop via
    // createRequire. This MUST live here, not in vite.config.ts: the config
    // file is shared with the browser build/dev server, where the shim's own
    // `await import('react-router-dom')` would re-enter the alias, go
    // circular, and render nothing.
    resolve: {
      alias: [
        {
          find: 'react-router-dom',
          replacement: path.resolve(ROOT, 'prerender/rr-shim.mjs'),
        },
      ],
    },
    customLogger: {
      info:           () => {},
      warn:           (msg) => { if (!msg.includes('ExperimentalWarning')) process.stderr.write('[prerender:warn] ' + msg + '\n') },
      error:          (msg) => process.stderr.write('[prerender:err] '  + msg + '\n'),
      clearScreen:    () => {},
      hasErrorLogged: () => false,
      hasWarned:      false,
      warnOnce:       () => {},
    },
  })

  try {
    const { default: AppLayout } = await vite.ssrLoadModule(appLayoutPath)
    
    // Validate dist/index.html exists (vite build may have failed)
    const indexPath = path.join(DIST, 'index.html')
    if (!fs.existsSync(indexPath)) {
      console.error('[prerender] dist/index.html not found -- run vite build first')
      process.exit(0)
    }
    
    const shell     = fs.readFileSync(indexPath, 'utf-8')
    let succeeded   = 0

    // Fingerprint the shell this run renders against. Cached route HTML
    // embeds the hashed asset filenames of the build it was rendered in;
    // after a new `vite build` those files no longer exist, so a cache
    // keyed by route alone would restore a page whose <script> tags 404 —
    // the page looks correct in text checks and renders NOTHING in a
    // browser. Entries whose shellHash differs (or predates the field)
    // are re-rendered instead of restored.
    const shellHash = crypto.createHash('sha256').update(shell).digest('hex').slice(0, 16)

    for (const route of ROUTES) {
      // Incremental: skip if cached for THIS shell and not --force
      const cachedEntry = !FORCE && cache[route.path]
      if (cachedEntry && cachedEntry.shellHash === shellHash) {
        const cachedHtml = cachedEntry.html
        
        if (route.path === '/') {
          fs.writeFileSync(path.join(DIST, 'index.html'), cachedHtml, 'utf-8')
        } else {
          const dir = path.join(DIST, route.path.slice(1))
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, 'index.html'), cachedHtml, 'utf-8')
        }
        
        console.log(`[prerender] ◯ ${route.path} (cached)`)
        succeeded++
        continue
      }
      
      // Render fresh
      try {
        const appHtml = renderToString(
          // The router WRAPS AppLayout: StaticRouter owns the location
          // context that AppLayout's useLocation/Routes consume. Passing the
          // router as a child of AppLayout would render outside the context
          // ("useLocation may be used only in the context of a <Router>").
          React.createElement(
            StaticRouter,
            { location: route.path },
            React.createElement(AppLayout),
          )
        )

        let html = shell.replace(
          '<div id="root"></div>',
          `<div id="root" data-server-rendered="true">${appHtml}</div>`
        )

        html = injectMeta(html, route.meta || {}, route.path)

        // Save to cache, stamped with the shell it was rendered against
        cache[route.path] = { html, shellHash, time: Date.now() }

        if (route.path === '/') {
          fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf-8')
        } else {
          const dir = path.join(DIST, route.path.slice(1))
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
        }

        console.log(`[prerender] ✓ ${route.path}`)
        succeeded++
      } catch (err) {
        console.error(`[prerender] ✗ ${route.path}: ${err.message}`)
      }
    }

    // Save cache
    writeCache(cache)

    // 404.html -- CF Pages serves this for all unmatched routes with HTTP 404
    fs.writeFileSync(path.join(DIST, '404.html'), generate404(shell), 'utf-8')
    console.log('[prerender] ✓ /404.html')

    // sitemap.xml -- overwrites the static one in public/ with today's date
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), generateSitemap(ROUTES), 'utf-8')
    console.log('[prerender] ✓ /sitemap.xml')

    console.log(`[prerender] Done. ${succeeded}/${ROUTES.length} pages rendered.\n`)

    // Integrity tripwire: every asset reference in a written page must exist
    // in dist/. This failure mode (HTML pointing at chunks from an older
    // build) ships a page that renders nothing and is invisible to text
    // checks — so unlike SSR failures, it FAILS the build rather than
    // degrading to a plain SPA, because a plain SPA is a working site and
    // this is not.
    const pageFiles = [
      path.join(DIST, 'index.html'),
      ...ROUTES.filter(r => r.path !== '/').map(r => path.join(DIST, r.path.slice(1), 'index.html')),
    ]
    const missing = []
    for (const file of pageFiles) {
      if (!fs.existsSync(file)) continue
      const html = fs.readFileSync(file, 'utf-8')
      for (const m of html.matchAll(/assets\/[A-Za-z0-9._-]+/g)) {
        if (!fs.existsSync(path.join(DIST, m[0]))) missing.push(`${path.relative(DIST, file)} → ${m[0]}`)
      }
    }
    if (missing.length) {
      console.error('[prerender] BROKEN OUTPUT — pages reference assets that do not exist:')
      for (const m of missing) console.error('  ' + m)
      console.error('[prerender] Delete .prestruct/cache and rebuild.')
      process.exit(1)
    }
    console.log('[prerender] Asset references verified against dist/.')

  } finally {
    await vite.close()
  }
}

prerender().catch(err => {
  // Fail gracefully -- log the error but exit 0 so CF Pages deploy continues
  // as a plain SPA rather than failing entirely
  console.warn('[prerender] Fatal -- deploying as SPA:', err.message)
  process.exit(0)
})

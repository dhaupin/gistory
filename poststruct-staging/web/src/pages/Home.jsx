/**
 * pages/Home.jsx - poststruct's landing. Shell conventions kept (see the
 * flowforge rig README): usePageMeta lives in the component BODY (calling it
 * inside another effect was an invalid hook call - React #321 tore the tree
 * down on the live crashtest site; transcribed fix, see labs/TASKS.md), the
 * .code pre carries the token classes the docs Rouge output shares (.k/.cm),
 * and CTAs compose .btn + a color modifier (the base class carries geometry).
 */
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://poststruct.creadev.org'

export default function Home() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/',
    title: 'poststruct - audit what shipped',
    description: 'A zero-dependency CLI that walks baked HTML and verifies head, links, and site hygiene against a contract - FAIL findings exit non-zero so CI gates regressions.',
  })
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">poststruct</p>
          <h1>
            Audit <span className="accent">what shipped.</span>
          </h1>
          <p className="lede">
            A zero-dependency CLI that walks a directory of baked HTML and
            verifies it against a head/site contract. FAIL findings exit
            non-zero - <strong>CI gates regressions, not vibes.</strong>
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="https://github.com/dhaupin/poststruct">See the repo</a>
            <a className="btn btn-ghost" href="https://docs.creadev.org/poststruct/">Read the docs</a>
          </div>
          <pre className="code"><span className="cm"># walk the built output; one human line per finding</span>{'\n'}<span className="k">npx</span> poststruct audit dist/{'\n'}<span className="cm"># machine output for CI: {"{"}schema: 1, counts, findings{"}"}</span>{'\n'}<span className="k">npx</span> poststruct audit dist/ <span className="k">--json</span>{'\n'}<span className="cm"># pack lane: the defaults audit runs over the repo's own packstruct</span>{'\n'}<span className="k">npx</span> poststruct lint-packs <span className="k">--deep</span></pre>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>What the two lenses see</h2>
          <p className="sub">The family sits in a line: prestruct puts SEO in before the build (source-time), freestruct injects after an SSG, and poststruct verifies the baked artifact that both of them (and everyone else) actually shipped.</p>
          <div className="grid">
            <div className="card">
              <h3><span className="glyph">1</span>head module</h3>
              <p>Per page: title and description present in their length bands, canonical absolute, the OG(7) and Twitter(4) sets, og:image raster-format (an SVG og:image FAILs), JSON-LD that parses plus recommended LocalBusiness fields, h1 sanity. A 404 keeps only its noindex contract.</p>
            </div>
            <div className="card">
              <h3><span className="glyph">2</span>site module</h3>
              <p>sitemap.xml exists and carries real lastmod entries; robots.txt points at the sitemap with a Sitemap directive. Site-level hygiene the per-page walk cannot see.</p>
            </div>
            <div className="card">
              <h3><span className="glyph">3</span>packs lane</h3>
              <p>The pack runs as the discoverable wrapper verb lint-packs, riding the repo's own packstruct install with an exact pin; the conform leg proves the loader itself conforms. Future shape packs keep landing per the PRD.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

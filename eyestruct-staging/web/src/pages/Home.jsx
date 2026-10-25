/**
 * pages/Home.jsx - the shell's placeholder landing. Replace the copy, keep
 * the structure: usePageMeta lives in the component BODY (calling it inside
 * another effect was an invalid hook call - React #321 tore the tree down on
 * the live crashtest site; transcribed fix, see labs/TASKS.md), the .code
 * pre carries the token classes the docs Rouge output shares (.k/.cm), and
 * CTAs compose .btn + a color modifier (the base class carries geometry).
 */
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://flowforge.creadev.org'

export default function Home() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/',
    title: 'flowforge - the shell the struct family ships sites from',
    description: 'One repo, two sites, zero styling drift: the landing shell, the docs rig, and the CI/release plumbing the struct family ships from, with brand as data.',
  })
  return (
    <section className="hero">
      <div className="wrap">
        <p className="eyebrow">flowforge shell</p>
        <h1>
          One repo, two sites, <span className="accent">zero styling drift.</span>
        </h1>
        <p className="lede">
          This is the flowforge rig: landing + docs + CI/release plumbing, with your
          brand as data. Replace the tokens, the nav vocabulary, and the copy - the
          shell carries the paid-for correctness (prerender, hydration parity,
          light/dark switch, search, pagefind, deploy workflows).
        </p>
        <div className="cta-row">
          <a className="btn btn-primary" href="https://github.com/dhaupin/flowforge">See the repo</a>
          <a className="btn btn-ghost" href="https://docs.creadev.org/flowforge/">Read the docs</a>
        </div>
        <pre className="code"><span className="cm"># 60 seconds - the shell is real pages, not a prototype</span>{'\n'}npx <span className="k">prestruct</span> <span className="k">build</span>{'\n'}<span className="cm"># {'>'} dist/, one directory per route, hydrates with zero mismatch</span></pre>
      </div>
    </section>
  )
}

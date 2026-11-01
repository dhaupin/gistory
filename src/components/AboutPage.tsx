// AboutPage — "/about", prerendered for SEO.
//
// In the AppLayout graph, so it renders in Node during prerender: static
// content only, no browser APIs at render time. States who builds Gistory,
// the struct family it belongs to, and the license and provenance terms.

import Footer from './Footer'

export default function AboutPage() {
  return (
    <div className="legal-page">
      <header className="lander-nav">
        <a href="/" className="lander-brand">Gistory</a>
        <nav className="lander-nav-links">
          <a href="/" className="lander-link">Home</a>
          <a href="/why" className="lander-link">Why</a>
          <a href="/what" className="lander-link">What it is</a>
          <a href="#/" className="btn btn-primary btn-small lander-cta">Open the app</a>
        </nav>
      </header>

      <article className="legal-body">
        <h1>About</h1>
        <p className="legal-updated">Who builds Gistory, and the terms it ships under</p>

        <p>
          Gistory is a personal prompt manager and AI prompt library: every prompt
          you write, kept, found, and filled in. It is built in the open by
          Creadev.org and by AI agents working in public.
        </p>

        <h2>Who builds it</h2>
        <p>
          Gistory is built by{' '}
          <a href="https://creadev.org" target="_blank" rel="noopener">Creadev.org</a>{' '}
          and by AI agents working in the open. Every change lands through a pull
          request with its gates run, and the repository history keeps the receipts.
        </p>

        <h2>The struct family</h2>
        <p>
          Gistory does not stand alone. The spec is packstruct; the artifact audit
          is poststruct; the adversarial lane is crashtest; the visual memory is
          eyestruct; the governance layer is govstruct. The family shares one pack
          grammar and one status contract, so a disagreement is provable rather
          than debated.
        </p>

        <h2>License and provenance</h2>
        <p>
          Gistory is open source under MIT. The code and the prompts it keeps are
          both yours, so the honest summary is: read the code. The{' '}
          <a href="/terms">terms</a> and <a href="/privacy">privacy</a> pages carry
          the surface facts in plain language, and the source lives on{' '}
          <a href="https://github.com/dhaupin/gistory" target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
      </article>

      <Footer />
    </div>
  )
}

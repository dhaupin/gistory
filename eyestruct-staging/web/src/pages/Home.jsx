/**
 * pages/Home.jsx - eyestruct's landing. Shell conventions kept (see the
 * flowforge rig README): usePageMeta lives in the component BODY (calling it
 * inside another effect was an invalid hook call - React #321 tore the tree
 * down on the live crashtest site; transcribed fix, see labs/TASKS.md), the
 * .code pre carries the token classes the docs Rouge output shares (.k/.cm),
 * and CTAs compose .btn + a color modifier (the base class carries geometry).
 */
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://eyestruct.creadev.org'

export default function Home() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/',
    title: 'eyestruct - eyes for production agents',
    description: 'Deterministic look and look-diff with a committed visual memory (.eyes/) that CI can gate. Process-per-look: every command is one short invocation; the only surviving state is git state.',
  })
  return (
    <section className="hero">
      <div className="wrap">
        <p className="eyebrow">eyestruct</p>
        <h1>
          Eyes for production agents, <span className="accent">gated like code.</span>
        </h1>
        <p className="lede">
          Look is one short process, never a daemon: capture into a committed
          .eyes/ memory, diff pixel drift under the ledger, and let CI refuse
          an unexplained change - the crashtest ledger pattern aimed at
          appearance instead of attackability.
        </p>
        <div className="cta-row">
          <a className="btn btn-primary" href="https://github.com/dhaupin/eyestruct">See the repo</a>
          <a className="btn btn-ghost" href="https://docs.creadev.org/eyestruct/">Read the docs</a>
        </div>
        <pre className="code"><span className="cm"># every look is one short invocation. the only surviving state is git state.</span>{'\n'}<span className="k">eyestruct</span> <span className="k">look</span> http://localhost:4173/{'\n'}<span className="cm"># drift becomes a ledger row; the reviewer is the next session, the UI is git diff</span>{'\n'}<span className="k">eyestruct</span> <span className="k">diff</span>{'\n'}<span className="cm"># CI refuses what no note explains - canon baselines are CI-cut</span>{'\n'}<span className="k">eyestruct</span> <span className="k">walk</span> http://localhost:4173/</pre>
      </div>
    </section>
  )
}

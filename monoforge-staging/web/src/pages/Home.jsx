/**
 * pages/Home.jsx - monoforge's landing. Shell conventions kept (see the
 * flowforge rig README): usePageMeta lives in the component BODY (calling it
 * inside another effect was an invalid hook call - React #321 tore the tree
 * down on the live crashtest site; transcribed fix, see labs/TASKS.md), the
 * .code pre carries the token classes the docs Rouge output shares (.k/.cm),
 * and CTAs compose .btn + a color modifier (the base class carries geometry).
 */
import usePageMeta from '../hooks/usePageMeta.js'

const SITE_URL = 'https://monoforge.creadev.org'

export default function Home() {
  usePageMeta({
    siteUrl: SITE_URL,
    path: '/',
    title: 'monoforge - the fleet factory',
    description: 'Stamp a repo from proven template blocks, doctor it for truth, lock it verifiably. Generated green is never shipped: the doctor refuses unfilled FORGE-TODO slots.',
  })
  return (
    <section className="hero">
      <div className="wrap">
        <p className="eyebrow">monoforge</p>
        <h1>
          The Actively <span className="accent">Designed Future.</span>
        </h1>
        <p className="lede">
          The struct-family factory: stamp a fleet repo from proven template
          blocks, doctor it for truth, lock it verifiably. The doctor refuses
          unfilled FORGE-TODO slots - <strong>generated green is never
          shipped.</strong>
        </p>
        <div className="cta-row">
          <a className="btn btn-primary" href="https://github.com/dhaupin/monoforge">See the repo</a>
          <a className="btn btn-ghost" href="https://docs.creadev.org/monoforge/">Read the docs</a>
        </div>
        <pre className="code"><span className="cm"># every verb is one short invocation; the factory never ships a placeholder</span>{'\n'}<span className="k">monoforge</span> <span className="k">new</span> ./my-tool{'\n'}<span className="cm"># the truth battery: unfilled FORGE-TODO slots are failures, not warnings</span>{'\n'}<span className="k">monoforge</span> <span className="k">doctor</span> ./my-tool{'\n'}<span className="cm"># doctor must pass first; then the lock receipts the green tree</span>{'\n'}<span className="k">monoforge</span> <span className="k">lock</span> ./my-tool</pre>
      </div>
    </section>
  )
}

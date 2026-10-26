/**
 * pages/Terms.jsx - eyestruct's terms. Short by design: the license (MIT)
 * and the repo carry the real legal weight; this page states the surface
 * facts in plain language.
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

export default function Terms() {
  usePageMeta({
    path: '/terms',
    title: 'Terms | eyestruct',
    description: 'Terms of use for eyestruct and this site.',
  })
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="wrap legal">
        <h1>Terms</h1>
        <p>
          eyestruct is MIT-licensed software; the license in the repository
          governs use of the tool. This site is documentation: it is provided
          as-is, without warranty of any kind, and nothing here is an offer,
          a contract, or support.
        </p>
        <p>
          The tool captures screenshots only of URLs you point it at, stores
          them where you commit them, and sends nothing anywhere on its own.
          Baseline images can carry whatever your pages render - treat
          committed .eyes/ artifacts as content you chose to store.
        </p>
        <p style={{ marginTop: 26 }}>
          <Link to="/" className="btn btn-ghost">Back home</Link>
        </p>
      </div>
    </section>
  )
}

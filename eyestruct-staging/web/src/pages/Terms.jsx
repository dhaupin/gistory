/**
 * pages/Terms.jsx - legal placeholder. Deliberately blank except the h1 so
 * each adopter writes their own copy against the .legal styles (see crashtest
 * web/src/pages/Terms.jsx for the filled-in family example).
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

export default function Terms() {
  usePageMeta({
    path: '/terms',
    title: 'Terms | flowforge',
    description: 'Terms of use for the flowforge shell and this site.',
  })
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="wrap legal">
        <h1>Terms</h1>
        <p style={{ marginTop: 26 }}>
          <Link to="/" className="btn btn-ghost">Back home</Link>
        </p>
      </div>
    </section>
  )
}

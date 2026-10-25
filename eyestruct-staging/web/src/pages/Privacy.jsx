/**
 * pages/Privacy.jsx - legal placeholder. Deliberately blank except the h1 so
 * each adopter writes their own copy against the .legal styles (see crashtest
 * web/src/pages/Privacy.jsx for the filled-in family example).
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

export default function Privacy() {
  usePageMeta({
    path: '/privacy',
    title: 'Privacy | flowforge',
    description: 'What this site collects: nothing hidden, no tracking states to find.',
  })
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="wrap legal">
        <h1>Privacy</h1>
        <p style={{ marginTop: 26 }}>
          <Link to="/" className="btn btn-ghost">Back home</Link>
        </p>
      </div>
    </section>
  )
}

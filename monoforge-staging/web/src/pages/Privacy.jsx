/**
 * pages/Privacy.jsx - monoforge's privacy statement. The tool is local-first:
 * there is no server to collect anything, and this page keeps the same
 * honesty for the site itself.
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

export default function Privacy() {
  usePageMeta({
    path: '/privacy',
    title: 'Privacy | monoforge',
    description: 'What this site collects: nothing. No server, no accounts, no hidden states to find.',
  })
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="wrap legal">
        <h1>Privacy</h1>
        <p>
          monoforge runs on your machine. It has no server, no accounts, and
          no telemetry: stamped trees and locks live in your directories, and
          the factory's only artifacts are the ones you commit yourself.
        </p>
        <p>
          This site collects nothing. Pages are static files; there are no
          tracking states to find, no cookies, and no forms.
        </p>
        <p style={{ marginTop: 26 }}>
          <Link to="/" className="btn btn-ghost">Back home</Link>
        </p>
      </div>
    </section>
  )
}

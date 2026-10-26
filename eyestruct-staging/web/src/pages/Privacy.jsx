/**
 * pages/Privacy.jsx - eyestruct's privacy statement. The tool is local-first:
 * there is no server to collect anything, and this page keeps the same
 * honesty for the site itself.
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

export default function Privacy() {
  usePageMeta({
    path: '/privacy',
    title: 'Privacy | eyestruct',
    description: 'What this site collects: nothing. No server, no accounts, no hidden states to find.',
  })
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="wrap legal">
        <h1>Privacy</h1>
        <p>
          eyestruct runs on your machine. It has no server, no accounts, and
          no telemetry: captures are stored where you commit them (your
          .eyes/ directory, your git history), and the only state that
          survives between looks is git state.
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

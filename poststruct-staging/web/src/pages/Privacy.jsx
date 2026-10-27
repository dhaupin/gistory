/**
 * pages/Privacy.jsx - poststruct's privacy statement, in the family's
 * plain-language shape (crashtest + packstruct canon). The tool is
 * local-first: files on disk, no server, no accounts, no telemetry - and
 * this page keeps the same honesty for the site itself.
 */
import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

export default function Privacy() {
  usePageMeta({
    path: '/privacy',
    title: 'Privacy | poststruct',
    description: 'What poststruct and this site collect: the CLI collects nothing, audits read your own build output, and the site tracks nothing hidden.',
  })
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="wrap legal">
        <p className="eyebrow">The short version first</p>
        <h1>Privacy</h1>
        <p className="sub">
          The CLI collects <strong>nothing</strong>. Audits read build output
          from your disk - your source and findings never leave your machine.
          This site keeps its own honesty standard: no hidden state, no
          silent tracking - just docs.
        </p>

        <h3>The poststruct tool</h3>
        <ul>
          <li><strong>No telemetry</strong> - the CLI collects zero data, makes no network calls, phones no home. Audits walk the directory you point them at, on disk</li>
          <li><strong>Your findings stay yours</strong> - reports and JSON output are yours to commit or discard; nothing ships anywhere on its own</li>
          <li><strong>Core law holds</strong> - files on disk only: no SPA runtime, no scraping, no source linting</li>
          <li><strong>npm install traffic</strong> - npm's own registry logging applies, as with any package; we see none of it</li>
        </ul>

        <h3>This website</h3>
        <ul>
          <li><strong>No accounts, no forms, no in-browser state</strong> - information is not collected about you</li>
          <li><strong>Standard hosting logs</strong> - Cloudflare Pages may keep request logs (IP, timestamp); we neither buy, query, nor sell them</li>
          <li><strong>Analytics</strong> - none configured; if a hosting-added beacon is ever enabled by zone policy, it will be listed here rather than hiding</li>
          <li><strong>Cookies</strong> - none set by us; one browser-local preference only: your light/dark theme choice, saved under a localStorage key. It never leaves the browser</li>
        </ul>

        <h3>Third parties, named</h3>
        <p>
          This site runs on{' '}
          <a href="https://pages.cloudflare.com" target="_blank" rel="noopener">Cloudflare Pages</a>; the
          npm package lives on{' '}
          <a href="https://www.npmjs.com" target="_blank" rel="noopener">npmjs.com</a>.
          Their own policies govern their own logging. No other third parties
          are involved.
        </p>

        <h3>Data retention</h3>
        <p>
          Nothing of yours to retain. Your audits, fixtures, and reports stay
          in your repos, not ours.
        </p>

        <h3>Questions</h3>
        <p>
          Open an issue on the{' '}
          <a href="https://github.com/dhaupin/poststruct" target="_blank" rel="noopener">repository</a> -
          it is checked. If you want to inspect rather than ask: the CLI and
          the site are both open source, so treat this page as a summary of
          code you can go read.
        </p>

        <p style={{ marginTop: 26 }}>
          <Link to="/" className="btn btn-ghost">Back to the audit</Link>
        </p>
      </div>
    </section>
  )
}

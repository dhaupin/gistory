// Lander — the public homepage at "/", prerendered for SEO.
//
// This component is in the AppLayout graph, which prerender.js renders in
// Node: no window/localStorage at render time, no browser-only imports.
// Everything below is static content, so crawlers see the full pitch without
// running JavaScript.

import { Copy, Cloud, Tags, GitFork, Command, ShieldCheck, FileClock, Lock, Star, Check, ArrowRight } from 'lucide-react'

const FEATURES = [
  {
    icon: <Copy size={18} />,
    title: 'Copy prompts filled in',
    body: 'Write a prompt with {{variable}} placeholders once. Copying it opens a fill-in dialog, so the prompt arrives in your AI chat ready to run — no manual find-and-replace.',
  },
  {
    icon: <Cloud size={18} />,
    title: 'End-to-end encrypted sync',
    body: 'Your passphrase never leaves your devices. The relay stores AES-GCM ciphertext it cannot read, and every device in your chain converges on the same library.',
  },
  {
    icon: <Tags size={18} />,
    title: 'Tags, projects, and search',
    body: 'Tag prompts, group them into projects, drag them into the order that makes sense to you, and find any of it instantly from the header search or the Cmd+K palette.',
  },
  {
    icon: <GitFork size={18} />,
    title: 'Fork and iterate',
    body: 'Any prompt can be forked into a child copy — original stays put, the variant gets its own id and version, and both stay linked so you can trace lineage.',
  },
  {
    icon: <FileClock size={18} />,
    title: 'Timestamps you can trace',
    body: 'Created and edited times are shown in the time zone you choose and synced across devices, so a prompt can be matched back to the conversation that produced it.',
  },
  {
    icon: <Command size={18} />,
    title: 'Keyboard-first',
    body: 'Cmd/Ctrl+K opens a command palette that jumps to any prompt or project and creates new ones straight from the search box. Arrow keys reorder without a mouse.',
  },
]

const STEPS = [
  {
    title: 'Write or paste your prompt',
    body: 'A thread holds one prompt — or a whole conversation of variations. Mark drafts, archive the retired ones, pin the workhorses to the top.',
  },
  {
    title: 'Fill the variables, copy, run',
    body: 'Placeholders like {{language}} or {{codebase}} become a small form when you copy. The filled prompt lands on your clipboard, ready for any AI tool.',
  },
  {
    title: 'Sync everywhere, own the data',
    body: 'Pair phones and laptops with a QR code. Export a full JSON backup any time from Settings — your library is never locked in.',
  },
]

export default function Lander() {
  return (
    <div className="lander">
      <header className="lander-nav">
        <span className="lander-brand">Gistory</span>
        <nav className="lander-nav-links">
          <a href="/terms" className="lander-link">Terms</a>
          <a href="/privacy" className="lander-link">Privacy</a>
          <a href="#/" className="btn btn-primary btn-small lander-cta">
            Open the app <ArrowRight size={14} />
          </a>
        </nav>
      </header>

      <section className="lander-hero">
        <p className="lander-kicker">Your prompts, remembered</p>
        <h1 className="lander-headline">
          Every prompt you write,<br />kept, found, and <em>filled in</em>.
        </h1>
        <p className="lander-sub">
          Gistory is a personal prompt manager. Write a prompt once, tag it, find it in
          a keystroke, and copy it with the variables filled in. Sync is end-to-end
          encrypted — the server stores ciphertext it cannot read.
        </p>
        <div className="lander-actions">
          <a href="#/" className="btn btn-primary">Open Gistory — it's free</a>
          <a href="#features" className="btn btn-secondary">See what it does</a>
        </div>
        <ul className="lander-checks">
          <li><Check size={13} /> No account required</li>
          <li><Check size={13} /> Works offline</li>
          <li><Check size={13} /> Your data stays yours</li>
        </ul>
      </section>

      <section className="lander-section" id="features">
        <h2 className="lander-section-title">Built for people who reuse prompts</h2>
        <div className="lander-grid">
          {FEATURES.map(f => (
            <article key={f.title} className="lander-card">
              <span className="lander-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lander-section lander-alt">
        <h2 className="lander-section-title">How it works</h2>
        <ol className="lander-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lander-step">
              <span className="lander-step-num">{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lander-section">
        <h2 className="lander-section-title">Sync that stays out of your data</h2>
        <div className="lander-trust">
          <div className="lander-trust-item">
            <Lock size={18} />
            <div>
              <h3>The server is blind</h3>
              <p>Blobs are AES-GCM encrypted on your device with a key derived from your passphrase and chain id. The relay sequences and stores them without the ability to read a byte.</p>
            </div>
          </div>
          <div className="lander-trust-item">
            <ShieldCheck size={18} />
            <div>
              <h3>Write access needs a secret</h3>
              <p>Each chain carries a write secret the server only ever sees hashed, so nobody who knows a chain id can append junk to it.</p>
            </div>
          </div>
          <div className="lander-trust-item">
            <Star size={18} />
            <div>
              <h3>Backups are one click</h3>
              <p>Sync keeps the newest snapshots per chain; a full JSON export from Settings is your real archive, and Gistory nudges you when it goes stale.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lander-section lander-alt lander-final">
        <h2 className="lander-section-title">Stop re-typing the prompt that already worked.</h2>
        <p className="lander-sub">
          Open Gistory, write your first prompt, and keep it forever.
        </p>
        <div className="lander-actions">
          <a href="#/" className="btn btn-primary">Open the app <ArrowRight size={15} /></a>
        </div>
      </section>

      <footer className="lander-footer">
        <span>© {new Date().getFullYear()} Gistory</span>
        <span className="lander-footer-divider">·</span>
        <a href="/terms">Terms</a>
        <span className="lander-footer-divider">·</span>
        <a href="/privacy">Privacy</a>
        <span className="lander-footer-divider">·</span>
        <a href="https://github.com/dhaupin/gistory" target="_blank" rel="noopener noreferrer">Source</a>
      </footer>
    </div>
  )
}

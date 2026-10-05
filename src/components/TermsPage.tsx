// TermsPage — "/terms", prerendered for SEO.
//
// In the AppLayout graph, so it renders in Node during prerender: static
// content only, no browser APIs at render time.

export default function TermsPage() {
  return (
    <div className="legal-page">
      <header className="lander-nav">
        <a href="/" className="lander-brand">Gistory</a>
        <nav className="lander-nav-links">
          <a href="/" className="lander-link">Home</a>
          <a href="/privacy" className="lander-link">Privacy</a>
          <a href="#/" className="btn btn-primary btn-small lander-cta">Open the app</a>
        </nav>
      </header>

      <article className="legal-body">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: October 5, 2026</p>

        <p>
          Welcome to Gistory. These terms govern your use of the Gistory prompt manager
          web application (the "Service"). By using the Service you agree to them. If
          you do not agree, do not use the Service.
        </p>

        <h2>1. What Gistory is</h2>
        <p>
          Gistory is a browser-based tool for storing, organizing, and reusing text
          prompts. It runs in your browser, can store data in your browser's local
          storage, and can replicate that data — encrypted — across your own devices
          through the Service's relay infrastructure.
        </p>

        <h2>2. Your data and your content</h2>
        <ul>
          <li>
            <strong>You own your content.</strong> Prompts, tags, projects, and other
            data you create remain yours. Gistory claims no license to use, publish,
            or train on it.
          </li>
          <li>
            <strong>Encryption.</strong> When sync is enabled, your data is encrypted
            on your device before it reaches the Service. The Service stores this
            ciphertext without the ability to decrypt it. You are responsible for your
            passphrase: it never leaves your devices, and there is no reset — losing it
            means losing access to the synced data.
          </li>
          <li>
            <strong>Retention is limited.</strong> The sync relay keeps only a rolling
            window of the newest snapshots per sync chain (currently five). Older
            snapshots are pruned automatically. Downloads from Settings → Snapshot are
            your durable backups; the Service explicitly nudges you when one is stale.
          </li>
          <li>
            <strong>Deletion is permanent.</strong> Deleting a prompt or thread on any
            synced device removes it everywhere and records a tombstone. There is no
            trash-restore: the recently-deleted log is a record, not a recovery tool.
          </li>
        </ul>

        <h2>3. Acceptable use</h2>
        <ul>
          <li>Do not use the Service to store or distribute content that is unlawful where you live.</li>
          <li>Do not attempt to access, modify, or disrupt other users' data, sync chains, or the relay infrastructure.</li>
          <li>Do not use the relay for purposes unrelated to the Service, such as using it as a general-purpose message queue or file store.</li>
          <li>Automated abuse — flooding the relay, enumerating chain ids, or attempting to guess write secrets — is prohibited and will be rate-limited or blocked.</li>
        </ul>

        <h2>4. Availability and changes</h2>
        <p>
          The Service is provided as-is and may change, pause, or end at any time.
          Because your primary copy lives in your browser and your exports live with
          you, ending the Service does not end your access to your data. Features may
          be added or removed; material changes to these terms will be reflected in
          the "last updated" date above.
        </p>

        <h2>5. Disclaimers and limitation of liability</h2>
        <p>
          The Service is provided "as is" and "as available", without warranties of
          any kind, express or implied, including merchantability and fitness for a
          particular purpose. To the maximum extent permitted by law, Gistory's
          operators are not liable for any indirect, incidental, or consequential
          damages, nor for data loss beyond what the Service's documented retention
          behavior explains. You are responsible for keeping backups.
        </p>

        <h2>6. Termination</h2>
        <p>
          You can stop using the Service at any time; local data remains in your
          browser until you clear it, and exports remain yours. We may suspend or
          terminate access for violation of these terms, or for technical reasons
          such as sustained abuse of the relay.
        </p>

        <h2>7. Contact</h2>
        <p>
          Questions about these terms can be raised as an issue on the project's
          source repository.
        </p>
      </article>

      <footer className="lander-footer">
        <span>© {new Date().getFullYear()} Gistory</span>
        <span className="lander-footer-divider">·</span>
        <a href="/terms">Terms</a>
        <span className="lander-footer-divider">·</span>
        <a href="/privacy">Privacy</a>
      </footer>
    </div>
  )
}

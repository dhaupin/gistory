// PrivacyPage — "/privacy", prerendered for SEO.
//
// In the AppLayout graph, so it renders in Node during prerender: static
// content only, no browser APIs at render time.

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <header className="lander-nav">
        <a href="/" className="lander-brand">Gistory</a>
        <nav className="lander-nav-links">
          <a href="/" className="lander-link">Home</a>
          <a href="/terms" className="lander-link">Terms</a>
          <a href="#/" className="btn btn-primary btn-small lander-cta">Open the app</a>
        </nav>
      </header>

      <article className="legal-body">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: October 5, 2026</p>

        <p>
          Gistory is built so that the Service <strong>cannot</strong> read your data,
          even though the Service operates the infrastructure that carries it. This
          policy explains exactly what is stored, what is not, and why.
        </p>

        <h2>The short version</h2>
        <ul>
          <li>No account. No email address. No name. Nothing to delete, because almost nothing is collected.</li>
          <li>Your prompts are encrypted on your device; the server stores unreadable ciphertext.</li>
          <li>Your passphrase never leaves your devices and cannot be recovered by anyone.</li>
          <li>No analytics, no tracking pixels, no advertising, no cookies for profiling.</li>
        </ul>

        <h2>What the Service stores</h2>
        <p>When sync is enabled, the relay stores:</p>
        <ul>
          <li>
            <strong>Encrypted blobs.</strong> Your prompts and metadata, encrypted on
            your device with AES-GCM using a key derived from your passphrase and a
            chain identifier. The Service has no key material and cannot decrypt any
            of it.
          </li>
          <li>
            <strong>A sync chain id</strong> — a random identifier that groups your
            devices together.
          </li>
          <li>
            <strong>Device registrations</strong> — for each paired device, a random
            device id, a name you choose (or a generated one), and a last-seen time.
          </li>
          <li>
            <strong>A write-secret digest</strong> — a SHA-256 hash used to authorize
            writes. The secret itself stays on your devices; the server cannot reverse
            the hash.
          </li>
          <li>
            <strong>Sequence numbers and timestamps</strong> needed to order sync
            operations.
          </li>
        </ul>

        <h2>What the Service never stores or sees</h2>
        <ul>
          <li>Your passphrase — it never leaves your device.</li>
          <li>Your decryption key — derived locally, transmitted nowhere.</li>
          <li>Plaintext content — every byte the relay holds is ciphertext.</li>
          <li>Email addresses, payment details, or identity documents — the Service does not ask for them.</li>
        </ul>

        <h2>Data stored in your browser</h2>
        <p>
          Without sync, everything lives only in your browser's local storage: your
          prompts, settings, sort preference, and draft text. Clearing site data in
          your browser erases it permanently. Enabling sync replicates it (encrypted)
          to your other paired devices.
        </p>

        <h2>Third parties</h2>
        <p>
          The Service runs on Cloudflare Pages and Cloudflare D1. Cloudflare may
          process standard request metadata (IP addresses, user agents) as part of
          serving and protecting the site, under its own privacy policy. Gistory adds
          no analytics scripts, no font CDNs, no third-party trackers, and no
          advertising of any kind.
        </p>

        <h2>Children</h2>
        <p>
          The Service is a general-purpose text tool and does not knowingly collect
          personal information from anyone, including children under 13. There is no
          account system through which personal information could be collected.
        </p>

        <h2>Your rights and choices</h2>
        <ul>
          <li><strong>Access and export:</strong> use Settings → Snapshot → Export All Data at any time to download a complete JSON copy.</li>
          <li><strong>Delete:</strong> clear site data in your browser, and stop syncing. On the relay, snapshots age out through normal retention (newest five per chain); device registrations for chains that stop checking in are pruned by the weekly maintenance job.</li>
          <li><strong>Rectify:</strong> edit any prompt on any device; the correction syncs everywhere.</li>
        </ul>

        <h2>Security</h2>
        <p>
          The design goal is that a full compromise of the relay database leaks only
          ciphertext. Transport is TLS. Writes require a per-chain secret that the
          server stores only as a hash. Rate limiting, a circuit breaker, and
          structural request validation protect the infrastructure, but the
          fundamental protection is that the stored data is unreadable without a key
          that exists only on your devices.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If this policy changes materially, the "last updated" date above changes
          with it. Because the Service is decentralized by design — your data lives
          with you — policy changes cannot retroactively affect data the Service
          never had.
        </p>

        <h2>Contact</h2>
        <p>Questions about privacy can be raised as an issue on the project's source repository.</p>
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

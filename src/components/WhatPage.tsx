// WhatPage — "/what", prerendered for SEO.
//
// In the AppLayout graph, so it renders in Node during prerender: static
// content only, no browser APIs at render time. States what Gistory is, as
// its parts: the library, the templates, the organization, and the
// end-to-end encrypted sync.

import Footer from './Footer'

export default function WhatPage() {
  return (
    <div className="legal-page">
      <header className="lander-nav">
        <a href="/" className="lander-brand">Gistory</a>
        <nav className="lander-nav-links">
          <a href="/" className="lander-link">Home</a>
          <a href="/why" className="lander-link">Why</a>
          <a href="/about" className="lander-link">About</a>
          <a href="#/" className="btn btn-primary btn-small lander-cta">Open the app</a>
        </nav>
      </header>

      <article className="legal-body">
        <h1>What Gistory is</h1>
        <p className="legal-updated">A personal prompt manager and AI prompt library, in your browser</p>

        <p>
          Gistory is a browser-based tool for writing, organizing, and reusing text
          prompts. It runs entirely on your device: your library lives in your
          browser, and optional sync moves it between your own devices as
          ciphertext. No account is required to use any of it.
        </p>

        <h2>The library</h2>
        <p>
          Every prompt is a saved entry with a title, body, tags, and an optional
          project. Write one once, and it is there to find in a keystroke, copy, or
          fork into a variant instead of starting over.
        </p>

        <h2>The templates</h2>
        <p>
          Prompts carry <code>{'{{variable}}'}</code> placeholders. Copying a prompt
          opens a fill-in form, and Gistory copies the text with every variable
          substituted, so a reusable template becomes a finished prompt in one
          step. Global and per-thread variable pools keep the common values close.
        </p>

        <h2>The organization</h2>
        <p>
          Tags, projects, drag ordering, pinned threads, and forked variants keep a
          growing library navigable. Search covers everything, and usage tracking
          surfaces the prompts you actually reach for.
        </p>

        <h2>The sync</h2>
        <p>
          Multi-device sync is end-to-end encrypted. Devices pair with a passphrase
          and a pairing code instead of an account; prompts are encrypted on your
          device before upload, so the relay stores only blobs it cannot decrypt.
          There is no reset and no recovery: the passphrase never leaves your
          devices, which is the point.
        </p>

        <h2>What it is not</h2>
        <p>
          Not a hosted service that holds your text, and not an analytics product.
          There are no accounts, no tracking, and no third party in the loop when
          you copy a prompt.
        </p>

        <p>
          <a href="/about" className="btn btn-secondary">About the project</a>
        </p>
      </article>

      <Footer />
    </div>
  )
}

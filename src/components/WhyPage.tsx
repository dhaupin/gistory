// WhyPage — "/why", prerendered for SEO.
//
// In the AppLayout graph, so it renders in Node during prerender: static
// content only, no browser APIs at render time. The page states the problem
// Gistory exists to solve: prompts are reusable assets, but they are
// scattered across chats and notes, and the good ones are lost.

import Footer from './Footer'

export default function WhyPage() {
  return (
    <div className="legal-page">
      <header className="lander-nav">
        <a href="/" className="lander-brand">Gistory</a>
        <nav className="lander-nav-links">
          <a href="/" className="lander-link">Home</a>
          <a href="/what" className="lander-link">What it is</a>
          <a href="/about" className="lander-link">About</a>
          <a href="#/" className="btn btn-primary btn-small lander-cta">Open the app</a>
        </nav>
      </header>

      <article className="legal-body">
        <h1>Why Gistory</h1>
        <p className="legal-updated">The problem: good prompts are written once and lost</p>

        <p>
          Prompts are reusable assets. The best one you write this week is worth
          reusing next month, and the version that worked for a hard task is worth
          keeping. Today they live in chat histories, notes apps, and sticky
          documents, and the one you want is never where you left it.
        </p>

        <h2>Scattered across chats and notes</h2>
        <p>
          A chat window forgets nothing but finds nothing: scrolling back through
          months of messages is not a library. Notes apps store the text but know
          nothing about <code>{'{{variables}}'}</code>, so every reuse is a manual
          find-and-replace. Neither is built for the moment you actually want the
          prompt.
        </p>

        <h2>Reuse means retyping</h2>
        <p>
          A prompt with placeholders is a template, and a template should fill in.
          Without that, reuse costs a copy, a paste, and a careful pass over every
          placeholder, which is exactly the friction that stops people reusing the
          good prompt and makes them write a worse one from scratch.
        </p>

        <h2>Sync should not cost your privacy</h2>
        <p>
          The obvious fix, a hosted prompt library, asks you to hand your prompts
          to someone else's server. Gistory keeps them in your browser instead, and
          when you want them on more than one device it replicates ciphertext the
          relay cannot read: no account, no plaintext, no third party holding the
          text you think in.
        </p>

        <p>
          <a href="/what" className="btn btn-secondary">See what Gistory is</a>
        </p>
      </article>

      <Footer />
    </div>
  )
}

// Lander — the public homepage at "/", prerendered for SEO.
//
// This component is in the AppLayout graph, which the prestruct engine renders
// in Node: no window/localStorage at render time, no browser-only imports.
// Everything below is static content, so crawlers see the full pitch without
// running JavaScript. The FAQ accordion is native <details>/<summary> on
// purpose: the answers sit in the prerendered HTML regardless of JS state, so
// crawlers and screen readers see every Q&A while users still get the
// collapsible — and both read from ssr.config.js's FAQ_ITEMS, the same list
// the FAQPage JSON-LD emits, so the schema can't drift from the page.

import { useEffect } from 'react'
import { Copy, Cloud, Tags, GitFork, Command, ShieldCheck, FileClock, Lock, Star, Check, ArrowRight, ChevronDown } from 'lucide-react'
import { FAQ_ITEMS } from '../../ssr.config.js'
import Footer from './Footer'

// One real prompt sample for the Prism treatment (see the effect inside the
// component) — a template literal so the {{placeholders}} survive JSX and the
// prerender byte for byte. Kept out of the step body: users copy it.
const FILL_EXAMPLE = `# weekly digest — one thread
repos: {{repos}}
tone: {{tone}}
---
Summarize the week's issues and PRs for {{repos}} in a {{tone}} tone.
Call out anything that needs a decision, then list the follow-ups.`

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
  // Progressive code styling: Prism (the same prestruct docs carry) highlights
  // the sample block and every slab gets a copy button — browser-only, so the
  // prerendered HTML crawlers see is untouched and Node never sees Prism.
  // Deliberately scoped to .lander: the app shell (ThreadView <pre>) must not
  // get CDN scripts or syntax colors on user prompt text.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const pres = Array.from(document.querySelectorAll('.lander pre'))
    if (!pres.length) return
    let cancelled = false
    const add = (tag: 'link' | 'script', src: string) =>
      new Promise<void>((done, fail) => {
        const el = document.createElement(tag)
        if (tag === 'link') {
          ;(el as HTMLLinkElement).rel = 'stylesheet'
          ;(el as HTMLLinkElement).href = src
        } else {
          ;(el as HTMLScriptElement).src = src
          ;(el as HTMLScriptElement).async = false
        }
        el.onload = () => done()
        el.onerror = () => fail(new Error('failed to load ' + src))
        document.head.appendChild(el)
      })
    Promise.all([
      add('link', 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css'),
      add('script', 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js'),
      add('script', 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js'),
    ])
      .then(() => {
        if (cancelled) return
        const Prism = (window as {
          Prism?: {
            languages?: Record<string, unknown>
            highlight: (code: string, grammar: unknown, lang: string) => string
          }
        }).Prism
        if (!Prism || !Prism.languages) return
        pres.forEach((pre) => {
          const code = pre.querySelector('code')
          if (!code) return
          const langClass = Array.from(code.classList).find((c) => c.startsWith('language-'))
          if (langClass) {
            const lang = langClass.replace('language-', '')
            pre.setAttribute('data-language', lang)
            // Re-highlight in case autoloader's async grammar landed first.
            if (Prism.languages[lang]) {
              code.innerHTML = Prism.highlight(
                code.textContent ?? '',
                Prism.languages[lang],
                lang,
              )
            }
          }
          if (pre.querySelector('.lander-copy-btn')) return
          const copyBtn = document.createElement('button')
          copyBtn.className = 'lander-copy-btn'
          copyBtn.setAttribute('aria-label', 'Copy code')
          copyBtn.setAttribute('title', 'Copy to clipboard')
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
          copyBtn.addEventListener('click', async function () {
            try {
              await navigator.clipboard.writeText(code.textContent)
              copyBtn.classList.add('copied')
              copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
              setTimeout(() => {
                copyBtn.classList.remove('copied')
                copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
              }, 2000)
            } catch (err) {
              console.error('Failed to copy:', err)
            }
          })
          pre.appendChild(copyBtn)
        })
      })
      .catch((err) => {
        if (!cancelled) console.error('lander code highlight unavailable:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="lander">
      <header className="lander-nav">
        <span className="lander-brand">Gistory</span>
        <nav className="lander-nav-links">
          <a href="/why" className="lander-link">Why</a>
          <a href="/what" className="lander-link">What it is</a>
          <a href="/about" className="lander-link">About</a>
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
          Gistory is a personal prompt manager and AI prompt library. Write a prompt
          once, tag it, find it in a keystroke, and copy it with the variables filled
          in — reuse it anywhere you chat or build. Sync is end-to-end encrypted: the
          server stores ciphertext it cannot read.
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
        <div className="lander-example">
          <p className="lander-example-hint">What one thread reads like — copy it filled in:</p>
          <pre><code className="language-yaml">{FILL_EXAMPLE}</code></pre>
        </div>
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

      <section className="lander-section lander-faq" id="faq">
        <h2 className="lander-section-title">Frequently asked questions</h2>
        <div className="lander-faq-list">
          {FAQ_ITEMS.map((item, i) => (
            <details key={item.q} className="lander-faq-item" open={i === 0}>
              <summary>
                <span>{item.q}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
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

      <Footer />
    </div>
  )
}

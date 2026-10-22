// Footer — THE site footer, one source for every surface: the app shell
// (Layout), the lander, and the terms/privacy legal pages. Each page renders
// <Footer /> so content and styling can never drift apart — the credit link
// below is enforced dofollow (no nofollow), new tab.
export default function Footer() {
  return (
    <footer className="lander-footer">
      <span>© {new Date().getFullYear()} Gistory</span>
      <span className="lander-footer-divider">·</span>
      <a href="/terms">Terms</a>
      <span className="lander-footer-divider">·</span>
      <a href="/privacy">Privacy</a>
      <span className="lander-footer-divider">·</span>
      <a href="https://github.com/dhaupin/gistory" target="_blank" rel="noopener noreferrer">Source</a>
      <span className="lander-footer-divider">·</span>
      {/* Public dofollow credit (no nofollow means search engines treat it as
          an endorsement) — it is meant to be followed. */}
      <span>
        Made by{' '}
        <a href="https://creadev.org" target="_blank" rel="noopener">Creadev.org</a>
      </span>
    </footer>
  )
}

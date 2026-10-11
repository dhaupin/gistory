// Footer - site footer
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <span className="footer-brand">Gistory</span>
        <span className="footer-divider">·</span>
        <a href="#/projects" className="footer-link">Projects</a>
        <span className="footer-divider">·</span>
        <a href="#/settings" className="footer-link">Settings</a>
        <span className="footer-divider">·</span>
        {/* Inside the app the hash router is the address book: a bare "/"
            would leave the SPA entirely and land on the public lander (full
            page load), so "Home" gets the same anchor form as the rest. */}
        <a href="#/" className="footer-link">Home</a>
        <span className="footer-divider">·</span>
        <a href="/terms" className="footer-link">Terms</a>
        <span className="footer-divider">·</span>
        <a href="/privacy" className="footer-link">Privacy</a>
      </div>
    </footer>
  )
}
/**
 * pages/NotFound.jsx - the SPA 404. Same shape and copy family as the static
 * 404 (ssr.config.js notFound block), so the host's not-found file and the
 * client-side render read as one page, not two (the static one is what the
 * host serves for every miss; this one is what a hydrate shows for an
 * undeclared route pushed from the client).
 */
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="nf">
      <div className="wrap">
        <h1>404</h1>
        <p>That page does not exist here.</p>
        <Link to="/" className="btn btn-primary">Back home</Link>
      </div>
    </section>
  )
}

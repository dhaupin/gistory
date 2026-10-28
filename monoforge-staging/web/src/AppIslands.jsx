/**
 * src/AppIslands.jsx
 * ==================
 * TEMPLATE FILE -- register your island components here.
 *
 * Each entry maps a data-pre-island name to a React component.
 * The name must match exactly what you put in the HTML attribute.
 *
 * Island components:
 *   - Run only in the browser, never during SSR prerender.
 *   - Receive no props. Read data from localStorage, fetch, or a global store.
 *   - Replace any fallback content inside the <pre-island> element.
 *
 * Usage in your page JSX:
 *
 *   // eager (default) -- mounts immediately after hydration
 *   <pre-island data-pre-island="recently-viewed" />
 *
 *   // visible -- mounts when scrolled into viewport
 *   <pre-island data-pre-island="cart-widget" data-pre-load="visible">
 *     <span className="island-loading">Loading cart...</span>
 *   </pre-island>
 *
 *   // idle -- mounts during browser idle time
 *   <pre-island data-pre-island="promo-banner" data-pre-load="idle" />
 */

import GateStatusIsland from './components/GateStatusIsland.jsx'
import FamilyStatusIsland from './components/FamilyStatusIsland.jsx'

export const islands = {
  // LandingPage live status - reads the committed ledgers on main.
  // Registry values are component functions (islands.js renders them via
  // React.createElement directly, no wrapper allowed).
  'gate-status': GateStatusIsland,
  // Status page family panel - reads the four served /status.json files
  // (the family-status@1 dialect).
  'family-status': FamilyStatusIsland,
}

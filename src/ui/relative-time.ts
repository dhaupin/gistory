// Relative-time formatting shared by the sync chip, board rows, thread
// header, and message heads. Deliberately not a React module: pure functions
// that any component (or test) can use.

/**
 * "3m ago" / "just now" / "2d ago" style stamp. Times in the future (clock
 * skew between devices) clamp to "just now" rather than negative counts.
 */
export function formatAgo(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

/**
 * Stamp for an item that can be edited: "edited 3m ago", or "created 2d ago"
 * when it has never been edited (or predates updatedAt tracking). The exact
 * time is always in the title so a hover (or screen reader) gets precision.
 */
export function createdEditedStamp(
  createdAt: number | undefined,
  updatedAt: number | undefined,
  now: number = Date.now(),
): string {
  if (updatedAt && updatedAt - createdAt > 1000) return `edited ${formatAgo(updatedAt, now)}`
  return `created ${formatAgo(createdAt ?? 0, now)}`
}

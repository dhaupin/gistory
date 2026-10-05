// Time formatting shared by the sync chip, board rows, thread header, and
// message heads. Deliberately not a React module: pure functions that any
// component (or test) can use.

/**
 * Time zones offered in Settings → General. Deliberately a curated list, not
 * every IANA zone: a select keeps the choice valid by construction (Intl
 * throws on an unknown zone, and an imported payload could carry anything).
 * "" means "use this device's zone".
 */
export const TIME_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Helsinki',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export function timeZoneLabel(timeZone?: string): string {
  return timeZone || 'device time'
}

/**
 * Absolute stamp: `2026-10-05 14:32` (or with seconds for titles). Deliberately
 * ISO-shaped and unambiguous — the point is back-tracing a prompt to a
 * conversation, where "3h ago" is useless after a day. An invalid/unknown zone
 * (e.g. from an imported payload) falls back to the device zone rather than
 * throwing.
 */
export function formatStampTime(ts: number, timeZone?: string, withSeconds = false): string {
  if (!Number.isFinite(ts)) return ''
  const d = new Date(ts)
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' as const } : {}),
      hourCycle: 'h23',
    })
    const parts: Record<string, string> = {}
    for (const p of fmt.formatToParts(d)) parts[p.type] = p.value
    const base = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
    return withSeconds ? `${base}:${parts.second}` : base
  } catch {
    return d.toLocaleString()
  }
}

/**
 * The visible stamp: "edited 2026-10-05 14:32" or "created 2023-11-14 22:23"
 * when it has never been edited (or predates updatedAt tracking). The zone
 * name is always in the title so a hover gives the full context.
 */
export function createdEditedStamp(
  createdAt: number | undefined,
  updatedAt: number | undefined,
  timeZone?: string,
): string {
  if (updatedAt && updatedAt - createdAt > 1000) return `edited ${formatStampTime(updatedAt, timeZone)}`
  return `created ${formatStampTime(createdAt ?? 0, timeZone)}`
}

/** Hover text: full second-precision time plus the zone it is expressed in. */
export function stampTitle(ts: number, timeZone?: string): string {
  return `${formatStampTime(ts, timeZone, true)} (${timeZoneLabel(timeZone)})`
}

/**
 * "3m ago" style stamp for the sync chip, where recency beats precision.
 * Times in the future (clock skew between devices) clamp to "just now".
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

// Ingestion runs a few times a day (CLAUDE.md §6), so anything older than a day
// is stale relative to how this product is supposed to work.
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

export function formatPrice(value) {
  if (value === null || value === undefined) return '-'
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatTradingDate(tradingDate) {
  if (!tradingDate) return null
  const [year, month, day] = tradingDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function formatRelativeTime(fetchedAt) {
  if (!fetchedAt) return null
  const diffMs = Date.now() - new Date(fetchedAt).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function isStale(fetchedAt) {
  if (!fetchedAt) return false
  return Date.now() - new Date(fetchedAt).getTime() > STALE_THRESHOLD_MS
}

// The raw z-score stays available (drives ranking, kept in the API response) but
// is never the primary thing shown - this is the "one tap/hover away" secondary
// surface for it, used in the reason tooltip and the ticker detail view.
export function formatPreciseSignal({ zScore, volumeZScore, volumeMultiple }) {
  const parts = []

  if (zScore !== null && zScore !== undefined) {
    parts.push(`z-score ${zScore.toFixed(2)} (30-day window)`)
  }

  if (volumeMultiple !== null && volumeMultiple !== undefined && volumeZScore !== null && volumeZScore !== undefined) {
    parts.push(`volume ${volumeMultiple.toFixed(1)}x normal (z ${volumeZScore.toFixed(2)})`)
  }

  return parts.length > 0 ? parts.join(' · ') : undefined
}

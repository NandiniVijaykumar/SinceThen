// Ingestion runs a few times a day (CLAUDE.md §6), so anything older than a day
// is stale relative to how this product is supposed to work.
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

export function formatPrice(value) {
  if (value === null || value === undefined) return '—'
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

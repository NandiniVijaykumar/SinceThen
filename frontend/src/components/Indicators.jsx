import { formatRelativeTime, formatTradingDate, isStale } from '../format'

export function PercentChange({ value }) {
  if (value === null || value === undefined) {
    return <span className="pct pct--neutral">-</span>
  }

  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  const cls = pct > 0 ? 'pct--up' : pct < 0 ? 'pct--down' : 'pct--neutral'

  return (
    <span className={`pct ${cls}`}>
      {sign}
      {pct.toFixed(2)}%
    </span>
  )
}

export function Freshness({ tradingDate, fetchedAt }) {
  if (!tradingDate || !fetchedAt) return null

  const stale = isStale(fetchedAt)

  return (
    <span className={`freshness${stale ? ' freshness--stale' : ''}`}>
      as of {formatTradingDate(tradingDate)} close · updated {formatRelativeTime(fetchedAt)}
    </span>
  )
}

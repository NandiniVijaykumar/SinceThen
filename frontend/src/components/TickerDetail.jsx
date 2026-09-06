import { useEffect, useRef, useState } from 'react'
import { markSeen } from '../api'
import { formatPrice } from '../format'
import { Freshness, PercentChange } from './Indicators'

function TickerDetail({ token, ticker, item, onBack, onRemove }) {
  const [error, setError] = useState(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true

    markSeen(token, ticker).catch((err) => {
      // A 404 here just means there's no snapshot yet for this ticker - nothing to
      // acknowledge. Missing data is never treated as an error (CLAUDE.md §5).
      if (err.status !== 404) {
        setError(`Could not update your checkpoint: ${err.message}`)
      }
    })
  }, [token, ticker])

  if (!item) {
    return (
      <div className="detail-screen">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back
        </button>
        <p>This ticker is no longer in your watchlist.</p>
      </div>
    )
  }

  const isAwaiting = item.state === 'awaiting-data'
  const isInvalid = isAwaiting && item.fetchStatus === 'invalid'

  return (
    <div className="detail-screen">
      <button type="button" className="back-link" onClick={onBack}>
        ← Back
      </button>

      <h1>{item.ticker}</h1>
      {item.name && <p className="detail-subtitle">{item.name}</p>}

      {error && <p className="error-text">{error}</p>}

      {isAwaiting ? (
        <p className={`badge ${isInvalid ? 'badge--invalid' : 'badge--awaiting'}`}>
          {isInvalid
            ? 'Symbol may be invalid — repeated attempts to fetch data for this ticker found none.'
            : 'Awaiting data — no snapshot yet for this ticker.'}
        </p>
      ) : (
        <>
          <div className="detail-grid">
            <div className="detail-field">
              <span className="detail-label">Close</span>
              <span className="detail-value">₹{formatPrice(item.close)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Change</span>
              <span className="detail-value">
                <PercentChange value={item.changePct} />
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Z-score</span>
              <span className="detail-value">{item.zScore !== null ? `${item.zScore.toFixed(2)}σ` : '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">52-week range</span>
              <span className="detail-value">
                {item.is52wHigh ? 'New high' : item.is52wLow ? 'New low' : 'Within range'}
              </span>
            </div>
          </div>

          <Freshness tradingDate={item.tradingDate} fetchedAt={item.fetchedAt} />

          {item.reason && <p className="detail-reason">{item.reason}</p>}
        </>
      )}

      <button type="button" className="danger-link" onClick={() => onRemove(item.ticker)}>
        Remove from watchlist
      </button>
    </div>
  )
}

export default TickerDetail

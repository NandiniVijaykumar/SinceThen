import { useCallback, useEffect, useState } from 'react'
import { addTicker, fetchWatchlistStatus, markAllSeen, removeTicker } from '../api'
import AddTickerForm from './AddTickerForm'
import TickerDetail from './TickerDetail'
import WatchlistList from './WatchlistList'

function Watchlist({ token, onLogout }) {
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [selectedTicker, setSelectedTicker] = useState(null)

  // No setState before the first await: this is called directly from the mount
  // effect below, and setting state synchronously in an effect body triggers
  // cascading renders (react-hooks/set-state-in-effect). Callers that want a
  // visible loading state (the Retry button) set it themselves before calling in.
  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchWatchlistStatus(token)
      setItems(data.items)
      setLoadError(null)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    // Plain fetch-on-mount; no data-fetching library in scope for the MSSP.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus()
  }, [loadStatus])

  async function handleRetry() {
    setLoading(true)
    await loadStatus()
  }

  async function handleAdd(ticker) {
    setActionError(null)
    try {
      await addTicker(token, ticker)
      await loadStatus()
      return true
    } catch (err) {
      setActionError(err.message)
      return false
    }
  }

  async function handleRemove(ticker) {
    setActionError(null)
    try {
      await removeTicker(token, ticker)
      if (selectedTicker === ticker) setSelectedTicker(null)
      await loadStatus()
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function handleMarkAllSeen() {
    setActionError(null)
    try {
      await markAllSeen(token)
      await loadStatus()
    } catch (err) {
      setActionError(err.message)
    }
  }

  if (selectedTicker) {
    const item = items?.find((i) => i.ticker === selectedTicker) ?? null
    return (
      <TickerDetail
        token={token}
        ticker={selectedTicker}
        item={item}
        onBack={async () => {
          setSelectedTicker(null)
          await loadStatus()
        }}
        onRemove={handleRemove}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Watchpoint</h1>
        <div className="app-header__actions">
          <button type="button" onClick={handleMarkAllSeen} disabled={!items || items.length === 0}>
            Mark all seen
          </button>
          <button type="button" className="app-header__logout" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <AddTickerForm onAdd={handleAdd} />

      {actionError && <p className="error-text">{actionError}</p>}

      {loading && <p className="status-text">Loading your watchlist…</p>}

      {!loading && loadError && (
        <div className="error-banner">
          <p>Couldn&apos;t reach the server: {loadError}</p>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && items && items.length === 0 && (
        <div className="empty-state">
          <p>Your watchlist is empty.</p>
          <p className="muted">Add a ticker above to start tracking what matters.</p>
        </div>
      )}

      {!loading && !loadError && items && items.length > 0 && (
        <WatchlistList items={items} onSelect={setSelectedTicker} onRemove={handleRemove} />
      )}
    </div>
  )
}

export default Watchlist

import { useEffect, useState } from 'react'
import { fetchMe } from './api'
import Login from './components/Login'
import Watchlist from './components/Watchlist'
import './App.css'

// localStorage is only a rehydration cache, read once on mount and re-validated
// against the backend before it's ever trusted - React state is the source of
// truth for the rest of the session. The backend stays fully stateless (D10):
// this just avoids forcing a fresh Google login on every page refresh.
const TOKEN_STORAGE_KEY = 'watchlist_id_token'

function App() {
  const [token, setToken] = useState(null)
  const [checkingStoredToken, setCheckingStoredToken] = useState(true)

  useEffect(() => {
    // One-time token rehydration on mount; same fetch-on-mount pattern used in
    // Watchlist.jsx, and the same reason for the disable there.
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY)

    if (!stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckingStoredToken(false)
      return
    }

    // Never render the authenticated shell on the strength of a stored token
    // alone - GET /api/me is the validation call. A failure of any kind (401,
    // expired, network error) means back to the login screen.
    fetchMe(stored)
      .then(() => setToken(stored))
      .catch(() => localStorage.removeItem(TOKEN_STORAGE_KEY))
      .finally(() => setCheckingStoredToken(false))
  }, [])

  function handleToken(newToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken)
    setToken(newToken)
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken(null)
  }

  if (checkingStoredToken) {
    return (
      <div className="app-loading-screen">
        <p className="status-text">Loading…</p>
      </div>
    )
  }

  if (!token) {
    return <Login onToken={handleToken} />
  }

  return <Watchlist token={token} onLogout={handleLogout} />
}

export default App

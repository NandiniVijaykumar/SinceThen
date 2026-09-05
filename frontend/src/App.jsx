import { useState } from 'react'
import Login from './components/Login'
import Watchlist from './components/Watchlist'
import './App.css'

function App() {
  // In-memory only, per design - never persisted.
  const [token, setToken] = useState(null)

  if (!token) {
    return <Login onToken={setToken} />
  }

  return <Watchlist token={token} />
}

export default App

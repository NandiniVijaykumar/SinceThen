import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL

function App() {
  // eslint-disable-next-line no-unused-vars
  const [idToken, setIdToken] = useState(null)
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)

  async function handleLoginSuccess(credentialResponse) {
    const token = credentialResponse.credential
    setIdToken(token)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const body = await res.json()

      if (!res.ok) {
        throw new Error(body.error || `Request failed (${res.status})`)
      }

      setUser(body.user)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section id="center">
      <h1>Watchlist — Sign in</h1>

      {!user && (
        <GoogleLogin
          onSuccess={handleLoginSuccess}
          onError={() => setError('Google sign-in failed')}
        />
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {user && (
        <div>
          <p><strong>sub:</strong> {user.sub}</p>
          <p><strong>email:</strong> {user.email}</p>
          <p><strong>name:</strong> {user.name}</p>
        </div>
      )}
    </section>
  )
}

export default App

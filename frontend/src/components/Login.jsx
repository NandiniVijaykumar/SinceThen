import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'

function Login({ onToken }) {
  const [error, setError] = useState(null)

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Watchlist</h1>
        <p className="login-tagline">What actually changed since you last looked.</p>
        <GoogleLogin
          onSuccess={(credentialResponse) => onToken(credentialResponse.credential)}
          onError={() => setError('Google sign-in failed. Please try again.')}
        />
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  )
}

export default Login

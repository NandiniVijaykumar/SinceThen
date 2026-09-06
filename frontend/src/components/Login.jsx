import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'

function Login({ onToken }) {
  const [error, setError] = useState(null)

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Watchpoint</h1>
        <p className="login-tagline">A stock watchlist that shows you exactly what changed since you last checked.</p>
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

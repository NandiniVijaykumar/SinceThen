import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'

// StrictMode is applied inside App.jsx, around the authenticated Watchlist subtree
// only - NOT here. See the comment there for why: <GoogleLogin> must never mount
// under StrictMode's dev-mode double-invoke.
createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <App />
  </GoogleOAuthProvider>,
)

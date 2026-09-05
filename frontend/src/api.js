const API_URL = import.meta.env.VITE_API_URL

async function request(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  let data = null
  try {
    data = await res.json()
  } catch {
    // no/invalid JSON body - fall through, res.ok check below still applies
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }

  return data
}

export function fetchMe(token) {
  return request('/api/me', { token })
}

export function fetchWatchlistStatus(token) {
  return request('/api/watchlist/status', { token })
}

export function addTicker(token, ticker) {
  return request('/api/watchlist', { token, method: 'POST', body: { ticker } })
}

export function removeTicker(token, ticker) {
  return request(`/api/watchlist/${encodeURIComponent(ticker)}`, { token, method: 'DELETE' })
}

export function markSeen(token, ticker) {
  return request(`/api/checkpoints/${encodeURIComponent(ticker)}/seen`, { token, method: 'POST' })
}

export function markAllSeen(token) {
  return request('/api/checkpoints/seen-all', { token, method: 'POST' })
}

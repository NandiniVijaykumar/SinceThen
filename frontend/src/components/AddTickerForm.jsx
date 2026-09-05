import { useState } from 'react'

function AddTickerForm({ onAdd }) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const ticker = value.trim()
    if (!ticker) return

    setSubmitting(true)
    const ok = await onAdd(ticker)
    setSubmitting(false)

    if (ok) setValue('')
  }

  return (
    <form className="add-ticker-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Add a ticker, e.g. RELIANCE or TCS.NS"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={submitting}
        aria-label="Ticker symbol"
      />
      <button type="submit" disabled={submitting || !value.trim()}>
        {submitting ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}

export default AddTickerForm

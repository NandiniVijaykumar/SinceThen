import { formatPreciseSignal, formatPrice } from '../format'
import { Freshness, PercentChange } from './Indicators'

function ItemRow({ item, variant, onSelect, onRemove }) {
  const isAwaiting = variant === 'awaiting-data'
  const isInvalid = isAwaiting && item.fetchStatus === 'invalid'

  return (
    <div className={`item-row item-row--${variant}${isInvalid ? ' item-row--invalid' : ''}`}>
      <div
        className="item-row__main"
        role="button"
        tabIndex={0}
        onClick={() => onSelect(item.ticker)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect(item.ticker)
        }}
      >
        <div className="item-row__id">
          <span className="item-row__ticker">{item.ticker}</span>
          {item.name && <span className="item-row__name">{item.name}</span>}
        </div>

        {isAwaiting ? (
          <span className={`badge ${isInvalid ? 'badge--invalid' : 'badge--awaiting'}`}>
            {isInvalid ? 'Symbol may be invalid' : 'Awaiting data'}
          </span>
        ) : (
          <div className="item-row__metrics">
            <span className="item-row__price">₹{formatPrice(item.close)}</span>
            <PercentChange value={item.changePct} />
          </div>
        )}
      </div>

      {variant === 'changed' && item.reason && (
        <p className="item-row__reason" title={formatPreciseSignal(item)}>
          {item.reason}
        </p>
      )}

      <div className="item-row__footer">
        {!isAwaiting && <Freshness tradingDate={item.tradingDate} fetchedAt={item.fetchedAt} />}
        <button
          type="button"
          className="item-row__remove"
          onClick={() => onRemove(item.ticker)}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function WatchlistList({ items, onSelect, onRemove }) {
  const changed = items.filter((item) => item.state === 'changed')
  const quiet = items.filter((item) => item.state === 'quiet')
  const awaiting = items.filter((item) => item.state === 'awaiting-data')

  return (
    <div className="watchlist">
      {changed.length > 0 && (
        <section className="section section--changed">
          <h2 className="section-title">Needs your attention</h2>
          {changed.map((item) => (
            <ItemRow key={item.ticker} item={item} variant="changed" onSelect={onSelect} onRemove={onRemove} />
          ))}
        </section>
      )}

      {quiet.length > 0 && (
        <section className="section section--quiet">
          <h2 className="section-title">Quiet</h2>
          {quiet.map((item) => (
            <ItemRow key={item.ticker} item={item} variant="quiet" onSelect={onSelect} onRemove={onRemove} />
          ))}
        </section>
      )}

      {awaiting.length > 0 && (
        <section className="section section--awaiting">
          <h2 className="section-title">Awaiting data</h2>
          {awaiting.map((item) => (
            <ItemRow key={item.ticker} item={item} variant="awaiting-data" onSelect={onSelect} onRemove={onRemove} />
          ))}
        </section>
      )}
    </div>
  )
}

export default WatchlistList

# SinceThen

A stock watchlist that shows you what *meaningfully* changed since you last looked.

A normal watchlist is stateless with respect to you — it shows the same wall of red and green whether you last checked five minutes or five days ago, and weights a 0.3% drift the same as a 9% breakout. SinceThen keeps a per-user checkpoint of what you've already seen and surfaces only the moves that are unusual *for that specific stock* and *new to you*, each with a plain-language reason. It uses **end-of-day** NSE data by design; it is not a real-time trading tool and gives no buy/sell advice.

---

## What it does

- **Manage a watchlist** of NSE tickers.
- **See what changed** since your last visit — meaningful moves surface at the top under "Needs your attention," with a plain-language reason (e.g. *"Down 4.1% — an unusually large move for this stock, on 2.1× normal volume"*).
- **Mark items as seen** — opening a ticker's detail, or "Mark all seen," checkpoints it so it drops to "Quiet" until the *next* meaningful, unseen change.
- **Honest data states** — every item is *changed* (meaningful and unseen), *quiet* (has data, nothing notable or already seen), or *awaiting data* (no snapshot yet; promoted to *symbol may be invalid* only after repeated failed fetches). Missing data is never shown as "no change."

---

## Quick start

Prerequisites: Node.js 18+, a MongoDB connection (local or Atlas), and a Google OAuth client ID.

```bash
git clone <repo-url>
cd <repo>

# Backend
cd backend
npm install
cp .env.example .env      # fill in values — see Environment variables
npm run dev

# Frontend (separate terminal)
cd ../frontend
npm install
cp .env.example .env      # fill in VITE_ values
npm run dev
```

Open the frontend dev URL (typically `http://localhost:5173`), sign in with Google, and add tickers (e.g. `RELIANCE`, `TCS` — the `.NS` suffix is added automatically).

**Populating data:** user requests only ever read from the database; the market API is never called on page load. Adding a ticker automatically fires a background fetch for just that ticker, so it populates within a few seconds — no manual step. The scheduled job (see [Deployment](#deployment)) refreshes *existing* tickers daily. For local dev, you can force a full refresh without waiting:

```bash
curl -X POST http://localhost:<backend-port>/internal/snapshot \
  -H "X-Internal-Secret: <your INTERNAL_SECRET>"
```

---

## Environment variables

**Backend (`backend/.env`)**

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string. **Secret.** |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID, for verifying ID tokens. (Public — same value as the frontend.) |
| `INTERNAL_SECRET` | Shared secret guarding `POST /internal/snapshot`. **Secret.** |
| `PORT` | Backend port. |

**Frontend (`frontend/.env`)**

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID (public; shipped to the browser). |
| `VITE_API_URL` | Base URL of the backend API. |

Google OAuth **client IDs are public** by design and shipped to every browser — not secrets. The real secrets are `MONGODB_URI` and `INTERNAL_SECRET`. No `.env` is tracked; `.env.example` documents the shape with empty values.

---

## Architecture

A **modular monolith**: one Express app with internal modules (auth, watchlist, snapshot ingestion, change detection), one MongoDB database, one scheduled ingestion job. 

```
React SPA (Render static site)
   │  REST + Authorization: Bearer <Google ID token>
   ▼
Express monolith (Render web service)
   ├─ auth / watchlist / change-detection  ──►  read/write  ┐
   └─ snapshot ingestion (POST /internal/snapshot, secret)  │
          │  yahoo-finance2 chart()  (the ONLY caller of the API)
          ▼                                                  ▼
      Yahoo Finance  ─── touched only by ingestion ──►  MongoDB Atlas
                                                             ▲
   external scheduler (cron-job.org)                         │
   POST /internal/snapshot once daily, 18:30 IST  ──────────┘
   (triggers ingestion AND keeps the free-tier service awake)
```

**The core decision: nothing that serves a user request ever calls the market API.** A scheduled job ingests snapshots into MongoDB; every user-facing request reads only from MongoDB. `yahoo-finance2` is unofficial and unreliable — it rate-limits and fails without warning. Confining it to one background job keeps the product fully usable when the API is degraded: browsing, adding, and marking-seen all work, and data is served from the last good snapshot, badged with its age.

**Flow:** the frontend obtains a Google ID token and sends it as a Bearer token; the backend verifies it per request (`google-auth-library`) and uses the Google `sub` as the user ID — stateless, no sessions. Watchlist add/remove are pure DB operations scoped to the user; add returns immediately and (on a cache miss) fires a background single-ticker fetch. Once daily the scheduler hits the secret-guarded endpoint, which fetches the union of watched tickers and upserts snapshots. The status endpoint joins each user's items with the latest snapshots and their checkpoints, classifies each item, and returns a reason for changed ones.

---

## Design

### What "meaningful change" means

Defined precisely and kept explainable — no ML, no opaque scoring. An item is **meaningful** when **either**:

1. **The daily move is unusual for that stock** — a z-score over the trailing 30 trading days:
   - daily return `= (close − previousClose) / previousClose`
   - `z = (todayReturn − mean) / stdDev`, using the mean and sample standard deviation (n−1) of the 30-day return window
   - threshold **|z| ≥ 2** (~top 5% of that stock's own daily moves)
2. **A 52-week high or low is broken.**

**Why a z-score, not an absolute threshold (±5%)?** Absolute thresholds are noise: 5% is nothing for a volatile small-cap and a major event for a stable large-cap. Normalizing each move against that stock's *own* recent volatility makes the signal fair across very different stocks and trivially explainable — "a bigger move than this stock normally makes."

**Volume as confirmation, not a trigger.** A separate volume z-score (same window and method, on daily volume) is shown *alongside* a price move as conviction context — *"…on 3.1× normal volume."* A volume spike alone never surfaces an item, so the list stays intuitive. The precise z-scores and volume multiple are always visible in the ticker detail view, so the plain-language label is backed by an inspectable number.

### Checkpoints (what you've seen)

The per-user checkpoint is what makes this more than a watchlist, and it's designed to be deterministic.

- Stored **per (user, ticker)**, recording the **trading date** last acknowledged — not a wall-clock timestamp. An item is *changed* when the latest snapshot's trading date is newer than the checkpoint **and** the snapshot is meaningful, so re-checking multiple times on the same day never resurfaces the same move.
- **Marking seen is explicit** (detail view or "Mark all seen") — merely loading the list doesn't clear signals, so a glance-and-close never loses what you hadn't looked at.
- **Server-side and shared across devices**; concurrent "mark seen" from two tabs is naturally idempotent (same trading date written).
- **New tickers** are baselined "all seen" on add, so a fresh add doesn't dump historical changes. **Removed tickers** delete their checkpoint; re-adding starts fresh.

### Resilience and edge cases

Handling an unreliable data source is treated as a first-class concern.

| Scenario | Behavior |
|---|---|
| **API rate-limits mid-ingestion** | A 429 is detected distinctly from "not found." The job spaces requests (200ms), and on rate-limit backs off for a fixed cooldown (45s) and **retries only the failed tickers**, capped at 3 rounds; anything still failing is deferred to the next run. No persistent queue — all in-memory within one run. |
| **API fails / times out / malformed** | The upsert runs only after a *successful* fetch, so a failure **never overwrites a good snapshot**. Last good data is retained and served, badged with its age. |
| **Invalid ticker** | No snapshot written; shows *awaiting data*, promoted to *symbol may be invalid* only after **repeated** not-found responses — a single ambiguous failure never marks a valid ticker invalid. |
| **Insufficient history** (<~20 days) | z-scores are `null`, never fabricated; the item is treated as awaiting rather than shown with a bogus signal. |
| **Duplicate / concurrent add** | Prevented at the DB layer by a unique `(userId, ticker)` index — the insert is attempted and the duplicate-key error caught, not a check-then-insert race. |
| **Idempotent ingestion** | Snapshots keyed `(ticker, tradingDate)` with a unique index and upserted, so re-running the job never duplicates. |
| **Timezone / trading date** | Derived from the data row in `Asia/Kolkata`, never wall-clock fetch time, so an evening job never mis-dates a session across the UTC day boundary. |
| **Closed / weekend / holiday / unsettled** | One rule: snapshots key to the latest *completed* session from the data itself. The last real close is shown, badged by age; no bar is invented for a day the market didn't produce one. |
| **Stale data** | Freshness ("as of 4 Sept close · updated Nm ago") shows on every item, so EOD data is never mistaken for live. |

---

## Data model

Four MongoDB collections; integrity enforced by unique indexes, not just app code.

- **`users`** — `_id` = Google `sub`, email, name, createdAt.
- **`watchlistItems`** — `userId`, `ticker` (canonical, uppercased, `.NS`), addedAt, and fetch-status fields (`fetchStatus`, `failedAttempts`, `lastAttemptAt`) for the awaiting/invalid classification. **Unique `(userId, ticker)`.** Membership is a separate collection (not an array on the user doc) so add/remove are atomic per-document and duplicate-safe under concurrency.
- **`snapshots`** — market-data cache, **unique `(ticker, tradingDate)`**. One fetch per ticker serves every user watching it. Fields: close, previousClose, changePct (a ratio), volume, zScore, volumeZScore, avgVolume, 52-week high/low and break flags, `insufficientHistory`, `fetchedAt` (drives the freshness badge), name. All derived values come from a single field lineage (the `chart()` series) to stay internally consistent.
- **`checkpoints`** — unique `(userId, ticker)`, `lastSeenTradingDate`, `lastSeenAt`.

---

## Scope & limitations

**Chosen not to build**:

- **Real-time / streaming prices** — the signal is computed on completed daily closes, which can't change until the next close; polling intraday would add API load and failure surface to recompute an unchanged number. "What changed while I was away" is a day-scale question, so daily data is the right resolution. (A live intraday price in the z-score would also be statistically incoherent — comparing a partial-day move against full-day returns.)
- **News, earnings, sentiment** — each is a data-source reliability problem that would compromise the resilience the rest of the system guarantees, for a signal that's hard to make explainable.
- **Buy/sell advice or predictions** — the product surfaces *what changed*, not *what to do*.

**Gaps:**

- **Corporate actions not modeled** — splits, symbol changes, delistings, halts have no dedicated handling; a split would distort the z-score window until it ages out. Deferred, not solved.
- **No market-wide normalization** — a broad crash would flag many stocks at once; the signal is per-stock and doesn't subtract market/sector beta.
- **Unofficial data source** — `yahoo-finance2` can break; the measures above limit the blast radius but don't remove the dependency.
- **Auth trade-off** — stateless tokens can't be server-revoked before their ~1-hour expiry.

---

## Deployment

- **Frontend** — Render static site (Vite build).
- **Backend** — Render web service (Express).
- **Database** — MongoDB Atlas.
- **Scheduler** — cron-job.org calls `POST /internal/snapshot` once daily at 18:30 IST, which both triggers ingestion and keeps the free-tier service warm.
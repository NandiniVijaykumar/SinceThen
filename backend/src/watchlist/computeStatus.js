const WatchlistItem = require("../models/WatchlistItem");
const Snapshot = require("../models/Snapshot");
const Checkpoint = require("../models/Checkpoint");
const FetchStatus = require("../models/FetchStatus");

const Z_THRESHOLD = 2; // |z| >= 2 is "meaningful" (~top 5% of a stock's own moves)

function isMeaningful(snapshot) {
    return (snapshot.zScore !== null && Math.abs(snapshot.zScore) >= Z_THRESHOLD) || snapshot.is52wHigh || snapshot.is52wLow;
}

function buildReason(snapshot) {
    const parts = [];

    if (snapshot.zScore !== null && Math.abs(snapshot.zScore) >= Z_THRESHOLD) {
        const pct = `${snapshot.changePct >= 0 ? "+" : ""}${(snapshot.changePct * 100).toFixed(1)}%`;
        parts.push(`${pct} — ${snapshot.zScore.toFixed(1)}σ move`);
    }

    if (snapshot.is52wHigh) {
        parts.push("New 52-week high");
    } else if (snapshot.is52wLow) {
        parts.push("New 52-week low");
    }

    return parts.join(" — ");
}

// Three-state model: "awaiting-data" (no/insufficient snapshot),
// "changed" (new + meaningful since the user's checkpoint), "quiet" (everything else).
// Absence of data must never be reported as absence of change.
async function computeWatchlistStatus(userId) {
    const items = await WatchlistItem.find({ userId }).lean();
    const tickers = items.map((item) => item.ticker);

    const latestSnapshots = await Snapshot.aggregate([
        { $match: { ticker: { $in: tickers } } },
        { $sort: { tradingDate: -1 } },
        { $group: { _id: "$ticker", doc: { $first: "$$ROOT" } } },
    ]);
    const snapshotByTicker = new Map(latestSnapshots.map((s) => [s._id, s.doc]));

    const checkpoints = await Checkpoint.find({ userId, ticker: { $in: tickers } }).lean();
    const checkpointByTicker = new Map(checkpoints.map((c) => [c.ticker, c]));

    const fetchStatuses = await FetchStatus.find({ ticker: { $in: tickers } }).lean();
    const fetchStatusByTicker = new Map(fetchStatuses.map((f) => [f.ticker, f]));

    const results = items.map((item) => {
        const snapshot = snapshotByTicker.get(item.ticker) || null;
        const checkpoint = checkpointByTicker.get(item.ticker) || null;
        const fetchStatusDoc = fetchStatusByTicker.get(item.ticker) || null;
        // Back-compat default for tickers added before fetch-status tracking existed:
        // a snapshot already on file reads as 'ok', otherwise 'pending'.
        const fetchStatus = fetchStatusDoc ? fetchStatusDoc.fetchStatus : snapshot ? "ok" : "pending";

        let state;
        let reason = "";

        if (!snapshot || snapshot.insufficientHistory) {
            state = "awaiting-data";
        } else {
            const lastSeen = checkpoint ? checkpoint.lastSeenTradingDate : "";
            const isUnseen = snapshot.tradingDate > lastSeen;

            if (isUnseen && isMeaningful(snapshot)) {
                state = "changed";
                reason = buildReason(snapshot);
            } else {
                state = "quiet";
            }
        }

        return {
            ticker: item.ticker,
            state,
            reason,
            fetchStatus,
            name: snapshot ? snapshot.name : null,
            close: snapshot ? snapshot.close : null,
            changePct: snapshot ? snapshot.changePct : null, // ratio - UI multiplies by 100
            zScore: snapshot ? snapshot.zScore : null,
            is52wHigh: snapshot ? snapshot.is52wHigh : false,
            is52wLow: snapshot ? snapshot.is52wLow : false,
            tradingDate: snapshot ? snapshot.tradingDate : null,
            fetchedAt: snapshot ? snapshot.fetchedAt : null,
        };
    });

    const STATE_RANK = { changed: 0, quiet: 1, "awaiting-data": 2 };

    results.sort((a, b) => {
        if (STATE_RANK[a.state] !== STATE_RANK[b.state]) {
            return STATE_RANK[a.state] - STATE_RANK[b.state];
        }

        if (a.state === "changed") {
            const aBreak = a.is52wHigh || a.is52wLow ? 1 : 0;
            const bBreak = b.is52wHigh || b.is52wLow ? 1 : 0;
            if (aBreak !== bBreak) return bBreak - aBreak;
            return Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0);
        }

        return a.ticker.localeCompare(b.ticker);
    });

    return results;
}

module.exports = { computeWatchlistStatus, Z_THRESHOLD };

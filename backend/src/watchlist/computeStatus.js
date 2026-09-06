const WatchlistItem = require("../models/WatchlistItem");
const Snapshot = require("../models/Snapshot");
const Checkpoint = require("../models/Checkpoint");
const FetchStatus = require("../models/FetchStatus");

const Z_THRESHOLD = 2; // |z| >= 2 is "meaningful" (~top 5% of a stock's own moves)

// "Elevated" for the purpose of mentioning volume in the reason at all - a full
// standard deviation above this stock's own normal. Deliberately weaker than the
// 2-sigma bar that makes a PRICE move meaningful (Z_THRESHOLD): volume is
// confirmation/context (P1, D7), never a trigger, so it gets a lower bar for being
// worth mentioning at all, while still never being enough on its own to matter.
const VOLUME_ELEVATED_THRESHOLD = 1;

function isMeaningful(snapshot) {
    return (snapshot.zScore !== null && Math.abs(snapshot.zScore) >= Z_THRESHOLD) || snapshot.is52wHigh || snapshot.is52wLow;
}

// §11: the raw z-score is not the primary thing a non-technical user should see -
// translate it into what it means "for this stock," not the number itself. The
// number itself is never discarded (see zScore/volumeZScore/volumeMultiple on the
// returned item below) - it just moves to a secondary/detail surface.
function interpretZScore(absZScore) {
    if (absZScore >= 4) return "an extreme move for this stock";
    if (absZScore >= 3) return "a rare move for this stock";
    return "an unusually large move for this stock"; // 2 <= |z| < 3 (isMeaningful already gated |z| >= 2)
}

// Exposed separately (not just baked into the reason string) so the detail view can
// show the precise multiple without re-deriving it from raw volume/avgVolume.
function computeVolumeMultiple(snapshot) {
    if (snapshot.avgVolume === null || !(snapshot.avgVolume > 0)) return null;
    return snapshot.volume / snapshot.avgVolume;
}

// Conviction context, shown only when volume is actually elevated - an average or
// below-average volume day doesn't reinforce the move, so mentioning it would read
// as evidence when it isn't. Omits cleanly (no "null x" / "NaN x") whenever the
// z-score or the multiple isn't available, e.g. insufficient history.
function formatVolumeClause(snapshot, multiple) {
    if (snapshot.volumeZScore === null || snapshot.volumeZScore < VOLUME_ELEVATED_THRESHOLD || multiple === null) {
        return null;
    }
    return `${multiple.toFixed(1)}x normal volume`;
}

// Structure (§4/§11): FACT -> INTERPRETATION -> CONVICTION.
//   FACT: direction + magnitude, in plain percent - "Down 6.2%".
//   INTERPRETATION: what the number MEANS for this specific stock, never the raw
//     z-score itself; a 52-week break is its own plain-language interpretation.
//   CONVICTION: volume context, appended only when elevated, omitted cleanly otherwise.
function buildReason(snapshot) {
    const hasZTrigger = snapshot.zScore !== null && Math.abs(snapshot.zScore) >= Z_THRESHOLD;
    const hasBreak = snapshot.is52wHigh || snapshot.is52wLow;

    const direction = snapshot.changePct >= 0 ? "Up" : "Down";
    const fact = `${direction} ${Math.abs(snapshot.changePct * 100).toFixed(1)}%`;

    const interpretations = [];
    if (hasZTrigger) interpretations.push(interpretZScore(Math.abs(snapshot.zScore)));
    if (hasBreak) interpretations.push(`a new 52-week ${snapshot.is52wHigh ? "high" : "low"}`);

    let reason = `${fact} - ${interpretations.join(", and ")}`;

    const multiple = computeVolumeMultiple(snapshot);
    const volumeClause = formatVolumeClause(snapshot, multiple);
    if (volumeClause) {
        reason += `, on ${volumeClause}`;
    }

    return reason;
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
            zScore: snapshot ? snapshot.zScore : null, // precise value - kept for ranking + secondary display, never the primary reason text
            volumeZScore: snapshot ? snapshot.volumeZScore : null,
            volumeMultiple: snapshot ? computeVolumeMultiple(snapshot) : null,
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

            const aZ = Math.abs(a.zScore ?? 0);
            const bZ = Math.abs(b.zScore ?? 0);
            if (aZ !== bZ) return bZ - aZ;

            // Price magnitude is still the primary key above; volume only breaks a
            // genuine tie, never outranks a bigger price move (D7: confirmation, not
            // a standalone signal).
            return Math.abs(b.volumeZScore ?? 0) - Math.abs(a.volumeZScore ?? 0);
        }

        return a.ticker.localeCompare(b.ticker);
    });

    return results;
}

module.exports = { computeWatchlistStatus, Z_THRESHOLD };

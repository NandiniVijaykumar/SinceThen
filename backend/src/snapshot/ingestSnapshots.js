const mongoose = require("mongoose");
const WatchlistItem = require("../models/WatchlistItem");
const Snapshot = require("../models/Snapshot");
const fetchTickerSnapshot = require("./fetchTickerSnapshot");
const { classifyFetchError, recordFetchOutcome } = require("./fetchStatus");

const DELAY_MS = 200; // space between per-ticker calls, within a round
const RATE_LIMIT_COOLDOWN_MS = 45_000; // fixed cooldown before retrying a rate-limited round
const MAX_ROUNDS = 3;

const { Double } = mongoose.mongo;
const NUMERIC_FIELDS = [
    "close",
    "previousClose",
    "changePct",
    "volume",
    "fiftyTwoWeekHigh",
    "fiftyTwoWeekLow",
    "zScore",
    "volumeZScore",
    "avgVolume",
];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mongoose's Number schema-type cast unwraps a bson.Double back down to a plain JS
// number before handing it to the driver, and the driver then BSON-encodes any
// whole-valued JS number as int32, not double (e.g. a round close price like 1140,
// or volume). That's the actual cause of the int/double inconsistency - fixing
// it requires writing through the native collection, bypassing Mongoose's cast, so
// the Double wrapper survives to serialization.
function toDoubleFields(snapshot) {
    const fields = { ...snapshot };
    for (const key of NUMERIC_FIELDS) {
        fields[key] = fields[key] === null ? null : new Double(Number(fields[key]));
    }
    return fields;
}

async function upsertSnapshot(snapshot) {
    await Snapshot.collection.updateOne(
        { ticker: snapshot.ticker, tradingDate: snapshot.tradingDate },
        { $set: toDoubleFields(snapshot) },
        { upsert: true }
    );
}

// One ingestion function for both callers (daily scheduler + on-add single-ticker
// fetch): pass an explicit ticker list for a targeted fetch, or omit it to ingest
// every distinct watched ticker. Same upsert / failure-isolation / trading-date
// logic either way - no separate "quick fetch" path.
//
// Rate-limit handling (space -> backoff -> retry-failed -> cap-and-defer), entirely
// in-memory within this one function call: no persistent retry queue, no separate
// retry scheduler, no exponential backoff/jitter. Round 1 attempts every requested
// ticker with a small delay between calls. Any ticker that comes back rate-limited
// (as opposed to a genuine per-ticker failure) is deferred to the next round rather
// than retried immediately; failed rounds wait a fixed cooldown before the next
// attempt. After MAX_ROUNDS, anything still rate-limited stops being retried this
// run - it keeps its last-good snapshot (never touched, since a failed fetch never
// reaches the upsert), is reported as failed/deferred (not invalid), and picks up
// fresh data on the next scheduled run.
async function ingestSnapshots(tickers) {
    const targetTickers = tickers && tickers.length ? tickers : await WatchlistItem.distinct("ticker");

    const summary = {
        attempted: targetTickers.length,
        succeeded: 0,
        failed: [],
    };

    let pending = targetTickers;
    let round = 0;

    while (pending.length > 0 && round < MAX_ROUNDS) {
        round += 1;
        const rateLimited = [];

        for (let i = 0; i < pending.length; i++) {
            const ticker = pending[i];

            try {
                const snapshot = await fetchTickerSnapshot(ticker);
                await upsertSnapshot(snapshot);
                await recordFetchOutcome(ticker, "success");
                summary.succeeded += 1;
            } catch (err) {
                const classification = classifyFetchError(err);

                if (classification === "rateLimit") {
                    rateLimited.push(ticker);
                } else {
                    // Genuine per-ticker failure (not-found or ambiguous/transient) -
                    // never overwrite a good snapshot; just skip this ticker's upsert.
                    summary.failed.push({ ticker, error: err.message });
                }

                await recordFetchOutcome(ticker, classification);
            }

            if (i < pending.length - 1) {
                await sleep(DELAY_MS);
            }
        }

        pending = rateLimited;

        if (pending.length > 0 && round < MAX_ROUNDS) {
            await sleep(RATE_LIMIT_COOLDOWN_MS);
        }
    }

    for (const ticker of pending) {
        summary.failed.push({ ticker, error: "Rate-limited after max retry rounds; deferred to next run" });
    }

    return summary;
}

module.exports = ingestSnapshots;

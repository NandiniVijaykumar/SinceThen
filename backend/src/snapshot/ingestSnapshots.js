const mongoose = require("mongoose");
const WatchlistItem = require("../models/WatchlistItem");
const Snapshot = require("../models/Snapshot");
const fetchTickerSnapshot = require("./fetchTickerSnapshot");

const DELAY_MS = 200;
const { Double } = mongoose.mongo;
const NUMERIC_FIELDS = ["close", "previousClose", "changePct", "volume", "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "zScore"];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mongoose's Number schema-type cast unwraps a bson.Double back down to a plain JS
// number before handing it to the driver, and the driver then BSON-encodes any
// whole-valued JS number as int32, not double (e.g. a round close price like 1140,
// or volume). That's the actual cause of the int/double inconsistency (D8) - fixing
// it requires writing through the native collection, bypassing Mongoose's cast, so
// the Double wrapper survives to serialization.
function toDoubleFields(snapshot) {
    const fields = { ...snapshot };
    for (const key of NUMERIC_FIELDS) {
        fields[key] = fields[key] === null ? null : new Double(Number(fields[key]));
    }
    return fields;
}

// Failure isolation (CLAUDE.md §7): each ticker gets its own try/catch. A failure
// (network, rate-limit, malformed/incomplete data) skips that ticker's upsert only -
// the existing good snapshot, if any, is left untouched. One bad ticker never aborts
// the batch.
async function ingestSnapshots() {
    const tickers = await WatchlistItem.distinct("ticker");

    const summary = {
        attempted: tickers.length,
        succeeded: 0,
        failed: [],
    };

    for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];

        try {
            const snapshot = await fetchTickerSnapshot(ticker);

            await Snapshot.collection.updateOne(
                { ticker: snapshot.ticker, tradingDate: snapshot.tradingDate },
                { $set: toDoubleFields(snapshot) },
                { upsert: true }
            );

            summary.succeeded += 1;
        } catch (err) {
            summary.failed.push({ ticker, error: err.message });
        }

        if (i < tickers.length - 1) {
            await sleep(DELAY_MS);
        }
    }

    return summary;
}

module.exports = ingestSnapshots;

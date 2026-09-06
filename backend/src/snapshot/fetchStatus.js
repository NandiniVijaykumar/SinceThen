const FetchStatus = require("../models/FetchStatus");

const PROMOTION_THRESHOLD = 3; // consecutive not-found responses required to mark invalid

// Distinct from a per-ticker "not found" failure - rate-limiting is about the
// caller, not the symbol, and must never count toward invalidation.
function isRateLimitError(err) {
    const status = err?.response?.status ?? err?.statusCode ?? err?.status ?? err?.code;
    if (status === 429) return true;
    return typeof err?.message === "string" && /429|too many requests|rate.?limit/i.test(err.message);
}

// yahoo-finance2 throws a plain Error carrying Yahoo's own description ("No data
// found, symbol may be delisted") for an unknown/delisted symbol, or an HTTPError
// with .code set to the HTTP status for a hard 404. Anything else - malformed
// payload, a missing field, a network error, a timeout - is NOT a confirmed
// "this symbol doesn't exist" signal, so classifyFetchError defaults it to
// transient rather than guessing.
function isNotFoundError(err) {
    const status = err?.response?.status ?? err?.statusCode ?? err?.status ?? err?.code;
    if (status === 404) return true;
    return typeof err?.message === "string" && /no data found|not found|delisted|invalid symbol/i.test(err.message);
}

// Ambiguous/unknown errors default to "transient" (recoverable) - never "invalid".
// Promotion to invalid only ever happens through the explicit notFound path below.
function classifyFetchError(err) {
    if (isRateLimitError(err)) return "rateLimit";
    if (isNotFoundError(err)) return "notFound";
    return "transient";
}

// Created once, the first time a ticker is ever added by anyone, with the default
// 'pending' baseline. A no-op if the ticker is already tracked (e.g. a second user
// adds a ticker someone else already watches)
async function ensureFetchStatus(ticker) {
    await FetchStatus.updateOne(
        { ticker },
        { $setOnInsert: { ticker, fetchStatus: "pending", failedAttempts: 0, lastAttemptAt: null } },
        { upsert: true }
    );
}


//   success - 'ok', failedAttempts reset to 0.
//   notFound - failedAttempts += 1
//   transient/rateLimit - counts toward nothing
async function recordFetchOutcome(ticker, outcome) {
    const now = new Date();

    if (outcome === "success") {
        await FetchStatus.updateOne(
            { ticker },
            { $set: { fetchStatus: "ok", failedAttempts: 0, lastAttemptAt: now } },
            { upsert: true }
        );
        return;
    }

    if (outcome === "notFound") {
        const updated = await FetchStatus.findOneAndUpdate(
            { ticker },
            {
                $inc: { failedAttempts: 1 },
                $set: { lastAttemptAt: now },
                $setOnInsert: { ticker, fetchStatus: "pending" },
            },
            { upsert: true, new: true }
        );

        const nextStatus =
            updated.failedAttempts >= PROMOTION_THRESHOLD
                ? "invalid"
                : updated.fetchStatus === "ok"
                  ? "stale"
                  : updated.fetchStatus;

        if (nextStatus !== updated.fetchStatus) {
            await FetchStatus.updateOne({ ticker }, { $set: { fetchStatus: nextStatus } });
        }
        return;
    }

    // transient or rateLimit: record that an attempt happened, change nothing else.
    await FetchStatus.updateOne(
        { ticker },
        {
            $set: { lastAttemptAt: now },
            $setOnInsert: { ticker, fetchStatus: "pending", failedAttempts: 0 },
        },
        { upsert: true }
    );
}

module.exports = { classifyFetchError, ensureFetchStatus, recordFetchOutcome };

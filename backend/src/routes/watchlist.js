const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const WatchlistItem = require("../models/WatchlistItem");
const Snapshot = require("../models/Snapshot");
const Checkpoint = require("../models/Checkpoint");
const normalizeTicker = require("../utils/normalizeTicker");
const { computeWatchlistStatus } = require("../watchlist/computeStatus");
const ingestSnapshots = require("../snapshot/ingestSnapshots");

const router = express.Router();

router.use(requireAuth);

router.get("/watchlist", async (req, res) => {
    const items = await WatchlistItem.find({ userId: req.userId }).sort({ addedAt: -1 });
    res.json({ success: true, items });
});

router.get("/watchlist/status", async (req, res) => {
    const items = await computeWatchlistStatus(req.userId);
    res.json({ success: true, items });
});

router.post("/watchlist", async (req, res) => {
    const ticker = normalizeTicker(req.body.ticker);

    if (!ticker) {
        return res.status(400).json({ success: false, error: "Invalid ticker format" });
    }

    try {
        const item = await WatchlistItem.create({ userId: req.userId, ticker });

        // D14: new ticker = all-seen baseline as of the latest snapshot. If no
        // snapshot exists yet, leave the checkpoint unset for now - it reads as
        // awaiting-data, never as a change, until data actually arrives (below).
        const latestSnapshot = await Snapshot.findOne({ ticker }).sort({ tradingDate: -1 }).lean();
        if (latestSnapshot) {
            await Checkpoint.findOneAndUpdate(
                { userId: req.userId, ticker },
                { $set: { lastSeenTradingDate: latestSnapshot.tradingDate, lastSeenAt: new Date() } },
                { upsert: true }
            );
        } else {
            // Cache miss: no snapshot exists for this ticker at all (first time anyone
            // has watched it). Kick off the same ingestion function used by the daily
            // job, scoped to just this ticker, fully in the background - fire-and-forget,
            // own try/catch, never awaited. The add already succeeded from the DB's
            // perspective; the response below does not wait on Yahoo either way.
            ingestSnapshots([ticker])
                .then(async () => {
                    // Preserve D5/D14: a freshly added ticker must never surface
                    // historical "changes" once its first snapshot lands. Only set the
                    // baseline if nothing raced in ahead of us (e.g. a scheduled run,
                    // or the user re-adding after a fast remove) and already set one.
                    const existingCheckpoint = await Checkpoint.findOne({ userId: req.userId, ticker }).lean();
                    if (existingCheckpoint) return;

                    const freshSnapshot = await Snapshot.findOne({ ticker }).sort({ tradingDate: -1 }).lean();
                    if (!freshSnapshot) return; // ingestion failed/rate-limited - stays "awaiting-data"

                    await Checkpoint.findOneAndUpdate(
                        { userId: req.userId, ticker },
                        { $set: { lastSeenTradingDate: freshSnapshot.tradingDate, lastSeenAt: new Date() } },
                        { upsert: true }
                    );
                })
                .catch((err) => {
                    console.error(`Background on-add ingestion failed for ${ticker}:`, err.message);
                });
        }

        res.status(201).json({ success: true, item });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, error: "Ticker already in watchlist" });
        }
        res.status(500).json({ success: false, error: "Failed to add ticker" });
    }
});

router.delete("/watchlist/:ticker", async (req, res) => {
    const ticker = normalizeTicker(req.params.ticker);

    if (!ticker) {
        return res.status(400).json({ success: false, error: "Invalid ticker format" });
    }

    const deleted = await WatchlistItem.findOneAndDelete({ userId: req.userId, ticker });

    if (!deleted) {
        return res.status(404).json({ success: false, error: "Ticker not found in watchlist" });
    }

    await Checkpoint.deleteOne({ userId: req.userId, ticker });

    res.json({ success: true });
});

module.exports = router;

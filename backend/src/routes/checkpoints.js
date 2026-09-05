const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const WatchlistItem = require("../models/WatchlistItem");
const Snapshot = require("../models/Snapshot");
const Checkpoint = require("../models/Checkpoint");
const normalizeTicker = require("../utils/normalizeTicker");

const router = express.Router();

router.use(requireAuth);

async function latestTradingDate(ticker) {
    const snapshot = await Snapshot.findOne({ ticker }).sort({ tradingDate: -1 }).lean();
    return snapshot ? snapshot.tradingDate : null;
}

async function markSeen(userId, ticker, tradingDate) {
    await Checkpoint.findOneAndUpdate(
        { userId, ticker },
        { $set: { lastSeenTradingDate: tradingDate, lastSeenAt: new Date() } },
        { upsert: true }
    );
}

router.post("/checkpoints/:ticker/seen", async (req, res) => {
    const ticker = normalizeTicker(req.params.ticker);

    if (!ticker) {
        return res.status(400).json({ success: false, error: "Invalid ticker format" });
    }

    const item = await WatchlistItem.findOne({ userId: req.userId, ticker });
    if (!item) {
        return res.status(404).json({ success: false, error: "Ticker not in watchlist" });
    }

    const tradingDate = await latestTradingDate(ticker);
    if (!tradingDate) {
        return res.status(404).json({ success: false, error: "No data yet for this ticker" });
    }

    await markSeen(req.userId, ticker, tradingDate);

    res.json({ success: true, ticker, lastSeenTradingDate: tradingDate });
});

router.post("/checkpoints/seen-all", async (req, res) => {
    const items = await WatchlistItem.find({ userId: req.userId }).lean();

    let updated = 0;
    const skipped = [];

    for (const item of items) {
        const tradingDate = await latestTradingDate(item.ticker);

        if (!tradingDate) {
            skipped.push(item.ticker);
            continue;
        }

        await markSeen(req.userId, item.ticker, tradingDate);
        updated += 1;
    }

    res.json({ success: true, updated, skipped });
});

module.exports = router;

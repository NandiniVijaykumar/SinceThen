const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const WatchlistItem = require("../models/WatchlistItem");
const normalizeTicker = require("../utils/normalizeTicker");

const router = express.Router();

router.use(requireAuth);

router.get("/watchlist", async (req, res) => {
    const items = await WatchlistItem.find({ userId: req.userId }).sort({ addedAt: -1 });
    res.json({ success: true, items });
});

router.post("/watchlist", async (req, res) => {
    const ticker = normalizeTicker(req.body.ticker);

    if (!ticker) {
        return res.status(400).json({ success: false, error: "Invalid ticker format" });
    }

    try {
        const item = await WatchlistItem.create({ userId: req.userId, ticker });
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

    res.json({ success: true });
});

module.exports = router;

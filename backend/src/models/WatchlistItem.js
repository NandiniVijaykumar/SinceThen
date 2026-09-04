const mongoose = require("mongoose");

const watchlistItemSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    ticker: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
});

watchlistItemSchema.index({ userId: 1, ticker: 1 }, { unique: true });

module.exports = mongoose.model("WatchlistItem", watchlistItemSchema);

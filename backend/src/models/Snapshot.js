const mongoose = require("mongoose");

const snapshotSchema = new mongoose.Schema({
    ticker: { type: String, required: true },
    tradingDate: { type: String, required: true }, // "YYYY-MM-DD" derived in Asia/Kolkata
    close: { type: Number, required: true },
    previousClose: { type: Number, required: true },
    changePct: { type: Number, required: true },
    volume: { type: Number, required: true },
    zScore: { type: Number, default: null },
    zScoreWindow: { type: Number, required: true },
    fiftyTwoWeekHigh: { type: Number, required: true },
    fiftyTwoWeekLow: { type: Number, required: true },
    is52wHigh: { type: Boolean, required: true },
    is52wLow: { type: Boolean, required: true },
    insufficientHistory: { type: Boolean, required: true },
    fetchedAt: { type: Date, required: true }, // UTC
    name: { type: String, required: true },
});

snapshotSchema.index({ ticker: 1, tradingDate: 1 }, { unique: true });

module.exports = mongoose.model("Snapshot", snapshotSchema);

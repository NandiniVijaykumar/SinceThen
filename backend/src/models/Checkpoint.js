const mongoose = require("mongoose");

const checkpointSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    ticker: { type: String, required: true },
    lastSeenTradingDate: { type: String, required: true },
    lastSeenAt: { type: Date, required: true },
});

checkpointSchema.index({ userId: 1, ticker: 1 }, { unique: true });

module.exports = mongoose.model("Checkpoint", checkpointSchema);

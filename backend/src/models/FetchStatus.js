const mongoose = require("mongoose");

// per ticker
const fetchStatusSchema = new mongoose.Schema({
    ticker: { type: String, required: true, unique: true },
    fetchStatus: { type: String, enum: ["pending", "ok", "invalid", "stale"], default: "pending" },
    failedAttempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
});

module.exports = mongoose.model("FetchStatus", fetchStatusSchema);

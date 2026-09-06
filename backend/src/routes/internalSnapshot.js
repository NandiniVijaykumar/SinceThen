const express = require("express");
const ingestSnapshots = require("../snapshot/ingestSnapshots");

const router = express.Router();

// Cadence (supersedes "a few times per day"): the external pinger (cron-job.org)
// should hit this route ONCE PER TRADING DAY, in the evening IST (~18:00-19:00),
// after NSE close and after Yahoo has published the settled daily bar. Change
// detection and the z-score are both computed on completed daily closes (D9) - they
// cannot change again until the next close lands, so polling more often than daily
// adds Yahoo API load and failure surface for zero additional signal. This product
// is end-of-day by design, not intraday.
router.post("/internal/snapshot", async (req, res) => {
    const secret = process.env.INTERNAL_SECRET;
    const providedSecret = req.headers["x-internal-secret"];

    if (!secret || providedSecret !== secret) {
        return res.status(403).json({ success: false, error: "Forbidden" });
    }

    try {
        const summary = await ingestSnapshots();
        res.json({ success: true, ...summary });
    } catch (err) {
        res.status(500).json({ success: false, error: "Snapshot ingestion failed" });
    }
});

module.exports = router;

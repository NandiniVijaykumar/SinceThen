const express = require("express");
const ingestSnapshots = require("../snapshot/ingestSnapshots");

const router = express.Router();

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

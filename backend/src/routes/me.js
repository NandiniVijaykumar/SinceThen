const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const User = require("../models/User");

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(
            req.user.sub,
            {
                $set: { email: req.user.email, name: req.user.name },
                $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
        );

        res.json({ success: true, user: req.user });
    } catch (err) {
        res.status(500).json({ success: false, error: "Failed to load user" });
    }
});

module.exports = router;

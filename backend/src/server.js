const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const meRouter = require("./routes/me");
const watchlistRouter = require("./routes/watchlist");
const checkpointsRouter = require("./routes/checkpoints");
const internalSnapshotRouter = require("./routes/internalSnapshot");
const WatchlistItem = require("./models/WatchlistItem");
const Snapshot = require("./models/Snapshot");
const Checkpoint = require("./models/Checkpoint");
const FetchStatus = require("./models/FetchStatus");

require("dotenv").config();

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Backend is running"
    });
});

app.use("/api", meRouter);
app.use("/api", watchlistRouter);
app.use("/api", checkpointsRouter);
app.use(internalSnapshotRouter);

const PORT = process.env.PORT || 3000;

connectDB()
    .then(() => Promise.all([WatchlistItem.syncIndexes(), Snapshot.syncIndexes(), Checkpoint.syncIndexes(), FetchStatus.syncIndexes()]))
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Database connection failed:", err.message);
        process.exit(1);
    });
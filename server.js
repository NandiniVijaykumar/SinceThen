const express = require("express");
const YahooFinance = require("yahoo-finance2").default;

const app = express();
const yahooFinance = new YahooFinance();

app.get("/api/test-market-data", async (req, res) => {
    try {
        const result = await yahooFinance.chart("RELIANCE.NS", {
            period1: "2026-07-01",
            period2: "2026-09-04",
            interval: "1d"
        });

        res.json({
            success: true,
            symbol: result.meta.symbol,
            price: result.meta.regularMarketPrice,
            historyRows: result.quotes.length,
            fetchedAt: new Date()
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(process.env.PORT || 3000);
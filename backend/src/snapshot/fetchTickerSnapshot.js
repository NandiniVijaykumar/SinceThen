const { formatInTimeZone } = require("date-fns-tz");
const yahooClient = require("./yahooClient");

const Z_SCORE_WINDOW = 30;
const MIN_CLOSES_REQUIRED = Z_SCORE_WINDOW + 2; // 32 closes -> 31 returns -> 30-return baseline + today's return

function periodBounds() {
    const period2 = new Date();
    const period1 = new Date(period2.getTime() - 120 * 24 * 60 * 60 * 1000);
    return {
        period1: period1.toISOString().slice(0, 10),
        period2: period2.toISOString().slice(0, 10),
    };
}

function computeReturns(closes) {
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    return returns;
}

function sampleStdDev(values, mean) {
    const sumSquares = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
    return Math.sqrt(sumSquares / (values.length - 1));
}

// every derived value below comes from this one chart()
async function fetchTickerSnapshot(ticker) {
    const { period1, period2 } = periodBounds();

    const result = await yahooClient.chart(ticker, {
        period1,
        period2,
        interval: "1d",
    });

    if (!result || !Array.isArray(result.quotes) || !result.meta) {
        throw new Error("Malformed chart() response");
    }

    const validRows = result.quotes
        .filter((row) => row && row.date && typeof row.close === "number" && Number.isFinite(row.close))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (validRows.length < 2) {
        throw new Error("Not enough valid rows to compute a snapshot");
    }

    const latestRow = validRows[validRows.length - 1];
    const previousRow = validRows[validRows.length - 2];

    const close = latestRow.close;
    const previousClose = previousRow.close;

    if (!(previousClose > 0) || !(close > 0)) {
        throw new Error("Invalid close/previousClose values");
    }

    if (typeof latestRow.volume !== "number" || !Number.isFinite(latestRow.volume)) {
        throw new Error("Missing volume for latest trading row");
    }

    const fiftyTwoWeekHigh = result.meta.fiftyTwoWeekHigh;
    const fiftyTwoWeekLow = result.meta.fiftyTwoWeekLow;

    if (typeof fiftyTwoWeekHigh !== "number" || typeof fiftyTwoWeekLow !== "number") {
        throw new Error("Missing 52-week high/low in chart() meta");
    }

    // changePct is a RATIO, not a percent (e.g. -0.0085 == -0.85%) - multiply by 100 for display.
    const changePct = (close - previousClose) / previousClose;
    const tradingDate = formatInTimeZone(new Date(latestRow.date), "Asia/Kolkata", "yyyy-MM-dd");

    const closes = validRows.map((row) => row.close);
    const insufficientHistory = closes.length < MIN_CLOSES_REQUIRED;

    let zScore = null;
    if (!insufficientHistory) {
        const allReturns = computeReturns(closes);
        const todayReturn = allReturns[allReturns.length - 1];
        const baseline = allReturns.slice(-(Z_SCORE_WINDOW + 1), -1); // 30 returns preceding today's

        const mean = baseline.reduce((sum, r) => sum + r, 0) / baseline.length;
        const stdDev = sampleStdDev(baseline, mean);

        zScore = stdDev === 0 ? null : (todayReturn - mean) / stdDev;
    }

    const name = result.meta.longName || result.meta.shortName || ticker;

    return {
        ticker,
        tradingDate,
        close: Number(close),
        previousClose: Number(previousClose),
        changePct: Number(changePct),
        volume: Number(latestRow.volume),
        zScore: zScore === null ? null : Number(zScore),
        zScoreWindow: Z_SCORE_WINDOW,
        fiftyTwoWeekHigh: Number(fiftyTwoWeekHigh),
        fiftyTwoWeekLow: Number(fiftyTwoWeekLow),
        is52wHigh: close >= fiftyTwoWeekHigh,
        is52wLow: close <= fiftyTwoWeekLow,
        insufficientHistory,
        fetchedAt: new Date(),
        name,
    };
}

module.exports = fetchTickerSnapshot;

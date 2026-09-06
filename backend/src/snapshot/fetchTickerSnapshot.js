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

function mean(values) {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleStdDev(values, avg) {
    const sumSquares = values.reduce((sum, v) => sum + (v - avg) ** 2, 0);
    return Math.sqrt(sumSquares / (values.length - 1));
}

// Single shared z-score shape, reused for both price (baseline = trailing daily
// returns) and volume (baseline = trailing daily volumes) - D7's price z-score and
// the P1 volume z-score are the same formula over two different series, not two
// separate implementations. Mean + SAMPLE stddev (n-1) over the baseline, then
// z = (today - mean) / stddev. Guards against every non-finite outcome (a bad value
// anywhere in the baseline, a zero stddev, or a resulting Infinity/NaN) by returning
// null rather than ever surfacing a fabricated or broken number.
function computeZScore(baseline, todayValue) {
    if (!Number.isFinite(todayValue) || baseline.some((v) => !Number.isFinite(v))) {
        return null;
    }
    const avg = mean(baseline);
    const stdDev = sampleStdDev(baseline, avg);
    if (stdDev === 0) return null;
    const z = (todayValue - avg) / stdDev;
    return Number.isFinite(z) ? z : null;
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
    let volumeZScore = null;
    let avgVolume = null;

    if (!insufficientHistory) {
        const allReturns = computeReturns(closes);
        const todayReturn = allReturns[allReturns.length - 1];
        const returnBaseline = allReturns.slice(-(Z_SCORE_WINDOW + 1), -1); // 30 returns preceding today's
        zScore = computeZScore(returnBaseline, todayReturn);

        // P1 (D7): volume z-score as CONFIRMATION/CONTEXT, not a trigger of its own -
        // same window, same shape, just over raw volumes instead of returns. Sourced
        // from the SAME validRows series as price (D8 single-field-lineage), so
        // "today's volume" always lines up with the row tradingDate is derived from.
        const volumes = validRows.map((row) => row.volume);
        const todayVolume = volumes[volumes.length - 1];
        const volumeBaseline = volumes.slice(-(Z_SCORE_WINDOW + 1), -1);
        volumeZScore = computeZScore(volumeBaseline, todayVolume);
        avgVolume = volumeBaseline.every((v) => Number.isFinite(v)) ? mean(volumeBaseline) : null;
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
        volumeZScore: volumeZScore === null ? null : Number(volumeZScore),
        avgVolume: avgVolume === null ? null : Number(avgVolume),
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

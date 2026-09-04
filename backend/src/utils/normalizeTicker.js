const TICKER_REGEX = /^[A-Z0-9&.-]+\.NS$/;

function normalizeTicker(raw) {
    if (typeof raw !== "string") return null;

    let ticker = raw.trim().toUpperCase();
    if (!ticker) return null;

    if (!ticker.endsWith(".NS")) {
        ticker = `${ticker}.NS`;
    }

    if (!TICKER_REGEX.test(ticker)) return null;

    return ticker;
}

module.exports = normalizeTicker;

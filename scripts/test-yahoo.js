const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance();

// async function test() {
//     try {
//         const result = await yahooFinance.chart("RELIANCE.NS", {
//             period1: "2026-07-01",
//             period2: "2026-09-04",
//             interval: "1d"
//         });

//         console.log("Meta:", result.meta);

//         console.log("\nNumber of rows:", result.quotes.length);

//         console.log("\nFirst row:");
//         console.log(result.quotes[0]);

//         console.log("\nLast row:");
//         console.log(result.quotes[result.quotes.length - 1]);

//     } catch (error) {
//         console.error(error);
//     }
// }

// test();

const tickers = [
    "RELIANCE.NS",
    "TCS.NS",
    "INFY.NS",
    "HDFCBANK.NS",
    "ICICIBANK.NS",
    "SBIN.NS"
];

async function test() {
    for (const ticker of tickers) {
        try {
            const result = await yahooFinance.chart(ticker, {
                period1: "2026-07-01",
                period2: "2026-09-04",
                interval: "1d"
            });

            console.log(
                `✅ ${ticker} | ${result.quotes.length} rows | ₹${result.meta.regularMarketPrice}`
            );
        } catch (error) {
            console.log(`❌ ${ticker} | FAILED`);
            console.error(error.message);
        }
    }
}

test();
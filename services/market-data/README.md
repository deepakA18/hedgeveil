# Real maker market inputs

The public maker profile fetches the fixed Coinbase Exchange NEAR-USD ticker and
hourly candles itself. No API key or paid endpoint is used. It rejects stale/future
trades, crossed or >1% spread books, invalid prices and gaps in the last 169 closed
hourly candles. Volatility is annualized sample deviation of 168 hourly log returns.
Open candles are excluded. Raw responses are retained by snapshot hash.

`services/maker/valuation.mjs` derives P/N marks from a zero-rate/zero-carry European
call model and the observed spot/realized volatility. The model is a terminal-price
approximation; averaging-window basis, jumps, fees and carry are maker risks.
Realized volatility is not implied volatility and these are executable maker
valuations, not guaranteed fair values. Model arithmetic is floating point then
quantized at 10^-12; ledger and signed-quote amounts remain exact integers.

Testnet workers require `pricing_source: "coinbase"` and `market_archive` through
trusted startup configuration. They ignore caller-supplied `reference` values.
Only local Sandbox tests may retain the synthetic reference path. Market failures
yield no quote and use the existing cancellation/receipt handling for prior quotes.
Runtime wiring is implemented, but public deployment is still held on settlement
and integration acceptance.

This is a single exchange input authenticated by HTTPS to our maker process. It
is not independently signed oracle evidence and never authorizes settlement.
Both makers remain project-operated and project-funded.

```sh
node --test tests/market-data/pricing.test.mjs
node tests/sandbox/mkt03.mjs
```

The latter reads actual free external prices, runs two distinct maker processes,
and executes signed P/N buys and a sell in compiled-Wasm Sandbox. Network outages
can fail it; it does not substitute fixtures. Its source fault tests and numeric
model cross-checks are separate. See `research/reports/mkt03-live-market-sandbox.json`.

Sources: [ticker](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker)
and [candle API](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).

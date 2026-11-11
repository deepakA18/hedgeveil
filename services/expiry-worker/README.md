# Historical expiry worker (ORC-04 candidate)

Fixed Coinbase Exchange NEAR-USD trade history, not generated prices or candle
averages. The worker computes a last-trade-hold TWAP over the 30 minutes before
an immutable expiry. Exact microsecond/decimal arithmetic, consecutive trade IDs,
cursor continuity, both boundaries and a 60-second age ceiling are mandatory.
The independent Python rational calculation can replay the retained raw bodies.

```sh
cargo +1.97.1 test --manifest-path services/expiry-worker/Cargo.toml --locked --offline
cargo +1.97.1 build --manifest-path services/expiry-worker/Cargo.toml --locked --offline --release --target wasm32-wasip2
# Read-only HTTP collection: supply an already elapsed Unix expiry in seconds.
node scripts/collect-expiry-trades.mjs EXPIRY_SECONDS /tmp/expiry-evidence.json
cargo +1.97.1 run --manifest-path services/expiry-worker/Cargo.toml --locked --offline --quiet < /tmp/expiry-evidence.json
python3 services/expiry-worker/reference.py /tmp/expiry-evidence.json
```

The WASI binary accepts only `{"expiry_seconds":"…"}` and fetches fixed HTTPS
URLs. It returns `{calculation,evidence}`. The host binary accepts the evidence
bundle and returns a recalculated result. Limits: 64 pages, 1 MB per page, 2 MB
raw response bodies total; exhaustion fails. Prices use 10^12 USD/NEAR units.
The worker's execution time and resource budget are separately bounded.

`scripts/expiry-worker-testnet.mjs inspect` is read-only. Its `publish` and
`execute EXPIRY_SECONDS` modes use the existing private service-account journal;
they are actual testnet writes. Publishing uses FastFS transaction data: the
tiny-gas contract call deliberately fails, and is recorded as failed execution,
not a successful contract call. The downloaded artifact must match SHA-256 before
execution. Each execution attaches at most 0.02 test NEAR plus transaction gas.
Unknown submissions are recovered by hash and never automatically resent.

Real receipts are independently checked by:

```sh
node scripts/verify-expiry-execution.mjs WORKER_SHA256 EXPIRY_SECONDS
python3 scripts/build-expiry-oracle.py
node tests/sandbox/expiry-settlement.mjs
```

The separate resolver pins one worker build and `outlayer.testnet`. Its private
callback recomputes raw history and stores the evidence and response digests.
Initial on-chain admission is three pages/3,000 trades and 500 KB returned JSON,
which is narrower than worker retrieval. Larger histories delay settlement.
This limit and sustained live-data availability need acceptance before trading.
Contract callbacks authenticate the provider path; they do not independently
verify its TEE hardware or make Coinbase data trustless. Provider code/operator
upgrades remain a disclosed dependency.

Resolver execution is sponsored: exactly 0.02 test NEAR, with no resolver refund
entitlement. Outlayer's own excess-budget refund names the caller as payer;
NEAR's protocol refund after a failed call returns to the resolver as operating
funds. No failed or unknown call creates collateral credit or authorizes a resend.

Existing sampled series are unchanged. New-series deployment, aligned maker
valuation, indexer/schema integration and public lifecycle acceptance remain
separate gates; the terminal-price maker explicitly refuses this new profile.
See `research/reports/ORC04_HISTORICAL_WORKER.md` and `docs/SPEC.md`.

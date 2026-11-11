# Local funded maker processes

`worker.mjs` is the G5 Sandbox maker, launched twice by the
[market harness](../../tests/sandbox/g5.mjs). Each child owns a separate RFQ key
and funded ledger account. It queries the chain before quoting and signs exact
BUY, SELL and old/new ROLL legs using integer arithmetic. There is no public HTTP
relay, wallet integration, paid feed or testnet daemon yet.

From the repository root:

```sh
npm ci --prefix tests/sandbox --ignore-scripts
python3 scripts/build-core.py
node tests/sandbox/g5.mjs
```

The harness creates funded ephemeral accounts, registers both public keys, sends
requests over Node IPC, executes signatures in the compiled contract, reconciles
events and tears down both children and Sandbox. Account keys travel only in
memory over IPC; RFQ keys are generated independently inside each child. No `.env`
or key file is read or written. The worker accepts loopback `127.0.0.1` RPC only.
Installed NEAR dependencies come from the locked `tests/sandbox` package.

IPC messages carry an `id` and `method`: `init` takes `config`, `quote` takes
`request`, and `withdraw` retires the worker and cancels its issued quotes through
an epoch transaction. Replies contain the matching ID and `result` or `error`.
Initialization configuration names are `rpc_url`, `contract`, `maker`,
`account_key` (ephemeral, never log), `key_id`, `fee_receiver`, `initial_equity`
and `half_spread_bps`; the harness supplies all values without environment settings.
See its `worker`/request calls for the complete executable integration.

Requests specify `mode`, `asset`, `amount`, `taker`, and `reference`. ROLL also
specifies `old_asset` and optional `collateral_adjustment`. Reference data must
carry the exact label `SYNTHETIC MARKET REFERENCE`, a canonical nanosecond timestamp
and marks keyed by `P:<series>`/`N:<series>`. Marks are native collateral per claim,
scaled by 10^24, not USD settlement observations. The local harness controls them;
neither the label nor freshness checks authenticate a production price source.

Demo controls: 20 Q inventory target per claim, 40 Q prospective position cap,
10 NEAR maximum quote notional, 15-second TTL bounded by maturity, 30-second
reference freshness, 20% marked-equity loss cutoff and five-basis-point trade fee.
Half-spreads are 20/40 basis points for A/B plus inventory-distance adjustment.
Each maker starts with 80 NEAR collateral; storage, transaction fees and operating
wallet funds are separately subsidized by Sandbox genesis funding.

Malformed/stale/missing references or a marked loss breach cause a no-quote reply
and automatic epoch cancellation when quotes were issued. These checks run on
requests, not a background timer. Explicit retirement also cancels; a killed or
disconnected worker cannot cancel by itself. Cancellation errors must be checked
in actual receipt outcomes; signatures remain usable until cancellation or expiry.
There is no automatic payout or refund when a maker disappears. Restart needs a
new registered key ID because RFQ keys are ephemeral and IDs are never reusable.

The [G5 report](../../research/reports/G5_FUNDED_MARKET.md) separates sampled
spreads/fills, inventory, marked P/L, subsidies and failure outcomes. Risk guards
do not promise liquidity or profitability; broader concurrency and production
source/monitoring work remain pending.

DEM-01 retained workspaces optionally supply `state_file` and `resume` over trusted
local IPC. Those workers retain the generated RFQ key, issued nonce reservations,
epoch and retirement flag in a private file. Nonces are durable before a signature
is returned. Resume verifies the existing registered public key and never
automatically re-registers it; missing/corrupt state refuses startup. Default G5
and disposable APP-02 workers still generate ephemeral keys. See
[retained-demo custody and limits](../../docs/LOCAL_DEMO.md).

MKT-03 adds the [external market profile](../market-data/README.md). Public testnet
workers now require `pricing_source: "coinbase"` and `market_archive`; they fetch
actual public inputs and ignore request-provided references. Earlier fixture IPC
instructions above apply only to Sandbox tests. Actual-data compiled-Wasm fills
are recorded separately in `research/reports/mkt03-live-market-sandbox.json`.

Public testnet quotes allow 90 seconds for wallet review (Sandbox: 15), always
bounded by maturity. Pricing inputs must still pass freshness checks at issuance.
Testnet workers require a private `operation_journal` for epoch cancellations.
They retain the exact pending operation before broadcast, recover it before new
quotes after restart, and never resend an unknown attempt. The native runtime
includes both maker journals in canonical receipt discovery.

External ticker timestamps are validated at HTTP completion. A maker retains that
exact observation and waits up to ten finalized-head reads (500 ms intervals)
for chain time to reach it before pricing. Future/stale data and a chain that
does not catch up yield no quote; the 60-second source-age limit is unchanged.

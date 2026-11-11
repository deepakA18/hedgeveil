# Outlayer historical NEAR/USD feasibility — 11 November 2026

Follow-up: [the subsequent implementation report](ORC04_HISTORICAL_WORKER.md)
contains actual historical Outlayer executions. The assessment below preserves
what was known before those transactions; its HTTP-only evidence is historical.

Outcome: **credible custom-execution path; not an accepted settlement source**.
The current price-feed integration has no historical-window/TWAP method in the
reviewed source. Outlayer's general HTTP execution can potentially fetch history
and authenticate its execution, so replacing the provider is not yet necessary.
No paid API, signing key, deployment or transaction was used in this assessment.

## Verified evidence

Public repository HEADs inspected in temporary read-only review checkouts:

- Oracle: `888ae663803209e5689892d671657331852428f8` (unchanged from prior review).
- Platform: `3fb03a9ea91b5fbc82ee02a9547a6e73a7f23222`.

The oracle implements `request_custom_data` and `custom_call`, forwarding a
`fetch_custom_data` request to Outlayer and returning values/errors via a callback.
The custom fetch supports public HTTPS and JSON path extraction. Its `string`
mode can serialize an array selected by a nonempty path. However, an empty path
does not select the root JSON value: Coinbase's root-array response cannot simply
be requested with `json_path: ""`. Selecting each array index separately causes
separate HTTP fetches, not an atomic full-window snapshot. Number mode uses f64;
even string mode first parses JSON and therefore is not a raw-byte archive.
The wrapper timestamp is execution time; candle timestamps must come from the
fetched body. These details favor a small dedicated worker for complete history
validation and exact arithmetic over a collection of custom scalar requests.

Sources: [custom fetch code](https://github.com/out-layer/oracle-example/blob/888ae663803209e5689892d671657331852428f8/src/sources.rs),
[custom command](https://github.com/out-layer/oracle-example/blob/888ae663803209e5689892d671657331852428f8/src/main.rs#L1843),
[contract callback](https://github.com/out-layer/oracle-example/blob/888ae663803209e5689892d671657331852428f8/contract/src/lib.rs#L787).

A free public Coinbase request returned 31 one-minute candles for the requested
10 November 07:30–08:00 UTC NEAR/USD window. Filtering to [start,end) leaves exactly
30 distinct minutes with no gaps. The extra end-boundary bucket must be excluded.
[Raw response and request](outlayer-history-http-probe-2026-11-11.json) preserve
the body/hash. This was ordinary HTTPS, **not** execution inside Outlayer.
Coinbase explicitly permits missing candles in intervals without trades. OHLC
candles also cannot reconstruct a continuous intraminute TWAP. A mean of closes
would be a separately specified sampled index, not proof of Deribit's index.
[Coinbase endpoint semantics](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).

## Authentication and trust boundary

The platform supports `WasmUrl` with a SHA-256 hash and project references with a
specific version. Its worker checks downloaded Wasm against the requested hash.
This offers a way to pin the historical-fetch/validation algorithm. The reviewed
contract gates execution resolution on `operator_id`; a valid callback alone
does not independently prove the entire TEE attestation chain. Deployed code,
operator/worker authority and attestation linkage remain acceptance requirements.
[Execution source types](https://github.com/out-layer/outlayer/blob/3fb03a9ea91b5fbc82ee02a9547a6e73a7f23222/contract/src/lib.rs#L152),
[resolution authorization](https://github.com/out-layer/outlayer/blob/3fb03a9ea91b5fbc82ee02a9547a6e73a7f23222/contract/src/execution.rs#L372),
[operator check](https://github.com/out-layer/outlayer/blob/3fb03a9ea91b5fbc82ee02a9547a6e73a7f23222/contract/src/lib.rs#L842).

For the oracle callback route, checking only the predecessor is insufficient:
anyone can request custom data and name a receiver. Hedgeveil must originate the
fixed request, check returned sender identity, and match its pending request,
series, network, feed, window and policy. Caller-provided URLs, arbitrary result
IDs or replayed messages must not select settlement data. The direct execution
route should similarly use a private promise callback bound to the exact request.

A TEE authenticates execution under its trust assumptions; it does not establish
exchange accuracy, prevent later upstream historical revisions, or turn a single
venue into a multi-exchange index. Archive the complete evidence and define how
historical conflicts are handled before any claims are issued.

## Next acceptance work

1. Fix an index definition and source capable of supplying it: authenticated
   native TWAP, complete ordered trade history with boundary evidence, or an
   explicitly approved discrete index. Do not silently relabel candle closes.
2. Pin a worker and request schema; preserve source timestamps, response hashes,
   decimal bytes, coverage and source identity. Missing data fails closed.
3. Prove deployed testnet interface/code/authority, run one bounded genuine
   historical request and retain the actual callback/receipt and attestation
   evidence. Testnet execution costs test NEAR/gas; no paid HTTP key is inherently
   required by the onchain route, but execution is not costless.
4. Check repeated historical retrieval/conflicts, downtime replay, malicious
   callbacks, stale/out-of-window data, exact arithmetic and final redemption.

Dependencies: ORC-04/MKT-04, source policy in SPEC, ORC-03 callback evidence and
CORE-03 import. Invariant: the same immutable terms and accepted evidence yield
the same price regardless of submitter/time. Failure path: reject gaps, conflicts
and unverified execution; no fabricated fallback or changed old series.
Evidence: pinned source inspection plus one public HTTP history request only.
Independent oracle/contracts/economics/security reviewer: pending.

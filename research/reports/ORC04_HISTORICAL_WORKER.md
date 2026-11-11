# ORC-04 historical execution and resolver implementation — 11 November 2026

Outlayer **can execute a pinned worker over real historical Coinbase NEAR/USD
trades**. The completed testnet runs return the full raw history and exact TWAP;
independent Rust and Python rational replays agree. This is stronger than the
earlier HTTP-only feasibility check. It does not complete new-series release.

## Actual external execution

| Window, UTC | Worker SHA-256 | Exact scaled TWAP | Testnet transaction |
| --- | --- | --- | --- |
| 10:10–10:40 | `4383d4b11f703faf73f3a19acdb094bc5536ff345d66d084507daf0e3310ff01` | `3628930096707` | `4sAvFTRRAMkupPbNvDY7p8dVTbb4D2C9jQMzrnVycZnv` |
| 12:21–12:51 | `86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43` | `3742373527824` | `6sBS5ipAGteLFmUJqrHfmHy5QSZ94XmVWS87FY2f8DiB` |

The second build checks future timestamps against HTTP completion time, avoiding
false rejection of a legitimate trade that occurs during retrieval. It is the
hash pinned by the new resolver. It returned three pages / 398,072 JSON bytes.
Both windows use 10^12 USD/NEAR units and the declared last-trade-hold rule,
not an arithmetic average of trades or a candle-close approximation.

Each request attached 0.02 test NEAR from the previously funded service account.
Provider execution charges were 0.0012017112 and 0.0011722169 test NEAR,
respectively, plus blockchain gas. The second request initially had an UNKNOWN
RPC result; the journal recovered the same transaction without resubmitting it.

Evidence:

- [First real receipt](expiry-worker-execution-4383d4b11f703faf73f3a19acdb094bc5536ff345d66d084507daf0e3310ff01-1794393600.json).
- [Corrected worker receipt](expiry-worker-execution-86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43-1794401460.json).
- [Exact action/receipt binding and independent replay](orc04-real-history-verification-86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43-1794401460.json).
- [Content-addressed publication record](expiry-worker-publish-86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43.json).

FastFS publication deliberately uses a failed tiny-gas contract invocation as
transaction data. That record is labelled FAILED_CONFIRMED; only the separately
verified download and actual Outlayer execution establish artifact usability.
No failed publication is represented as successful contract execution.

## In-house boundary

`contracts/expiry-settlement` implements the separate `native-trade-twap-v1`
profile. Registration binds expiry, the exact 30-minute window, worker hash,
fixed Coinbase product, Outlayer account and policy hash before mint cutoff.
The private callback is tied to its outstanding request. It recomputes all raw
history checks and exact arithmetic, compares the returned calculation and
stores evidence/response hashes. No registrar or guardian can submit a price.
The guardian can pause requests/finalization; existing sampled series never
change terms. Pending calls are never reset by a timer. Explicit caller funds
pay for execution, separately from collateral and operating funds.

The initial callback admits at most three pages / 3,000 trades and 500,000 JSON
bytes. Worker retrieval has a larger limit. Oversized results stay unresolved;
this bounded profile needs live availability acceptance before enabling trades.
A single busy window can exceed this bound. General high-volume recovery would
need incremental verification or a separately reviewed compact attestation path.
This limitation must not be hidden by dropping trades or weakening staleness.

`tests/sandbox/expiry-settlement.mjs` records compiled-Wasm success/failure
receipts, callback rejection, exact payout import, both claim redemptions and
native withdrawal in [the Sandbox report](orc04-expiry-resolver-sandbox.json).
Its fault source is explicitly synthetic and Sandbox-only. It is not public
source evidence. The separate real receipts above contain actual Coinbase data.

## Remaining acceptance

Dependencies: FIN-01, ORC-03, MKT-03, CORE-03/04, INF-01, APP-01/02, frozen SPEC.
Invariant: immutable source/window and deterministic complete history produce the
same payout; missing/ambiguous history delays settlement, never invents a price.
Failure path: malformed/gapped/stale evidence rejects, UNKNOWN stays pending,
caller-funded known rejection can be explicitly retried.
Requests are sponsored with no resolver refund entitlement. Outlayer's excess
budget refund names the caller; a protocol-level failed-call refund instead
returns to the resolver as operating funds. Public keeper/UI acceptance must
disclose this before use.

- Align maker valuation with the arithmetic TWAP and native payout, including
  any already-observed portion. The terminal European model now explicitly
  refuses unresolved new-profile series; settled marks remain exact.
- Connect the new versioned schema/events to indexer reconciliation, collector
  and wallet metadata. Existing schema checks do not prove new indexer support.
- Validate live availability under the callback limits and operational recovery.
- Deploy a separate compatible clearinghouse/resolver profile and prove the
  complete public lifecycle with actual receipts before switching the desk.
- Independently review oracle, contracts, economics and security. Reviewer:
  **pending**. Production remains disabled; vault remains disabled.

Trust: Coinbase HTTPS and Outlayer's contract/operator. Pinning Wasm and checking
callback provenance does not independently attest its TEE or remove provider
upgrade risk. The selected price is a single-exchange NEAR/USD index; this does
not inherit Deribit's multi-exchange construction or reliability.

Reproduction commands: [worker README](../../services/expiry-worker/README.md).

Completed checks on the final candidate: 13 worker tests; two independent real
history replays; 16 compiled-Wasm Sandbox lifecycle/failure checks; 21 JS pricing,
raw-action and journal tests; 16 schema tests and reproducible generation; five
Python payoff tests and 565 shared vectors; locked root workspace tests and
format/Clippy checks; worker and new contract Clippy checks. The 3,000-trade
Sandbox fixture's most expensive resolver receipt used 113.600073494341 Tgas
against 150 Tgas allocated. This is measured fixture evidence, not an exhaustive
worst-case gas bound or a throughput benchmark.

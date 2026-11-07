# G1 public-ledger feasibility evidence

Measured locally on 7 November 2026, macOS ARM64. **66 state/outcome checks passed
across 148 recorded deployment/call transactions**, including 38 transactions with
expected failed receipts. These are isolated experiments, not the product contracts
or completion of every G1 gate. Independent G0/security review remains pending.

The runnable setup is [research/g1](../g1/README.md), with an explicit
[experiment specification](../g1/SPEC.md). [g1-sandbox.json](g1-sandbox.json) records
source/lockfile hashes, source base commit, Wasm hashes/sizes, node version/commit,
transaction hashes, receipt outcomes, gas and final account/storage measurements.
Hashes were checked against the current files after the run. Sandbox accounts and
keys were ephemeral; there was no testnet deployment or use of `.env` credentials.

## Gate decisions

| Task | Demonstrated locally | Still required / decision |
|---|---|---|
| G1-RUNTIME | Rust 1.96.0, near-sdk and standards 5.30.1; near-api-js 7.4.0; near-sandbox JS 0.3.5 / node 2.14.0; compiled Wasm deployment, views, transfers, callbacks, gas and storage | Root payoff library stays on 1.91.0. Testnet/cross-platform evidence and production budgets are not established |
| G1-TOKEN | FT and P/N namespaces coexist; direct MT transfer and atomic batch rollback; both receiver/resolver paths; registration/refund and unregister restrictions | MT is a candidate subset, not NEP-245 conformance. Retain public internal-ledger product path until full methods/storage/events/metadata and wallet/indexer validation pass |
| G1-ORACLE | Committed synthetic-window replay; bonded proposal/challenge, timed finality, disclosed adjudication and delayed resolution; authenticated immutable import | This is one observation per instance with locked bonds. Product collector, bond distribution, full fallback policy and evidence UI belong to G4; independent historical sources/economic security to G10 |
| G1-PAYOUT | Debit before payment, success, failure restoration once, callback panic and gas exhaustion after actual payment, malformed results, duplicate results, UNKNOWN quarantine | No reviewed receipt-outcome recovery or idempotent payout adapter. No timeout refunds/resends. Production remains blocked on G10 recovery |

## What the receipts establish

- Native deposit authorizes only registered predecessors. Storage and operations
  are funded by a separate 20-local-NEAR deployment allocation, with 8 account and
  32 retained-ticket caps; this is not product storage management.
- Normal payout credits the recipient by the exact amount. A nonexistent receiver
  yields confirmed failure and restores only the original owner's free balance.
- A real external transfer survives a deliberately panicking callback and a
  callback given one unit of gas. Both stay PENDING, then UNKNOWN; balances remain
  unavailable and the retry method does not exist. Fault injection is a separate
  artifact; the normal Wasm exports no `fault_*` methods.
- Replayed terminal success/failure cannot restore twice or rewrite a terminal
  ticket. A malformed result cannot turn an uncertain payout into success/refund.
  Unauthorized callbacks and unfunded debits fail.
- A callback succeeds with 32 tickets stored; ticket 33 is rejected without debit.
  The 8-account registration cap is exercised. These measure bounded fixtures,
  not maximal product load or a proof for every account-name/receipt interleaving.
- Oracle import rejects nonfinal, malformed, failed and mismatched results:
  request, series, source/config hash, version, window, proposer and challenge
  policy. Full terms also bind units/scale, adjudicator, arbitration duration and
  bond. Final price is immutable; repeat imports are idempotent.
- Unauthorized/zero/wrong-source proposals and premature finalization fail.
  A challenged result requires the disclosed adjudicator in its window; a missed
  arbitration deadline delays resolution instead of inventing a price.
- FT and MT receivers exercise panic, malformed output, excessive refund requests,
  partial return, burning and spending before return. Refunds respect remaining
  balances, and burns reduce supply without minting replacement tokens. Duplicate
  MT asset IDs and an insufficient second batch leg revert atomically. Private
  resolvers reject direct external calls.

The deterministic synthetic file averages to **4 USD/NEAR**, encoded as
`4000000000000` at scale `10^12`. Its historical window, source bytes, aggregation
and test authority/policy are committed and hashed. Separate-process replay gives
the same result. Synthetic prices do not establish market accuracy or independence.

## Measured costs and custody

Gas below sums transaction plus receipt gas burnt for successful final outcomes;
receiver-failure tests may still end successfully after the resolver refunds.
It is a local measurement, not a gas cap recommendation or production estimate.

| Operation | Observed total Tgas range |
|---|---:|
| Core deposit | 1.8591 |
| Core withdrawal, including confirmed failure | 4.6007–5.3837 |
| Core oracle request/import | 5.5835–5.5905 |
| Oracle proposal | 1.8112 |
| Oracle uncontested finalize | 1.7783 |
| FT transfer-call receiver cases | 6.5531–10.7527 |
| MT transfer-call receiver cases | 5.7386–9.5174 |

The payout callback itself used 1.3794–1.7717 Tgas in the measured normal core
cases against its 15 Tgas allocation. One-unit callback gas deliberately fails.

Normal core storage was 191,647 bytes at 32 tickets/8 accounts, including Wasm and
state. The node returned `10000000000000000000` yoctoNEAR per byte; that measurement
implies 1.91647 local NEAR of storage stake. The harness queries this parameter;
it is not embedded as a product constant. Normal native custody covers free
balances plus measured storage. Free user collateral reconciles exactly to
`8999999999999999999999970` yoctoNEAR after the successful payouts and one failure
restoration. Gas/storage remain outside that user credit.

The fault core retains 2 local NEAR of UNKNOWN obligations after the test proved
the recipients were paid. The harness does not count these obligations as
spendable balances or automatically release them. Actual native balances, storage,
free balances and quarantined amounts are separately recorded; a complete product
custody reconciliation still belongs to CORE-01/04.

## Validation and remaining boundaries

Both normal and fault builds pass Wasm-target Clippy with warnings denied and
format checks. Root Rust tests/Clippy/format, five Python financial tests, all 565
reproducible vectors and nine public-schema groups still pass. All 59 archived
privacy-track checksums are unchanged.

The MT fixture lacks batch transfer-call, complete standard views/metadata/events,
per-asset storage/refunds/cleanup and complete pending-unregister handling. The FT
fixture disables forced unregister and uses protocol restrictions, so passing
these tests is not an unrestricted NEP-145 compliance claim. Neither fixture is
backed P/N issuance or proportional vault shares. No browser wallet or external
indexer conformance result is claimed.

There is no independent review, production oracle, verified UNKNOWN recovery,
product access-key/upgrade design, long-running indexer, economic policy result or
public deployment here. Proceed to G3 only with the G0 review and outstanding G1
interface decisions made explicit. G2 economics can advance independently.

Primary references: [NEAR integration testing](https://docs.near.org/smart-contracts/testing/integration-test),
[official Sandbox runner](https://github.com/near/near-sandbox-js),
[SDK/standards source](https://github.com/near/near-sdk-rs), and
[NEP-245](https://github.com/near/NEPs/blob/master/neps/nep-0245.md).

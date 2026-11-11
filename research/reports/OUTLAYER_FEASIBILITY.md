# ORC-03 — Outlayer NEAR/USD feasibility

**Subsequent user decision, 9 November 2026:** the public release now requires
real external data. The synthetic-testnet option discussed in this report is
superseded by [the real-data release requirement](../../docs/REAL_DATA_READINESS.md).
The observations below remain historical evidence; no external settlement
integration is implied by the scope change.

Date: 9 November 2026. Outcome: read-only integration implemented; direct expiry
settlement is **not accepted**. No transaction, paid API request, wallet signing,
contract deployment or end-to-end callback test was performed. Independent
oracle/contracts/security review is pending.

## Reproducible public evidence

[Discovery](outlayer-discovery-2026-11-09.json) and
[identity-pinned repeat](outlayer-pinned-2026-11-09.json) retain raw RPC responses,
decoded views, finalized block identity, deployed code hashes and local probe
source hashes. Each network's views use one finalized block. The repeat matched
the observed genesis/code identities; this does not prove that the deployment
matches the reviewed upstream source. Observation pins are in
`deploy/testnet/outlayer-observation-pins.json`.

| Observation | Testnet | Mainnet (read-only comparison) |
|---|---|---|
| Native account | `price-oracle.testnet` | `price-oracle.near` |
| Discovery block | 276918494 | 223765543 |
| Pinned repeat block | 276918984 | 223766036 |
| `get_price_data`, asset `wrap.near` | price null | price null |
| Native `get_price` compatibility method | contract view error | null |
| Owner | `zavodil2.testnet` | `owner.price-oracle.near` |
| Council queries | contract view errors | one member, threshold 1 |
| Subsidized calls enabled | false | false |

Testnet's stored report timestamp was `1794001259329893046` ns, over two days
before discovery. Both native caches were unavailable at these observations;
that does not establish that the on-demand service is unavailable. The native
testnet interface also differs from mainnet. Do not infer deployed capabilities
or multiple independent controllers from directory/DAO labels alone. Full access
keys, upgrade controls, enclave attestation and source equivalence were not audited.

## Source review and compatibility

The [NEAR directory](https://docs.near.org/primitives/oracles) identifies these
deployments. [Outlayer's documentation](https://price-oracle.outlayer.ai/docs/)
describes cached views and on-demand calls, with a 0.02 NEAR deposit in its request
examples. That example is not a measured cost or an accepted production budget.

Reviewed upstream commit:
`888ae663803209e5689892d671657331852428f8`.

- [`get_price_data`](https://github.com/out-layer/oracle-example/blob/888ae663803209e5689892d671657331852428f8/contract/src/lib.rs#L497)
  uses current block time for the response timestamp. It is not the timestamp of
  the venue observation.
- [`oracle_call` and `request_price_data`](https://github.com/out-layer/oracle-example/blob/888ae663803209e5689892d671657331852428f8/contract/src/lib.rs#L656)
  can return cached data when the contract considers it recent. The source does
  not support treating every call as a fresh upstream observation.
- [WASI response ingestion](https://github.com/out-layer/oracle-example/blob/888ae663803209e5689892d671657331852428f8/contract/src/lib.rs#L1174)
  stores current block time instead of the response's optional upstream timestamp.
  Its price conversion also passes through floating point. Our reader uses exact
  integers, but cannot restore information already discarded upstream.
- [Pyth compatibility](https://github.com/out-layer/oracle-example/blob/888ae663803209e5689892d671657331852428f8/contract/src/pyth.rs#L140)
  derives publish time from recent reports and sets confidence to zero. That
  format does not establish Pyth provenance or zero uncertainty.

The reviewed native request methods take assets, not a historical expiry window.
Hedgeveil instead imports an immutable, finalized `get_resolution(series_id)`
record bound to config, observation window and units. An account-address swap
cannot satisfy that contract. A fresh current price after downtime cannot silently
replace the price at maturity. These findings concern the inspected native path;
they do not prove that all possible Outlayer integrations are unsuitable.

## Implemented boundary and failure handling

`services/outlayer/reader.mjs` has no signer or transaction method. It checks chain,
optional observed identity pins, same-block views and exact decimal strings;
normalizes USD/NEAR to the protocol's 10^12 price scale; rejects precision loss,
overflow, future/unsafe timestamps and ambiguous aggregation. A consumer age bound
of 60 seconds is diagnostic, not a newly adopted financial rule. Even a recent
report always returns `settlement_eligible: false`. Missing/stale data never
becomes zero or a substituted synthetic market price.

The existing `open` plan and newly generated plans carry a deployment hold.
Bootstrap/deploy stop before signing-key loading or any transaction. Receipt
recovery remains available. Private generated keys and retained journals were
preserved. No Rust payoff, settlement or synthetic-fixture behavior changed.

## Funding decision

The public owner balance is 50 test NEAR (read-only status check, block
`BayGHpQ9nbqSQAvgZf84r1VkGURscSUZZqkfkpWa7HHz`). The former 81 minimum is held,
not a request to obtain another 31 tokens. No funds were spent by this work.

If a future design removes the old 30-NEAR oracle allocation, six 0.5-NEAR
publishers and 0.5-NEAR arbitrator, the old budget's remaining arithmetic is
47.5 NEAR including the owner's 1-NEAR buffer. This is **not an executable quote**:
it excludes replacement adapter storage/reserves, update requests and additional
gas. It retains the old core/maker/admin allocations. An external price provider
does not automatically remove the need for settlement logic or its storage.

## Remaining acceptance

Dependencies: ORC-01/02 historical rules and resolver, APP-01 callback/receipt
boundary, DEM-01 deployment costs. Reviewer: oracle/contracts/security, pending.

1. Establish authenticated observation time, source/asset identity, retention and
   replay of the specified historical window after downtime. Evaluate a signed
   feed/archive path separately; signatures alone do not establish price accuracy
   or historical availability. Keep local development free of paid API keys.
2. Verify actual deployed interface, source/code relationship, governance and
   upgrades. Execute an explicitly bounded on-demand testnet request and retain
   its full receipt/callback evidence if this path is pursued.
3. Specify the adapter in SPEC before changing financial behavior; implement
   fixed-term binding, precision, outage, duplicate, late and failed callback
   handling. Require compiled-Wasm/Sandbox evidence and independent review.
4. Measure replacement setup costs, revise public/private plans together, then
   resume the public options lifecycle. Production and vault remain disabled.

The existing synthetic resolver remains usable for deterministic local lifecycle
tests. A disclosed synthetic testnet demo remains allowed by the root plan, but
its currently held funding plan must be reconsidered before deployment.

## Validation

- 13 oracle/hold test groups passed; 22 including adjacent setup/indexer tests.
- Five Python reference tests and all 565 shared vectors passed.
- Root locked Rust tests, formatting and Clippy passed; contract workspace locked
  test command, formatting and wasm-target Clippy passed using its own toolchain.
  The contract test command is not a substitute for compiled-Wasm execution.
- Schema regeneration/check and all 11 schema test groups passed. All 59 archived
  checksums were unchanged; retained probe source hashes matched. Both held CLI
  commands rejected deployment as expected. Existing Sandbox evidence was
  preserved; no new contracts landed.

Run the probe and tests using the commands in the repository README. No observed
price, method failure or pending acceptance above is a fabricated success.

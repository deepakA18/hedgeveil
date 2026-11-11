# Public native testnet deployment — 10 November 2026

The owner approved the replacement transfer and changed account layout. The
48-test-NEAR funding transaction has exact matching finalized receipt evidence:
`4HZ3pepUhzm7GZGYvfJMyCNXqBCRQH3dokU4EeVJsB7H`.
No access key was added to the owner's wallet. The earlier blocked named-account
attempt remains held and unresolved, with its journal preserved.

All 18 funding/setup operations have complete successful finalized receipt trees.
[Machine-readable evidence](orc03-public-native-deployment.json) retains those
receipts, code hashes, series and same-block account/contract reads. This is
operator verification, not independent review or public trader acceptance.

| Role | Account |
|---|---|
| administrator | `20ddea9833434ebf11950ff12d97554cb32a78331c80b2c6f241b2108aed555b` |
| core | `a04fc180df781a94b9cb32cd6c8c65cb8bd59a6446389c7ed4d6e20bae4ae437` |
| oracle | `8baae1005eb54ea8c55cc4733b15a519b47e17ca6714b848069ac51ed653d553` |
| maker | `6b79b50ef1a4333c0edba636fff8b6f3bce1eafe78cc7daa45e394b6bd0d6134` |
| maker | `22d6604631bda66ce1f824944e84574e2f1a447ec1412c84dde41bfefe17fdbe` |

Both makers hold 2 free NEAR, 2 P and 2 N for `alpha`, backed by their deposited
collateral. The administrator retained about 0.78772 test NEAR after setup.
The vault is disabled. Source is the pinned `price-oracle.testnet` native adapter;
source ingestion time, up-to-300-second provider input caching and project-run
liquidity remain disclosed. P/N remain internal-ledger positions.

The immutable first series has mint cutoff / sampling start **09:15:19 IST**,
maturity **09:24:19 IST**, and earliest finalization **09:25:19 IST** on
10 November 2026. Three equal three-minute slots are required. Missing data
delays settlement; successful deployment does not establish sampling success.

The local wallet desk runs at `http://127.0.0.1:8794`. At this checkpoint its
indexer has not reconciled, so trading remains blocked. RPC read-path diagnosis
is ongoing. The original archival endpoint returned a deprecation HTTP 429;
setup was resumed on `https://test.rpc.fastnear.com/` after chain/source checks.
Confirmed setup operations were recovered, never resent. The collector is
running separately and initially reports `WAIT_WINDOW`.

Remaining acceptance: fresh indexer reconciliation, actual public-wallet ledger
and trade operations, external sampling/finalization/import, redemptions,
withdrawal and runtime restart. Independent security/release review pending.
Dependencies: native transfer profile, APP-01/02, INF-01, ORC-03 and MKT-03.
Invariant: exact receipts, separated collateral, no synthetic fallback.
Failure path: halt risk on reconciliation failure; preserve unknown operations.

## First collection attempt and recovery

The bounded source refresh succeeded with hash
`HBcXFSU4Awu5PMxoKdkuZehg9B1rpr9S4ZEvZgVGxHvB` and returned actual external
NEAR/USD data. RPC errors delayed the next collection step beyond the freshness
budget; no sample was accepted in the first slot. The collector reports
`DELAYED_MISSING_SAMPLE` for slot 0 and stops further refresh spending. This is
failure-path evidence, not successful settlement. No timestamp, series window
or price was rewritten, and no paid retry was authorized by the timeout.

Each project maker still held its intact 2 P + 2 N pair. The existing contract
merge rule recombined those into free collateral, with confirmed hashes:

- `4EBRdrC8yGfSxqYtezsbNm6QBrkgN2JRRafvUGAMej23`
- `88bffuh7KtPGakmRevX1fHVSywAGdPsemfYeEVp8GyBS`

This consumes both claims under the standard merge rule; it is not an oracle
settlement or a timeout refund. No public trader position was opened.

The indexer now supports bounded four-read header prefetch and an explicitly
bound `watched-roots` discovery mode. It verifies the full parent-linked path,
complete selected receipt trees, event sequence and same-block state commitments.
Indirect calls through an unselected third-party root must fail reconciliation
until discovered; this liveness limit is disclosed in SPEC. A separate database
schema preserves the earlier full-network checkpoint. The wallet desk can open
while synchronization runs; risk remains gated. Sixteen indexer tests, nine
compiled-Wasm/PostgreSQL checks and 70 wallet/indexer/origin regressions pass.
Public indexer health and a successful new-series lifecycle remain pending.


Public restart acceptance also passed: after stopping the process, inspecting and
removing only its dead ownership lock, the same database resumed to a fresh
RECONCILED checkpoint. The same 20 transaction hashes, 68 outcomes, 15 events,
all ledger balances and resolver commitment were retained; no on-chain operation
was replayed. Evidence: `research/reports/native-public-indexer-restart.json` and
`research/reports/native-public-indexer-restart-check.json`. The user has been
asked to sign separate 0.04096-test-NEAR storage and 0.1-test-NEAR collateral
transactions at port 8794. Those signatures and the subsequent real lifecycle
remain pending; no timed beta series was started prematurely.

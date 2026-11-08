# G7 / INF-01 local indexer evidence

8 November 2026. Local PostgreSQL finalized event discovery/replay, read API,
metrics and alert implementation. Dependencies: CORE-01 events and custody,
ORC-02, MKT-01, VLT-01/02 and APP-01 wire conventions. Invariant: every accepted
checkpoint's derived balances and oracle aggregates match chain views at the same
finalized block; gaps, ambiguity and failures never authorize cursor advancement
or a money-moving transaction. Infrastructure/contracts/security independent review
remains **pending**, with no invented sign-off. This is not completion of G7.

## Implemented behavior

The read-only worker discovers transactions from chunk hashes in finalized block
ancestry, starting before deployment. It scans all transaction destinations because
callbacks can reach watched contracts indirectly. Only complete FINAL outcomes
are retained; receipt links and receipt/log/item event identity are durable.
Failed receipt logs cannot change balances. Outcomes executing after the selected
checkpoint remain retained but unpublished until their block enters the accepted
ancestry. The standalone Sandbox chunk RPC returns zero for inclusion height;
the indexer correctly uses the containing block's chunk inclusion metadata.

Core replay checks the exact existing domain-bound operation sequence and replays
all accounting deltas. Oracle replay checks contiguous explicit sequences and bond
aggregates. Every account, series, vault, market registry, ticket and oracle case
view is queried at the same block hash. These snapshots are explicitly labelled
chain views; per-owner oracle bond credits are not claimed to be reconstructed
from aggregate-only oracle events. Unfilled quote depth/freshness is unobserved.

PostgreSQL uses exclusive writer serialization and one transaction for blocks,
transactions, linked outcomes, deduplicated events, projections, matched snapshots,
alerts and cursor publication. API reads use a consistent database snapshot.
Financial values remain decimal strings/BigInt/NUMERIC(39,0). Failed synchronization,
excessive lag or stale data disables API risk admission while preserving the last
accepted state and owner exit access. There is no signer, automatic transaction,
payout retry, refund, contract pause or notification sender in this service.

The sole contract change is the oracle's additive read-only `indexer_status`
view exposing network, account and sequence. It changes no storage layout,
settlement, financial behavior or event schema. The clearinghouse binary is
unchanged from APP-01. No public or production deployment was made.

## Execution evidence

[Machine-readable report](g7-indexer.json) contains source SHA-256s, pinned artifact
identities, chain/anchor binding, real transaction outcomes, accepted checkpoint
reconciliation results and final PostgreSQL-derived snapshots/balances/events.
The run passes **21 acceptance checks**, records **38 deployment/method
transactions**, and publishes **42 canonical core/oracle events** and **21 ledger
balances**. The report's database counts include other discovered setup transactions
and all accepted block/receipt links; they are not hand-written success records.

| Acceptance path | Actual evidence |
|---|---|
| Cross-receipt timing | Checkpoint at a withdrawal request's execution block shows PENDING; later callback outcomes are retained but not yet projected |
| Same-block consistency | Normal core, separate fault core and real demo oracle reconcile at one hash |
| Atomic interruption behavior | Injected failure before PostgreSQL commit leaves both cursor and balances unchanged; health disables risk |
| Fresh-process restart | Separate CLI process resumes the existing database and applies the actual restoration callback |
| Duplicate delivery | Reapplying an already accepted transaction batch does not duplicate events or balances |
| Missing events | Deliberately omitted real MERGE event fails sequence/custody matching and cannot advance cursor |
| Incorrect views | Deliberately corrupted snapshot balance fails reconciliation without publishing it |
| RPC outage | Read failures preserve the cursor, never masquerading as empty blocks |
| RPC fallback | HTTP-503 primary falls back to the identity-checked real Sandbox endpoint |
| Oracle lifecycle | Committed synthetic observations, actual proposal/challenge/adjudication, bond credit restoration and core resolution callback reconcile |
| Market/vault ownership | Signed funded fill, consumed maker nonce, basket mint, redemption and full in-kind exit match actual balances |
| Callback failure | Native payout succeeds, callback panics in the separate fault artifact, and UNKNOWN flight/alerts remain without resend |
| Fresh database | Independent new PostgreSQL schema backfills the complete retained history and reproduces every balance |
| API/metrics | Actual HTTP GETs return decimal strings, checkpoint provenance and health; POST is rejected |

The receipt-timing case deliberately selects an earlier real finalized header;
all associated views and execution outcomes still come from the actual node.

Injected omission, corruption, precommit exception and transport outage are test
faults applied to actual chain-derived batches. They are not successful chain
receipts. A separate model/transport fixture suite is explicitly distinct from
this compiled-Wasm execution. The service does not submit any of the transactions;
the Sandbox harness's ephemeral in-memory test accounts do so.

The harness uses genesis-funded accounts and the committed G4 synthetic price
dataset with a fresh observation window. It does not assert market liquidity,
source independence, economic profitability or load benchmarks. A long local
epoch (`1000000`) keeps history available during accelerated time advancement.
The initial short-epoch experiment correctly stopped at an unavailable historical
block; the worker was not changed to skip gaps. This is a local fixture retention
setting, not proof of a public archival RPC service.

## Runtime and artifacts

Node 24.8.0; PostgreSQL **18.6** through pinned embedded-postgres 18.6.0-beta.19;
node-postgres 8.23.1; Ajv 8.17.1; near-api-js 7.4.0; near-sandbox JS 0.3.5;
Sandbox 2.14.0; Rust 1.96.0 / near-sdk 5.30.1. PostgreSQL and Sandbox run locally
on macOS ARM64. The root payoff workspace remains pinned to Rust 1.91.0.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| clearinghouse.wasm | 614,630 | `378f6ce6e57e073670d53580b64d6f1744b9c8ca2f54c2022e608e345fa3a007` |
| clearinghouse-fault.wasm | 620,800 | `b9d53331a4a996eb02697f517a3d2da36f5d1616296edf5153b2d73f314fc556` |
| settlement-oracle.wasm | 384,252 | `2ccced7a6ba697f38a142e627c96acf3bbe0eb3e128c5a4375141810843f8e75` |
| settlement-oracle-fault.wasm | 391,603 | `9605b1b7d863c6c1388022d493e5e4216e80d038dd798a75ad5eef1b5ceca4d7` |

The first three artifacts are deployed in this harness. The oracle fault artifact
is built and linted here, not deployed in this run. Original G3–G7 receipt reports
and archived checksum evidence remain historical, unchanged, and associated with
their own artifacts. No earlier report is relabelled as a run of this revision.

## Verification and remaining work

Five model/RPC test groups pass. The separate native PostgreSQL suite verifies
rollback, restart persistence, identical/conflicting duplicate delivery, concurrent
writers, omitted events, wrong database binding, stale/lagged health, read-only
HTTP and metrics. The 21 Sandbox checks above pass on the compiled artifacts.

The five Python payoff tests, 565 reproducible vectors, three locked root Rust
tests, both workspace formatting checks, root Clippy, normal Wasm workspace and
fault-oracle Clippy, 11 schema test groups, schema regeneration/check, 20 existing
SDK/RFQ/keeper tests and RFQ binary-vector reproducibility also pass. Contract
workspace `cargo test --locked` defines no host contract tests; actual contract
execution evidence comes from Sandbox. No independent audit is implied.

See [configuration/commands](../../docs/INDEXER.md) and
[runbooks](../../docs/RUNBOOKS.md). No existing `.env`, wallet key, global PostgreSQL
service or unrelated database is modified. Test DB credentials stay in ignored
local configuration and never enter committed evidence.

The next application work is browser wallet/storage and APP-02 UI integration.
Those clients must consume health before relying on new-risk advice; the current
SDK does not yet enforce that API flag. Public testnet, cryptographic receipt-proof
verification, high-volume/incremental indexing, database/process power-loss drills, archival-provider validation,
operator notifications/on-call procedures, live quote monitoring and independent
review remain open. Bounded local replay fails closed at configured limits.
Production remains disabled and G2 still selects no passing recurring vault policy.

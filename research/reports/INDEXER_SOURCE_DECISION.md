# Indexer data-source decision — 10 November 2026

The immediate requirement is real finalized testnet history plus Hedgeveil's
complete receipt, event-sequence and custody checks, without a paid API key.
A third-party data service supplies chain data; it does not establish monetary
success or replace protocol reconciliation.

| Option | Evidence / fit | Decision |
|---|---|---|
| nearcore NEAR Indexer | Official tutorial runs a network node and states Linux x86 support, not macOS; adds node operations/synchronization | Not the three-day Mac demo path |
| Neardata hosted headers | Official NEAR guide links it for hosted data; two actual unauthenticated testnet GETs returned the deployment anchor and a recent header | Use for numeric-height prefetch, retaining RPC-pinned head and complete parent ancestry |
| SubQuery | Current official NEAR quick start has mapping handlers, schema/code generation, local Docker/PostgreSQL and a query service | Viable future/general indexer; switching requires new mappings and revalidation, not an immediate repair for existing reconciliation |
| Public JSON-RPC full-network scans | Observed rate limits while reading unrelated chunks repeatedly | Retain as full-history test/profile; native local demo uses journal root discovery and actual RPC receipt checks |

Read sources:
- https://docs.near.org/data-infrastructure/indexers
- https://docs.near.org/data-infrastructure/near-indexer
- https://docs.near.org/data-infrastructure/tutorials/near-indexer
- https://docs.fastnear.com/neardata
- https://docs.fastnear.com/neardata/block-headers
- https://www.subquery.network/doc/indexer/quickstart/quickstart_chains/near.html
- https://subquery.medium.com/choosing-the-right-data-indexer-for-near-a-detailed-comparison-230197761dae

The Medium article is vendor-authored and dated 22 June 2023. Its comparisons do
not establish current free hosting, testnet support or quotas. No SubQuery account,
paid API, node installation or fabricated public dataset was created.

Actual small Neardata checks (not a throughput benchmark):
- `GET /v0/block/277012602/headers`: HTTP 200, 761 ms; hash
  `42MbGBXczr5ANRcBxeB8QGKgYybEEoVCv4wzrMPPKRRx`, matching the retained anchor.
- `GET /v0/block/277019500/headers`: HTTP 200, 214 ms; hash
  `7AQvpAg7ECKA4bqPYWTK1HVDxg5kFPZDpoo1EH6JRAaL`.

The public RPC fallback was changed to Intear after NEAR archival returned HTTP
429 with Retry-After 214 seconds and a deprecation notice. Its earlier successful
compatibility report remains historical evidence, not a continuing availability
promise. FASTNEAR stays primary. Every read failure is visible; none permits
skipping a receipt or accepting unreconciled state.

Dependencies: INF-01, APP-02, DEM-01, ORC-03. Invariant: unchanged complete ancestry,
FINAL receipt linkage, contiguous operation sequences, same-block custody and
resolver state commitment. Missing/unrecorded transactions fail closed. Tests:
27 focused indexer tests, 14 compiled setup/discovery checks including omitted
actual transactions and restart, 12 wallet boundary checks, 42 origin/browser
checks. Public reconciliation evidence is recorded separately when achieved.
Independent infrastructure/security review pending. These are HTTPS provider
checks, not a separately validating full node or cryptographic light client.


## Final bounded demo profile

Public Neardata requests also returned rate limits (the live adapter recorded
successful headers and HTTP 429s). The full-header profile reached a reconciled
historical checkpoint but could not sustain current-head following under the
available free access. The selected native demo profile is now
`canonical-journal`, described in SPEC: actual complete receipt trees and root
chunk inclusion, canonical RPC height/hash checks for receipt blocks, then fresh
same-block snapshots with unchanged sequence/custody and lag/staleness gates.
It stores sparse canonical receipt/checkpoint blocks and does not claim full
chain ancestry. RPC-provider trust is explicit; no local full node/light client.

The previously verified checkpoint is migrated only after rechecking every
stored complete tree, event sequence, balance and resolver commitment. The source
schema is preserved and destination risk stays disabled until fresh RPC sync.
This avoids rescanning unrelated blocks; it does not mock chain data or bypass
missing operations. Current tests: 31 indexer cases and 18 compiled
setup/discovery/migration checks. New native workspaces retain the bounded profile
and a 500 ms RPC request-start interval. Neardata remains an optional tested
transport for full-ancestry profiles, rather than an active runtime dependency.

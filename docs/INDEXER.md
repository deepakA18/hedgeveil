# INF-01 local finalized indexer

Dependencies: CORE-01 canonical events, ORC-02, MKT-01 and VLT-01/02; APP-01
supplies the same amount/domain conventions. Reviewer: infrastructure/contracts/
security, independent review pending. Invariant: replayed balances and oracle bond
aggregates match authoritative views at one finalized block. A gap, failed RPC,
wrong deployment or reconciliation mismatch cannot advance the accepted cursor.

The implementation targets pinned local Sandbox and PostgreSQL. It has no signer,
private-key loader, transaction submission, refund, retry or administrative-pause
capability. API data is a derived view, never the balance authority. UNKNOWN funds
remain quarantined. A blocked health response prevents the API from recommending
new risk; it does not prevent independent users from calling the contracts.

Discovery walks the finalized block's parent hashes back to the retained cursor,
starting at an explicitly recorded pre-deployment anchor. It scans every newly
included chunk's transactions, including calls to other accounts, because their
receipts can call a watched contract. It retrieves complete FINAL transaction
outcomes and retains transaction/receipt links. It never treats a missing height,
pruned block or unavailable transaction as an empty successful block.

Receipts may execute after the chosen checkpoint. They are retained but projected
only when their execution block is included in the accepted finalized ancestry.
Core events are ordered by the existing domain-bound operation ID (SHA-256 of
Borsh network/account/monotonic u64 sequence), with no change to event wire format.
Oracle events already contain sequence numbers. Exact contiguous sequences are
required. Core custody exposes its operation sequence; the oracle's additive
read-only `indexer_status` exposes domain/sequence without changing state layout
or financial behavior. Missing final events therefore also fail reconciliation.

A PostgreSQL transaction serializes writers, checks the expected cursor, stores
blocks/transactions/outcomes/events, applies deduplicated projections, records
same-block chain views/reconciliation and advances the cursor together. Numeric
amounts use decimal strings/BigInt and NUMERIC(39,0), with explicit u128 bounds.
Event keys include receipt ID, log index and array item index. Duplicate delivery
cannot double credit; conflicting duplicate content is an error. Failed execution
logs never change balances. RPC and projection failures leave prior accepted data
visible with unhealthy/stale status and risk admission disabled.

Core ledger reconstruction includes free collateral and P/N, reserves/supplies,
vault holdings/shares, all storage/operating/fee categories and collateral/storage
withdrawal flight. Oracle events expose aggregate bond custody only; owner credits,
cases and tickets are explicitly same-block chain snapshots, checked against those
aggregates, not falsely labelled as per-owner event replay. Registered maker state,
series and keeper state are also same-block chain snapshots. Signed unfilled quotes
are not on-chain data; their executable depth cannot be inferred by this indexer.

No paid API, public chain, `.env`, existing database or global PostgreSQL service
is needed by the tests. Native PostgreSQL is started under ignored `target/` with
an ephemeral test password, loopback-only TCP and no OS-user creation. The pinned
runtime package is [embedded-postgres](https://github.com/leinelissen/embedded-postgres).
The adapter follows NEAR's [block/chunk](https://docs.near.org/api/rpc/block-chunk)
and [transaction outcome](https://docs.near.org/api/rpc/transactions) RPC surfaces.
All endpoints must match the configured chain/genesis; failover never relaxes pins.
Acceptance evidence and remaining limits are recorded in [G7_INDEXER](../research/reports/G7_INDEXER.md).

## Run locally

Use Node 22.22.2+ and the pinned Rust/Sandbox toolchain from the root README.
Install the isolated service dependencies; the native PostgreSQL test wrapper is
a development dependency. Installation scripts stay disabled; the test helper
recreates the packaged PostgreSQL symlinks within `node_modules` when needed.

```sh
npm ci --prefix services/indexer --ignore-scripts
node --test tests/indexer/model.test.mjs
node --test tests/indexer/store.test.mjs
python3 scripts/build-core.py
python3 scripts/build-oracle.py
node tests/sandbox/g7-indexer.mjs
```

The last two tests open loopback sockets and launch native processes. The
PostgreSQL test instance uses PostgreSQL 18.6 (wrapper 18.6.0-beta.19), node-postgres
8.23.1 and Ajv 8.17.1, pinned with integrity hashes in the service lockfile. The
Sandbox test uses a long local epoch (`epoch_length: 1000000`) so accelerated
maturity does not garbage-collect the history under test. This is a disclosed
fixture setting, not an archival guarantee. Backfill requires all blocks and
transaction outcomes since the anchor; missing history stops the worker. Chunk
inclusion comes from block headers: the pinned Sandbox's standalone chunk query
reports `height_included: 0`, so it cannot be used as the inclusion authority.

The harness stops both processes after the run. It leaves isolated database data,
public receipt evidence and private local DB configuration under ignored `target/`;
it does not configure a global database or run Docker. The DB password is ephemeral
and is never written to the committed report. For continuous use, supply your own
running local PostgreSQL and retained-history Sandbox using the explicit JSON
template in [.env.example](../.env.example), under the
INF-01 comments. Configuration names and defaults are documented there; copy the
commented JSON to an ignored local file and fill the actual deployment pins and
private local DB credentials. The worker does not load `.env.example`.

Save a real config to an ignored local file with restrictive permissions. Never
commit DB credentials. The template placeholders are not deployment records. The
worker only creates its explicitly named `hv_*` schema; it never resets existing
data on a binding mismatch. A different chain, deployment or anchor needs a new
explicit schema, or a separately reviewed migration. Config is read from the
specified JSON file, not `.env` or a wallet keystore.

```sh
# One verified catch-up and checkpoint publication.
node services/indexer/cli.mjs sync --config target/indexer-config.json
# Poll and expose a read-only loopback API.
node services/indexer/cli.mjs serve --config target/indexer-config.json
```

The optional scan/event/time/lag bounds and defaults are in
[.env.example](../.env.example). No bound silently discards history. An exceeded
bound fails closed and requires an explicit configuration/retention decision. This
local profile replays accepted events at each checkpoint; high-volume incremental
projection, broader load testing and database retention are separate work.

The block height observed after collection measures lag; elapsed collection time
counts toward staleness. A large lag or stale checkpoint disables risk admission,
even if its old balances still reconcile. Historical API data remains available
with its block hash and health attached. The API has no automatic access to an
account capable of pausing contracts, and the SDK does not yet consume this
admission flag; APP-02 now enforces it for new-risk previews and submissions in
the local gateway. Public wallet/testnet enforcement remains pending.

## Read API and monitoring

All paths accept GET only, listen on `127.0.0.1`, and send `Cache-Control: no-store`.
Data paths accept `limit` (1–200, default 100) and `offset` (0–1000000). Every
response labels Sandbox, chain ID, checkpoint and health. Decimal amounts are
strings; SQL/JavaScript floating point is never used for money.

| Path | Result |
|---|---|
| `/health` | 200 only for a fresh, reconciled, within-lag checkpoint; otherwise 503 with risk disabled |
| `/v1/balances` | Event-derived free P/N/collateral, reserves, supply, vault shares/holdings, fees, storage and in-flight buckets |
| `/v1/events` | Published canonical core/oracle events with exact receipt/log/item, sequence, transaction and execution-block provenance |
| `/v1/transactions` | Discovered transaction hashes, public signer/receiver and inclusion block |
| `/v1/receipts` | Accepted-block outcomes, statuses and raw logs; includes RFQ fill digest/nonce and roll metadata when emitted |
| `/v1/snapshots` | Same-block accounts, series, vault, market registry, tickets, oracle cases/observations/custody and reconciliation results |
| `/v1/alerts` | Checkpoint-derived withdrawal, oracle, keeper, missing quote-observation and failed-receipt notices |
| `/metrics` | Prometheus health, indexed height, observed block lag, checkpoint age, RPC failures and failover counters |

Failed receipts are retained as evidence but their logs do not affect projections.
RFQ/vault metadata is available in raw receipt logs; the balance authority is the
canonical ledger event. Maker registry state does not prove the presence of a
fresh executable quote. The service emits EXECUTABLE_QUOTES_UNOBSERVED for an open
vault; it does not invent liquidity, spread, quote freshness or concentration data.
Future relay/feed monitoring must supply those measurements explicitly.

Notices include UNKNOWN/overdue/confirmed-failed withdrawals; failed core/oracle
receipts; mature unresolved claims; oracle disputes/delays, missing published
observations and proposal deadlines; stale keeper references, deferred rolls and
missed keeper deadlines. Native reserve coverage, claim/share supply and custody
mismatches fail checkpoint reconciliation and surface in health immediately.
Failed-receipt notices are cumulative evidence, not a claim that every historical
failure is still actionable. Automated paging, notification delivery, service
credentials, production oracle sources and on-call ownership remain pending.

## Acceptance and limitations

[INF-01 evidence](../research/reports/G7_INDEXER.md) records actual PostgreSQL and
compiled-Wasm execution, including fresh-process restart, full fresh-database
backfill, receipt timing, duplicated delivery, injected omission/rollback/mismatch,
RPC outage and identity-checked fallback. Unit transport/custody fault fixtures
are labelled separately from real chain results. Independent review remains
pending. No transaction is sent by the service, and no timeout resolves a payout.

This increment does not complete G7: browser wallets/UI, public testnet deployment,
operator notifications, high-volume/archival-provider validation and complete demo
packaging remain open. The service trusts the pinned local node and PostgreSQL;
it does not verify consensus/receipt proofs cryptographically. Checking deployment
code at the checkpoint is not an atomic defense against a full-access key upgrade
and rollback between checks. No production mode is enabled.

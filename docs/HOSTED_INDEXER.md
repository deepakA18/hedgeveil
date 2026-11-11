# Hosted indexing assessment — 11 November 2026

Current implementation direction: FASTNEAR's hosted finalized full-block feed
augments our retained verifier/database. This is external chain-data hosting,
not managed application indexing. Persistent discovery is implemented; free
rate limits prevent claiming continuous coverage. See
[feed operations](../services/indexer/README.md#fastnear-full-block-discovery).
The SubQuery candidate below remains preserved and blocked.

Status: OnFinality deployment attempted; runner 6.0.2 fails before mapping
initialization due to a hard-coded mainnet genesis-block lookup on testnet.
[Verified diagnosis and prepared support message](../research/reports/INF02_HOSTED_STARTUP_FAILURE.md).
Hosted runtime operation and migration are not verified.
The user prefers managed indexing to reduce operations. The current live desk
still uses Hedgeveil's PostgreSQL receipt projection and RPC reconciliation.

## Current deployment handoff

Project: `hedgeveil-testnet`, SubQuery SDK, native NEAR testnet. The CID and
published file hashes are in [the publication record](../research/reports/inf02-subquery-publication.json).
The package and exact UI fields are in [services/subquery](../services/subquery/README.md).
Its mapping replay reproduces all 66 events from the 73-transaction real acceptance
archive; [replay report](../research/reports/inf02-subquery-replay.json). Additional
tests reject incomplete/foreign receipt trees, false event success and invalid
domains/amounts, preserve execution heights and stop checkpoint advancement on
failure. These are mapping/harness checks, not a hosted runner benchmark.

The free archival RPC `https://archival-rpc.testnet.near.org` returned deployment
anchor `42MbGBXczr5ANRcBxeB8QGKgYybEEoVCv4wzrMPPKRRx` at height 277012602.
The ordinary FASTNEAR and Intear endpoints no longer served that old block in
this check. The hosted deployment must therefore use archive access for backfill.

The reviewed SubQuery NEAR types expose receipt inputs without outcome logs.
The mapping consequently retrieves complete FINAL transaction trees for all root
transactions, then archives watched receipts/events with their actual execution
heights. This covers routed calls but can duplicate the SDK's RPC requests;
hosted performance remains a gate. The package exposes no balance or risk-enabled
flag, and does not replace the independent monetary reconciler.

## Recommendation

Evaluate SubQuery on OnFinality Indexer Service first. SubQuery documents native
NEAR mapping handlers and GraphQL queries; OnFinality operates its former managed
service. This is the closest match among the supplied options to managed indexing,
database storage and a query API. Ponder targets EVM contracts; the NEAR Lake JS
library supplies a data stream and leaves application storage/API operations to us.
Do not describe Lake's operational overhead as measured or necessarily low.
The supplied Ponder database row is outdated: current Ponder supports PGlite
for local development and PostgreSQL for production, rather than SQLite.

SubQuery's NEAR manifest still requires an archive RPC endpoint and explicitly
warns about public-node rate limits. Moving hosting therefore does not by itself
prove that our recurring freshness issue is solved. Managed database operation
also does not remove our responsibility for event mappings and monetary checks.

The OnFinality landing page advertises a free single-chain plan with two active
projects, 500,000 stored entities and 1,000 deployment hours/month. These are
published limits, not an entitlement verified in an account. NEAR **testnet**
deployment, available runner versions, receipt coverage, archive access and actual
catch-up latency remain unverified. Do not purchase a plan or advertise a live
integration on this evidence alone.

## Migration acceptance

1. Verify native NEAR testnet support and free-plan availability in the deployment
   service; pin the supported runner and dependency versions.
2. Index our core and resolver from their actual deployment blocks. Include
   asynchronous receipt outcomes, not merely top-level transaction actions.
3. Expose stable transaction/receipt IDs, block hashes/heights, event sequence,
   indexed head and failures. Preserve exact integer amounts as strings/BigInts.
4. Run alongside the existing projection. Compare actual owner deposit/P fill,
   project P/N fills, settlement/import, redemption and withdrawal callbacks at
   identical finalized blocks. Include an operation absent from local journals.
5. Verify pagination/backfill, restart deduplication, missing/failed receipts,
   RPC outages and stale indexed heads. Unknown payouts remain quarantined.
6. Switch the application only after parity and sustained freshness are measured.
   Retain protocol-specific custody/sequence verification and durable transaction
   journals; remove redundant local indexing infrastructure only after cutover.

Dependencies: INF-01, CORE-01 events, ORC-03, APP-01/02 and managed testnet access.
Invariant: hosted data never alone proves transaction success or permits an
unreconciled state to accept new risk. Failure: hold cutover, preserve the current
database/journals and expose stale/unavailable status. Evidence currently consists
of source review, package build, archived-receipt mapping replay and publication;
hosted replay and performance evidence remain pending.
Infrastructure/security reviewer: independent review pending.

## Primary sources

- [Ponder EVM scope](https://ponder.sh/)
- [Ponder database support](https://ponder.sh/docs/database)
- [SubQuery NEAR quick start](https://subquery.network/doc/indexer/quickstart/quickstart_chains/near.html)
- [NEAR manifest and archive RPC requirements](https://subquery.network/doc/indexer/build/manifest/chain-specific/near.html)
- [Managed service transition to OnFinality](https://documentation.onfinality.io/support/subquery-managed-service-rebrand)
- [OnFinality managed indexing](https://onfinality.io/en/indexer-services)
- [Indexer free-plan limits](https://indexing.onfinality.io/)
- [NEAR Lake JavaScript library](https://github.com/near/near-lake-framework-js)
- [Current NEAR indexer guidance](https://docs.near.org/data-infrastructure/indexers)

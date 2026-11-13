# Local finalized event indexer

## FASTNEAR full-block discovery

`discovery_interval_ms` sets the minimum spacing between full-block feed requests
(default 2500 ms, allowed 400–60000). Desks sharing one IP share the provider's
rate budget; pace legacy and active desks together. HTTP 429 cooldown remains
durable across restarts. Slower polling does not relax freshness or reconciliation.

For `network: "testnet"`, `transaction_filter: "canonical-journal"`, set
`discovery_source: "neardata-testnet"` in the indexer configuration. Do not combine
this with `header_source`: both would spend the same free per-IP budget. No API
key or environment variable is required. The wallet runtime and indexer CLI
start/stop the feed worker automatically with the indexer.

The default requires fresh feed coverage for new risk. Explicit
`discovery_required: false` selects additive discovery alongside journals:
feed failures are visible under `health.discovery`, while all existing receipt,
sequence, custody, snapshot and freshness gates remain mandatory. This additive
mode is appropriate while the free feed's sustained coverage is unverified; it
does not claim a complete independent indexer or replace PostgreSQL/API hosting.

The worker reads finalized full blocks, identifies watched root transactions and
non-system action receipts (including routed calls), and submits only transaction
hints to the existing verifier. No provider log alone establishes success.
Hints/cursor commit atomically. The initial baseline is the retained reconciled
checkpoint (or anchor in a new database); earlier evidence stays in the database.
The worker checks parent continuity across skipped heights and never resets to
the latest head after an error. It uses at most 150 request starts/minute and
persists rate-limit cooldowns; Retry-After zero still waits at least 60 seconds.
Other processes sharing the same public IP can consume the provider quota.

Checks:

```sh
node --test tests/indexer/*.test.mjs tests/e2e/quote-gate.test.mjs
node scripts/check-neardata-discovery.mjs --mode parity
node scripts/check-neardata-discovery.mjs --mode shadow --seconds 120
```

The latter two commands use the retained native-transfer database and real public
HTTPS responses. Run shadow checks before enabling the runtime worker; do not
run two scanners or parity downloads concurrently against the same free quota.
Parity downloads cache verified public blocks locally and compare actual receipt
IDs, status/logs and originating transaction hashes to the retained 73-transaction
acceptance archive. Shadow scanning records its baseline, actual progress and
health. Neither report grants sole-source cutover. Independent review is pending.

INF-01: PostgreSQL-backed, read-only Sandbox discovery, canonical event replay,
same-block custody reconciliation, HTTP API and health/alert metrics.

Start with [configuration and commands](../../docs/INDEXER.md),
[receipt evidence](../../research/reports/G7_INDEXER.md), and
[operations requirements](../../docs/RUNBOOKS.md). No wallet keys or `.env` parsing.
Independent review and public testnet/browser acceptance remain pending.

The `external_oracle` contract kind supports the `native-sampled-v1` candidate.
It pins code/chain identity, requires contiguous successful-receipt event
sequences and reconciles the last state commitment with a same-block snapshot.
Snapshots include source samples, pending requests, registrar/guardian accounts
and pause status. Missing observations remain visible as alerts. This does not
authenticate upstream venue prices or approve the candidate for deployment.

`node tests/sandbox/external-settlement.mjs` exercises the compiled resolver,
clearinghouse and real PostgreSQL store through redemption, withdrawal and
indexer restart. `node --test tests/indexer/external.test.mjs` covers malformed
events, state tampering and wallet/deployment binding with explicit fixtures.

Public native catch-up uses bounded parent-validated height prefetch. The optional
`read_concurrency` defaults to 4, accepts 1–16, and controls header/chunk reads;
transaction receipt trees remain limited to four concurrent reads. Concurrent
reads coalesce in-flight identity checks. A read batch verifies each used provider
before its first read and again before committing; outside batches, each network
read verifies identity. Immutable block/chunk/FINAL transaction responses are
cached in the deployment-bound PostgreSQL schema; live heads and views are not.
`Indexer.progress` exposes phase/counts without changing health or granting risk.
The optional `transaction_filter: "watched-roots"` selects direct watched-contract
and explicit delegated roots, retains complete descendant trees, and has a
separate database binding. An unselected indirect root must cause sequence/state
reconciliation failure until discovered. The default remains full-root discovery.

Public testnet defaults to a 250 ms `request_interval_ms` (four HTTP request
starts per second per indexer, including identity checks); Sandbox defaults to
zero. Range: 0–60000 ms. Concurrent work shares this budget. HTTP 429 cools down
that provider for `Retry-After` seconds/date, or 60 seconds when absent/invalid.
Queued calls recheck cooldown before sending. Read-only failover still checks
chain/genesis, and all providers failing keeps risk disabled. This is not a
provider quota guarantee or an automatic retry policy for transaction writes.

The native testnet profile uses FASTNEAR, then NEAR archival as read fallback.
See [measured compatibility evidence](../../research/reports/testnet-rpc-provider-check.json)
and [the current runbook](../../docs/TESTNET_SETUP.md). Changing provider cannot
substitute for complete receipt/state reconciliation.


`journal-roots` is the local native demo's operation-scoped discovery profile.
It reads candidate hashes from wallet/admin journals, fetches actual complete
FINAL RPC receipt trees, verifies root chunk inclusion and outcome membership in
the complete finalized ancestry, and uses the same sequence/custody/state checks.
It requires a `discover` function and a distinct database binding. Transactions
outside these journals are not automatically discovered: a changed contract
sequence/state blocks risk until the real root is supplied. This is not a general
public account-history indexer. Tests compare its actual compiled execution with
the full scan and confirm omission fails closed.

Optional `header_source: "neardata-testnet"` retrieves numeric-height prefetch
hints from `https://testnet.neardata.xyz/v0/block/{height}/headers`, the hosted
source linked by NEAR's indexer guides. It accepts testnet only, sends no key,
paces starts by 250 ms and honors 429 cooldowns. Final head, anchor, views and
receipt trees remain identity-pinned RPC reads. Every parent link must connect
head to cursor; absent headers fall back to RPC, never skip a block. These are
HTTPS provider-backed checks, not a locally validating node/light client.

The current native fallback is Intear. NEAR archival initially passed a small
compatibility probe, but later returned HTTP 429 with a deprecation notice and
was removed from the active profile. The original probe report is historical.


`canonical-journal` is the selected bounded native demo profile. It validates
receipt-block hashes against identity-pinned canonical RPC heights and actual
root chunk inclusion, with all FINAL receipt/sequence/state checks retained.
Only receipt/checkpoint blocks are stored; it does not promise full ancestry or
automatic discovery of unrecorded outside operations. Fresh snapshots after
receipt discovery define checkpoint age; lag/stale limits are unchanged.
`migrateDiscovery` revalidates and copies a compatible stored checkpoint into an
empty separate schema, preserves the source, and requires fresh reconciliation
before risk can enable. Active native pacing is 500 ms, with no paid API key.

Explicit matching `UNKNOWN_TRANSACTION` responses from every identity-verified
RPC leave a journal hint pending in `health.unresolved_transactions`. Discovery
uses non-waiting status reads; only complete FINAL receipt trees are projected.
Unknown hints are retried, never removed or marked successful. Same-block event
sequence, custody and resolver commitment reconciliation still gates publishing;
a missing executed operation blocks risk. RPC outages and identity mismatches
are not treated as unknown hints.

Runtime restart may reuse the original retained deployment block response when
RPC providers have pruned it. Its hash must equal the configured anchor; live
chain/genesis identity and database binding are checked, and no cursor or receipt
evidence is discarded. Current-state reconciliation remains mandatory.

On 13 November 2026 the live testnet feed returned HTTP 429 with
`rate-limit exceeded of 30 blocks per minute`, despite the repository README
listing 180 requests/minute. Full-block coverage cannot keep up with the chain
at that observed free quota. Legacy/new desks sharing one IP are paced at
15000/2500 ms respectively. The user approved the already-supported additive mode for the new demo on
13 November. Canonical receipt/state reconciliation remains required; full-network
continuous-discovery acceptance is not claimed.


Public status reports the full-block feed's own last successful observation time,
separately from receipt reconciliation. Rate-limit/cooldown states remain degraded
even if the last observed block lag was zero. Lagging additive coverage is never
reported as complete just because receipt-based trading checks pass.

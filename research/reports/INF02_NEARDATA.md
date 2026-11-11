# FASTNEAR additive discovery — 11 November 2026

Implemented and enabled for the retained native-transfer desk at loopback port
8794. This consumes real finalized blocks from `https://testnet.neardata.xyz`.
It does not deploy our own NEAR Data server, purchase API access, replace the
application database/API, or claim sole-source indexing acceptance.

## Implementation

The full-block parser discovers watched roots and routed non-system action
receipts. Transaction hashes and signer hints enter the existing FINAL-tree,
canonical-block, root-chunk and same-block monetary verifier. PostgreSQL persists
hints and a parent-linked cursor atomically. The baseline is the existing verified
checkpoint, explicitly retained as height 277226729 / hash
`zRqAUfdoni2uKRKQukmZZGTqaJeQwqTENYweJC3TpTP`. Prior receipts remain in the
original projection; no claim of rescanning all earlier chain activity is made.

The transport budgets 150 request starts/minute and honors HTTP 429 with at least
60 seconds of cooldown, including observed `Retry-After: 0`. Cooldown survives
restart. Height gaps, parent conflicts, malformed/missing shards, foreign receipt
blocks and conflicting signer hints fail closed. Unknown transactions are never
treated as successful or refunded. No signing or transaction submission was used
for this integration or its public verification.

## Actual evidence

- [Public feed parity](inf02-neardata-parity.json): 71 actual historical full
  blocks, all 72 watched receipt outcomes in the retained 73-transaction archive
  matched by receipt ID, logs, status and originating transaction hash. Discovery
  signer hints also matched the retained transaction signer for non-system action
  receipts. These are selected historical blocks, not a contiguous replay.
- [Initial shadow scan](inf02-neardata-shadow-initial.json): advanced 17 real
  heights in a 120-second run, then remained throttled. Its initial Retry-After
  zero handling was subsequently hardened to the persisted 60-second minimum.
  The free service's effective sustained capacity has **not** passed acceptance.
- [Post-restart reconciliation](inf02-neardata-runtime.json): 73 transactions,
  313 complete outcomes and 66 events preserved. Core sequence 51 and external
  resolver sequence 15 match actual same-block snapshots. Fresh reconciliation
  passed after restarting with the additive feed configuration.

The previous service PID 3404 exited, leaving its ownership marker. Recovery
verified that PID was absent, PostgreSQL had no postmaster PID file and the lock
directory contained only owner.json before removing just that stale marker.
The first restart then exposed unavailable historical anchor data on the ordinary
RPCs. Adding `https://archival-rpc.testnet.near.org/` as the third read fallback
allowed startup. No database reset, journal deletion or transaction resend occurred.
The original local deployment configuration was preserved as
`deployment.json.before-neardata` in the ignored workspace.

## Runtime policy and limits

The live configuration explicitly uses `discovery_required: false`: FASTNEAR
adds discovery alongside journals; its lag is exposed in `health.discovery`.
All prior receipt/sequence/custody/staleness gates remain mandatory. Missing
outside activity still blocks monetary reconciliation until discovered. Feed
failure cannot turn an unhealthy financial checkpoint healthy. Default strict
mode additionally disables risk whenever feed coverage is stale or lagging.

This preserves the already accepted canonical-journal policy during evaluation;
it is not permission to claim uninterrupted outside-transaction discovery or a
fully managed indexer. No runtime changes to financial contracts or settlement
terms were made. Free-feed throttling and backlog remain real limitations.

Validation: 51 indexer, HTTP quote-gate and native setup tests; real PostgreSQL atomicity/restart,
persisted cooldown, and strict/additive failure handling; 16 schema tests; 565
reproducible payoff vectors and Python reference tests; locked root workspace
tests, formatting and Clippy. Deterministic test fixtures are not public-chain
evidence. Independent infrastructure/security review remains pending.

Dependencies: INF-01, core/resolver event contracts, retained reconciled baseline,
FASTNEAR HTTPS availability and identity-pinned RPC verification. Invariant:
discovery hints never authorize monetary success. Failure path: retain cursor,
honor cooldown, expose lag, preserve all existing financial gates. Next acceptance:
measure sustained feed catch-up and an unjournaled public operation before any
sole-source cutover.

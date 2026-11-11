# Hedgeveil testnet — managed SubQuery candidate

This package prepares the existing deployment for OnFinality hosting. It is an
**evidence archive**, not permission to replace monetary reconciliation or the
wallet transaction journal. Hosted runner operation, sustained freshness, API
integration and full same-block parity remain acceptance gates.

The user-created OnFinality project is `hedgeveil-testnet`. Its Production Slot
is a hosting label; this manifest targets **NEAR testnet**, not NEAR mainnet.

**Deployment blocker (11 November):** runner 6.0.2 fails during initialization
because it requests hard-coded mainnet genesis block 9820210 on testnet.
Do not retry unchanged deployments or change the start block to bypass it.
[Diagnosis and support message](../../research/reports/INF02_HOSTED_STARTUP_FAILURE.md).
The fields below describe the published candidate, not a working hosted setup.

## Build and verify

```sh
cd services/subquery
npm ci --ignore-scripts
npm run codegen
npm run typecheck
npm run build
npm test
```

The replay test consumes the retained real 73-transaction / 66-event acceptance
report and compares every projected event. Store/API failure tests use an
explicit local harness; they do not claim an actual hosted or local SubQuery
node deployment. All amounts and timestamps retain exact string/BigInt units.

The manifest pins `@subql/node-near` 6.0.2 and `@subql/query` 2.25.0. The tested
build tools are pinned by `package-lock.json`. Whether these runner versions are
offered in the user's OnFinality workspace still requires deployment acceptance.

## Publish and use the CID

Save `SUBQL_ACCESS_TOKEN` only in the ignored root `.env`, then:

```sh
npm run publish:ipfs
node scripts/verify-publication.cjs
```

The publisher checks source hashes against the replay report, passes only the
token and minimal process environment to the CLI, and suppresses potentially
sensitive CLI diagnostics. Only schema and compiled mapping files referenced by
the manifest are uploaded. The result is recorded in
`research/reports/inf02-subquery-publication.json`; the public verification
downloads and checks both assets without a token.

OnFinality fields:

- Deployment CID: use the verified publication report's `cid`.
- Query service: 2.25.0 if offered and compatible with the free tier.
- Indexer runner: native NEAR `@subql/node-near` 6.0.2.
- RPC: `https://archival-rpc.testnet.near.org` (deployment anchor read verified).
- Dictionary: leave blank; no matching testnet dictionary has been verified.
- Start block: fixed at 277012602, the actual pre-deployment anchor.
- Use conservative batch/worker defaults initially; do not enable skip/error
  bypass options. Do not switch the desk until acceptance passes.

## Coverage and failure semantics

The runner's basic NEAR receipt type lacks execution outcomes. Our block mapping
retrieves complete FINAL transaction trees without a receiver filter, including
cross-contract calls originating outside the watched accounts. It archives
matching trees, all their receipts, and successful protocol events. It does not
infer success from receipt inputs. An incomplete tree stops progress.

`IndexedHead` is updated only after every transaction in that block is checked.
Parent continuity, initial deployment anchor and RPC network identity are
verified. A root transaction may have later receipts: the archive retains their
actual execution heights, and consumers must restrict reads to the indexed head
before checking contract snapshots at that same block. No live account balance
or `risk_allowed` flag is exposed by this package.

The full-block path can duplicate the runner's own transaction-status requests.
This moves hosting/database management but does not establish faster catch-up.
Free archive-RPC rate limits and SDK performance must be measured on the hosted
runner. New ORC-04 contract accounts are not yet deployed and are not silently
substituted into this historical profile; they require a new binding/CID.

Acceptance: `docs/HOSTED_INDEXER.md`. Independent infrastructure/security review
is pending. The existing indexer and its database remain active until cutover.

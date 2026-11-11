# Verified public refresh and native setup — 10 November 2026

The owner wallet submitted transaction
`BMV5wLTUnJHR5bE664AGb15bDypkbaDSH4XWW97mMynn` to `price-oracle.testnet`.
The exact action was `request_price_data({"asset_ids":["wrap.near"]})`,
attaching 0.02 test NEAR with 200 Tgas maximum. This was a user-wallet signature;
the local service did not acquire authority over `0xdeepak18.testnet`.

## Public evidence

- `outlayer-wallet-refresh-receipt.json`: actual retained FINAL transaction and
  complete receipt tree from the wallet request.
- `outlayer-wallet-refresh-verification.json`: independent read-back through
  archival testnet RPC, source account/code and `get_asset` at the final callback
  block. This is a historical execution-time check, not a claim of current freshness.
- Callback block `FcVske431xqKyzRPbfuWv3HWZztJE22MQdfNL12bZKmw` has timestamp
  `1794250293019388552`. Its report and return data agree on multiplier
  `361896666`, decimals `8`, i.e. **3.61896666 USD/NEAR** or `3618966660000`
  at the protocol's `10^12` price scale.
- Source code hash `C1frAe93wcjtGjeavZDA6znsV5EUnKJFWuX24vTmH3ZV` and
  testnet genesis match the retained pins. Selected reporter is the source
  account `price-oracle.testnet`.
- The upstream execution result reported `from_cache: false` and named its
  contributing exchanges. Those provider claims are not independent venue
  verification. The request permits `max_age_secs: 300`; the accepted settlement
  profile checks on-chain ingestion time and does not promise venue-time freshness
  or independent prices for each sample.

`verifyRefreshProof` validates exact signer/receiver/actions, complete receipt
success, the unique matching source callback, callback-block identity, pinned
code and equality of exact price/ingestion units. Its two tests reproduce this
real evidence and reject changed signer, deposit, chain, code, block, missing
receipt and stale report timestamps. The result explicitly leaves
`public_lifecycle_complete: false`.

## Native setup implementation and rehearsal

`services/testnet/native.mjs` prepares a separate private workspace, generates
keys only for dedicated service subaccounts, checks current source code/chain
and retains a public review plan. It verifies the wallet funding receipt before
loading service signers. Setup uses durable operation IDs, pins both artifacts,
creates immutable real-market-derived terms, funds maker inventory, registers
RFQ keys and emits a native-resolver indexer/client configuration. Repeating setup
recovers receipts rather than deploying/funding again or changing terms.

The old synthetic workspace and its journals remain held and separate. Native
runtime starts the bounded collector while bringing up the indexer and wallet
desk; its source refresh budget remains three calls / 0.06 test NEAR plus gas.
The browser distinguishes external sampled settlement, a local fixture profile
and an unconfigured wallet desk.

The corrected **48 test NEAR** allocation is:

| Purpose | Test NEAR |
|---|---:|
| Core | 30 |
| Resolver | 8 |
| Maker A | 4.5 |
| Maker B | 4.5 |
| Administrator, setup storage/gas and refreshes | 1 |

The initial resolver estimate of 5 (and a subsequent 5.1 check) failed initialization
on the compiled runtime; 8 passed. The final end-to-end setup preserves 4 NEAR of
trading collateral for each maker, with the rest for their storage/gas. The owner
must retain at least one test NEAR outside this 48-NEAR request.

`orc03-native-setup-sandbox.json` records seven passing compiled-Wasm checks:
complete setup under this allocation, receipt-backed restart, both maker balances,
disabled vault, real PostgreSQL reconciliation and administrator headroom. The
administrator retained `787757526876339000000000` yoctoNEAR in that run. Source
and strike are explicitly labeled Sandbox fixtures in this setup test. The
separate market and public-refresh reports supply their respective real inputs.

29 focused funding/receipt/oracle/collector tests and 42 HTTP/Chromium wallet
navigation checks pass. `orc03-native-funding-preview.json` records browser checks
of the actual native funding review page, exact amount and correct allocations,
with approval disabled until wallet connection and no funding submitted.

## Current handoff and limits

`deploy/testnet/native-plan.json` is the concrete review plan for
`hv-native.0xdeepak18.testnet`. The local funding page is `http://127.0.0.1:8793`.
It requests create-account, transfer and a full-access key only on that new account.
The existing owner's wallet must sign; no private key or seed is requested.
Funding/deployment are not claimed until their own finalized receipts exist.

Depends on accepted testnet SPEC, verified source refresh, MKT-03 and durable admin
transactions. Invariant: source identity/terms and receipt ownership must match;
missing/failed/unknown execution never authorizes a replacement payment or a
fabricated price. Failure paths are source/code rejection, retained unknown
transaction, unavailable market input and delayed settlement. Oracle/contracts/
security and release reviewers remain independent-review pending.

Continuous public sampling, actual options trading, redemption/withdrawal,
restart/recovery, fresh release rehearsal and public reproduction remain
outstanding. Production and vault are disabled; claims remain the internal
ledger and makers remain project-operated. One verified source request is not
whole-protocol acceptance.

## Meteor compatibility correction

The earlier setup/preview evidence above records the original named-subaccount
request. Meteor subsequently blocked its `AddKey` action. The native plan now has
`METEOR_ADD_KEY_BLOCKED`; its attempted journal is retained with no known hash,
not marked failed or successful. The old server was stopped.

The new transfer-only profile uses five independent ED25519 implicit accounts.
The owner wallet sends only one ordinary transfer of 48 test NEAR; the service
then funds core/resolver/makers through four ordinary transfers. Account IDs are
checked against public keys; allocations remain 30/8/4.5/4.5/1. Existing wallet
keys are neither requested nor changed. The changed layout is disclosed for new
user review/signature. No public funding/deployment is claimed.

`orc03-transfer-setup-sandbox.json` records nine passing checks against actual
compiled contracts and PostgreSQL, including creation by single transfer and
receipt-backed restart. The source/strike fixture scope remains explicit. A
preliminary named top-level root experiment failed the current runtime registrar
rule and was discarded; this final path creates only implicit accounts.
Seventeen focused funding, receipt, proof and collector tests pass. Independent
security/release review and real Meteor funding acceptance remain pending.

The transfer review page passes eight read-only Chromium checks at 375/768/1280
pixels: exact receiver/amount/action, disclosure of the changed account layout,
connect-before-sign, no script errors and no claimed/broadcast operation during
preview. Evidence: `research/reports/orc03-transfer-funding-preview.json`.
All 59 focused funding/receipt/proof/collector/origin checks pass. Schema, payoff
(565 cases) and RFQ vectors reproduce; Rust workspace/contract tests, formatting
and Clippy completed successfully. No public funding or deployment is inferred
from these checks. The replacement page awaits the owner's wallet signature.

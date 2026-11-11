# Options testnet setup

## Current native deployment — 11 November 2026

Use the retained `native-transfer` workspace and
[native plan](../deploy/testnet/native-transfer-plan.json). The owner-funded
48-test-NEAR setup uses independent service accounts after Meteor rejected the
original subaccount key request. The native core and external sampled resolver
are deployed. Vault and production remain disabled. Public options execution
uses actual external reports and market-derived maker prices.

```sh
# Resume the existing workspace; do not prepare or reset it.
node services/testnet/cli.mjs serve --name native-transfer --port 8794
```

Only one runtime may own this workspace. Verify a stopped process before removing
its dead lock; retain all keys, journals and database files. The desk binds to
loopback and is not a public hosting configuration. Do not expose it through a
proxy by disabling origin checks.

Eta is the current confirmed series: 11 November, 03:13:04–03:31:04 UTC
(08:43:04–09:01:04 IST), followed by 60 seconds review. Its collector uses three
six-minute slots and the actual stored source-report timestamp. Missing samples
permanently delay that series; no administrator price or fake backfill exists.
The owner has confirmed storage/deposit; subsequent wallet trades, redemption
and withdrawal must be accepted with actual receipts. See
[current readiness](REAL_DATA_READINESS.md).

Epsilon and zeta registration attempts remain SUBMISSION_UNKNOWN. Their original
hashes are preserved; no resend or refund is authorized. The indexer lists these
hints while requiring exact finalized state/event reconciliation for risk. A
2-test-NEAR transfer from resolver operating surplus replenished administration,
leaving over 6 in the resolver; core/user/maker collateral was untouched.

## Historical held setup — do not execute

The user approved dedicated accounts below `0xdeepak18.testnet` and an
options-first release on 9 November 2026. The vault and production stay disabled.
The public review plan is [open-plan.json](../deploy/testnet/open-plan.json).
It is a plan, not a deployment record. Generated signing and RFQ keys, database
credentials and journals remain in ignored `.local/testnet/open/` with private
permissions. Do not delete this directory after a wallet handoff.

**Deployment hold (9 November 2026):** The user requires real external market
data. This synthetic setup is superseded for public release; source/adapter,
market-derived maker pricing and the funding budget require replacement/review. Bootstrap and deploy reject `DEPLOYMENT_ON_HOLD` before
loading signing keys or sending transactions. Newly prepared plans also carry
this hold. Do not remove it or fund the old plan to bypass the review. Read-only
status and receipt recovery remain available. The owner currently has 50 test
NEAR; no additional faucet request is needed for this feasibility work.
See [findings](../research/reports/OUTLAYER_FEASIBILITY.md).

The following budget and handoff instructions describe the **held synthetic
setup**, not a current funding request. After an accepted design and revised
budget, update the plan and runbook before resuming.

The held setup transfers **80 test NEAR** to `hv-open.0xdeepak18.testnet` and creates
one full-access service key on that new account. It adds no key to the owner's
wallet. The owner needs at least **81 test NEAR**, leaving one for storage/gas.
Core and oracle each receive 30 (including their separate 20 NEAR operating
reserve); two makers receive 6 each; the remaining 8 funds administration,
arbitration, publishers, storage and gas. Each maker deposits 4 as collateral
and splits 2 into backed pairs. Each publisher receives 0.5 for gas, the arbitrator
receives 0.5, and the administrator retains 4.5 before setup expenses. These
balances are disclosed subsidies.

Install the locked dependencies documented in README (`tests/sandbox`,
`services/indexer`, `apps/web`) and build normal oracle/core artifacts first.
Run from the repository root:

```sh
# Already prepared for this workspace; do not repeat or replace generated keys.
node services/testnet/cli.mjs prepare --name open --owner 0xdeepak18.testnet
node services/testnet/cli.mjs status --name open
node services/testnet/cli.mjs bootstrap --name open
```

Open `http://127.0.0.1:8791`, review the public account budget/actions, connect the
funding wallet, and approve the setup request locally. Insufficient funding or
an existing destination blocks handoff. Wallet hashes are hints: only matching
finalized transaction actions and complete receipt trees confirm funding.
An attempted operation is never automatically sent again. If necessary, use the
page's hash recovery form or `recover --operation ID --hash HASH`; the local
journal supplies the exact retained request.

After confirmed funding:

```sh
node services/testnet/cli.mjs deploy --name open
node services/testnet/cli.mjs serve --name open --port 8790
# Run after the registered maturity, within the fixed oracle windows:
node services/testnet/cli.mjs settle --name open
```

`deploy` retains each setup transaction before broadcast, verifies receipts,
initializes testnet-domain contracts, registers storage and the committed
synthetic series, and funds/registers two maker inventories and RFQ keys.
`serve` starts retained local PostgreSQL, the deployment-bound finalized indexer,
two maker processes and the browser wallet desk. Stop an existing wallet desk
yourself before reusing port 8790, or choose another port. The server never signs
for a connected visitor. Makers use their own generated keys and persisted
nonce reservations. Synthetic half-value marks are disclosed fixture prices,
not live market prices or guaranteed execution.

The first series starts one hour after preparation of its immutable material;
its maturity is two minutes later. Trading/minting and settlement use real chain
time. `settle` publishes all six committed observations, proposes, challenges,
adjudicates using the disclosed test arbitrator and imports the result. Its
chosen route is retained; retries recover existing steps. A missed or uncertain
step never authorizes duplicate bonds, changed terms or a new withdrawal.
Do not begin a demonstration that cannot finish within those windows. Repeat
series scheduling and late-window operator recovery still need acceptance.

Clean service stops preserve the database, RFQ state and transaction journals.
A crash leaves `.local/testnet/open/running/` for operator inspection: verify
that its process and PostgreSQL/maker children have stopped before clearing only
that lock. Never clear keys, database or journals to work around an unresolved
transaction. An UNKNOWN payout remains quarantined.

## Evidence and remaining acceptance

[Sandbox integration](../research/reports/g7-testnet-integration-sandbox.json)
tests actual compiled contracts and receipt recovery under the testnet contract
domain using an explicitly local transport fixture. It is not public-testnet
evidence. `tests/demo/testnet.test.mjs` checks exact deployment/action matching,
uncertain-operation quarantine and account-absence preflight. The setup page
was checked for public-plan rendering, cross-origin rejection and insufficient
funding rejection without consuming a handoff.

Public deployment, maker/indexer load and restart acceptance, vendor-wallet
transaction approvals, both-leg redemption/withdrawal, full browser rehearsal,
independent review, publication reproduction and video remain pending. User
confirmed Meteor connection; this does not establish transaction acceptance.
Dependencies: APP-01/02, INF-01, MKT-02, ORC-02, DEM-01 and SEC-02. Reviewers:
infrastructure/contracts/security and release QA — independent review pending.

## Native sampled-price revision — 10 November 2026

The user accepted three external on-chain samples and guardian pause-only
authority for testnet. The source/deployment hold remains; this does not make
the earlier synthetic setup runnable. The native collector and its guarded
`sample` command are documented in [sampler evidence](../research/reports/ORC03_SAMPLER.md).
The budget draft is 48 test NEAR plus one NEAR retained by the owner; the bounded
collector uses at most three refresh deposits totaling 0.06 test NEAR within
the administrator allocation, plus gas. Public source verification and a fresh
native deployment record are required before invoking it against testnet.

## Current native funding request — transfer-only replacement

Meteor blocked the original `CreateAccount`/`Transfer`/`AddKey` request for
`hv-native.0xdeepak18.testnet`. The `native` plan is held as
`METEOR_ADD_KEY_BLOCKED`; its attempted journal has no transaction hash and remains
unresolved. Do not clear that journal, retry it or disable wallet protections.
Cancel its wallet prompt. Read-only status/recovery remain available.

The separate [native-transfer plan](../deploy/testnet/native-transfer-plan.json)
uses one ordinary **48-test-NEAR Transfer** to the exact 64-character implicit
account shown at `http://127.0.0.1:8793`. The local service controls that new
account with a newly generated key; it never receives access to the owner's
wallet. This changes the account layout: core, resolver and makers each use
independent implicit addresses, not subaccounts under `0xdeepak18.testnet`.
The page discloses this change before the user signs. Total and allocations
remain core 30, resolver 8, two makers 4.5 each, administrator 1. At least one
NEAR remains in the owner wallet. No additional faucet request is necessary.

Nine actual compiled-Wasm checks cover the single-transfer implicit creation,
full setup, restart, maker balances, disabled vault, indexer reconciliation and
admin headroom. These are Sandbox tests, not public wallet acceptance. The new
wallet transfer and public lifecycle remain pending.

```sh
# Already prepared; never recreate or replace retained signing keys/journals.
node services/testnet/cli.mjs bootstrap --name native-transfer --port 8793
# Only after matching finalized wallet funding receipts:
node services/testnet/cli.mjs deploy --name native-transfer
node services/testnet/cli.mjs serve --name native-transfer --port 8794
```

The native runtime starts bounded sampling while it brings up the reconciled
wallet desk. Initial series terms are immutable: ten minutes before the sampling
window, then three three-minute slots and the sixty-second review delay. The
strike comes from an actual Coinbase observation retained with the series.
Market observations and source receipts are evidence, not guaranteed execution or
returns. The source's request allows up to 300-second cached inputs; ingestion
time is the selected reference. An expired incomplete window stays delayed.
Full public acceptance still needs actual trading, sampling, redemptions and
withdrawal, plus independent review.

## Public deployment and next acceptance steps

The replacement transfer and all setup receipts are confirmed; see
[public evidence](../research/reports/ORC03_PUBLIC_DEPLOYMENT.md). The current
wallet desk is `http://127.0.0.1:8794`. Initial indexer catch-up remains a gate;
connection is possible while risk is disabled. Its `/api/state` reports `sync`
phase/counts separately from receipt-backed health. Read concurrency defaults to
4 and is bounded to 16; the current public profile uses four header/chunk reads,
with complete transaction trees still limited to four concurrent reads. The
`watched-roots` discovery limit is described in SPEC; unobserved indirect calls
must fail state reconciliation, never enable risk.

The first series `alpha` missed its initial fresh sample during RPC trouble.
The collector stopped after one refresh. Both makers used normal complete-pair
merge, leaving zero outstanding alpha claims and 4 NEAR free collateral each.
Its terms and delayed evidence are preserved. No price/window override exists.

A tested `create-series --series beta` command can register a separate fresh
series from real market data, with new immutable windows and retained operation
IDs. It reuses existing accounts and normally merged collateral; it neither
redeploys contracts nor resets the old series. Ordinary `deploy` restart resumes
the active retained series, so it cannot silently switch beta back to alpha.
This command has been tested locally; beta has not been registered publicly.
Wait for healthy reconciliation and the trader's storage/deposit acceptance
before starting its clock. The collector may use a separate verified free RPC
through the public plan's optional `collector_rpc_url`. The current selection
uses FASTNEAR for both, so they share provider capacity. HTTPS and testnet/code
identity checks still apply. Each series has at most three 0.02-NEAR refresh
attempts; never retry a failed or uncertain attempt or alter a missed window.

The actual trader storage minimum is 0.04096 NEAR. Storage and a suggested
0.1-NEAR demo collateral deposit require separate owner-wallet signatures and
finalized receipts; the local service cannot sign those. No additional 48-NEAR
funding request is needed.

## Free RPC selection — 10 November 2026

Primary: `https://test.rpc.fastnear.com/`. Read-only indexer fallback:
`https://archival-rpc.testnet.near.org/`. Both passed small sequential checks for
chain/genesis, final head, deployment anchor, historical chunk, finalized funding
transaction and deployed-contract identity. FASTNEAR's observed responses were
252–426 ms; archival's were 3158–3864 ms. These are observations from six calls
each, not a load benchmark or availability guarantee. dRPC returned HTTP 429;
Intear's first status response failed JSON parsing, with a later successful status
and a one-second keyless slowdown notice. No API key or paid account is required.
[NEAR's list](https://docs.near.org/api/rpc/providers) identifies archival as
severely rate limited; it is retained as a fallback, not a bulk-reading promise.

The active private/public plan and deployment now agree. New native workspaces
default to FASTNEAR; explicitly provided `--rpc-url` remains respected. The plan
fields `indexer_rpc_urls`, `indexer_request_interval_ms` (250), and
`indexer_read_concurrency` (4) survive `deploy`/`create-series` resumption.
This paces the indexer to four HTTP request starts per second, including status
calls. HTTP 429 honors `Retry-After`, defaulting to a 60-second cooldown. Historical
cache and journals are preserved. Wallet/admin writes retain their original
single-attempt transport and receipt-recovery rules; read fallback never resends
a transaction. Initial public reconciliation remains required. Free-provider
selection alone does not establish that full-network discovery can keep pace.

Evidence: `research/reports/testnet-rpc-provider-check.json`; dependencies INF-01,
APP-02 and ORC-03. Invariant: chain/code pins, complete receipts and exact state
reconciliation remain mandatory. Failure: all providers unavailable keeps risk
disabled. Independent infrastructure/security review pending.


## Hosted headers and operation-scoped discovery — current follow-up

The active profile now uses `header_source: "neardata-testnet"` and
`transaction_filter: "journal-roots"`, with schema `hv_testnet_native_journal`.
It keeps full ancestry and reconciliation but discovers receipt roots from the
existing admin and wallet journals. Actual complete receipt trees and chunk
inclusion remain required; missing external operations block reconciliation.
The previous full-scan schema is preserved. Only immutable cache entries with
matching chain/deployment/anchor bindings were reused.

FASTNEAR remains the primary RPC; Intear is now the fallback. The archival
endpoint later returned a deprecation/rate-limit notice, superseding the earlier
small successful probe above. No paid API was enabled. `indexer_header_source`,
`indexer_transaction_filter` and `indexer_schema` are retained plan fields and
survive new-series deployment. Do not start a new timed series until the indexer
has completed public reconciliation and the user has registered/deposited.


## Selected bounded checkpoint profile

The final native demo selection supersedes the full-header follow-up above:
`transaction_filter: "canonical-journal"`, schema `hv_testnet_native_canonical`,
500 ms RPC pacing and four concurrent reads. The active profile omits
`header_source`; it needs canonical receipt/checkpoint blocks, not every network
header. Complete FINAL trees, actual chunk inclusion, canonical height/hash
checks, contiguous sequences, same-block state and existing freshness gates all
remain mandatory. See SPEC for the explicit provider-trust and journal-coverage
limits. The full-ancestry databases remain preserved.

The operator migration replays stored receipt evidence before copying a verified
checkpoint and keeps risk disabled until fresh synchronization. Public acceptance
is recorded separately from migration. `node scripts/audit-public-indexer.mjs`
exports a healthy checkpoint and rechecks stored receipt trees and balances;
it fails instead of exporting success when the runtime is unhealthy/stale.


Public reconciliation and process-restart checks have now passed. The recorded
healthy checkpoint contains 20 transactions, 68 outcomes and 15 events; restart
retains those histories and exact balances. See the `native-public-indexer-*`
reports. The next owner actions at port 8794 are separate storage registration
(0.04096 test NEAR) and collateral deposit (suggested 0.1 test NEAR), each reviewed
and signed in the wallet. Wait for complete receipts before proceeding. Fresh
series creation/trading/settlement/redemption/withdrawal still require actual
acceptance; indexer health does not establish their success.


## Current wallet funding and beta setup — 10 November 2026

The owner's 0.04096-test-NEAR storage registration and 0.1-test-NEAR collateral
funding have exact matching actions, complete successful FINAL receipt trees and
reconciled balances. Evidence: `research/reports/native-public-wallet-funding.json`.
A cancelled earlier registration remains preserved and was not resent.

Beta is deployed with four confirmed setup operations: resolver registration,
clearinghouse creation and two funded maker splits. Strike 3.6278 USD is derived
from the retained actual Coinbase observation. Its immutable sampling window is
07:22:34.923–07:31:34.923 UTC, with three 180-second slots. Alpha stays delayed;
its history and terms were not rewritten. Evidence:
`research/reports/native-public-beta-setup.json`. Trading, successful sampling,
finalization, redemption and withdrawal are not implied by setup.

FASTNEAR returned rate-limit errors during setup recovery. Intear is now the
active free primary for client, collector and indexer, with FASTNEAR as indexer
fallback. Recovery used existing hashes; attempted operations were not resent.
Maker epoch cancellations now use durable journals included in indexer discovery;
unknown attempts block new quotes and survive restart. Public quotes allow 90
seconds for wallet review, bounded by maturity; source freshness and financial
invariants remain enforced. The user has been asked to review actual P/N beta
fills. Dependencies: INF-01, APP-02, MKT-03, ORC-03, REL-01. Missing prices/receipts
fail closed; independent markets, oracle, infrastructure/security review pending.

Beta missed slot 0 and is now blocked by the quote/preview gateway. Its immutable
terms must not be reset. Makers recovered intact pairs by normal merge; owner
collateral was untouched. A fresh series may use an explicitly configured lead
time of 180–3600 seconds (default 600); the deployed terms are retained once.
The bounded demo now permits gamma as the next series. The three 180-second
sample windows, source age limits and finalization delay are unchanged.

Current bounded series IDs are alpha/beta/gamma/delta. Historical delayed cases
are retained. Delta uses the authenticated immediate callback handoff. The
client and collector use FASTNEAR; the indexer uses Intear with FASTNEAR fallback.
HTTP and JSON-RPC rate limits trigger cooldown; no automatic write resend.

The source cache is 300 seconds. New series default to three 360-second slots;
shorter new slots reject. The collector checks stored report time, waits for
cache expiry and never treats response-wrapper time as a new report. Epsilon
is the corrected bounded run. Historical 180-second series remain unchanged.

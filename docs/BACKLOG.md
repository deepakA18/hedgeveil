# Open Innovation backlog

**Deferred backend resume checklist (13 November 2026):** [DEFERRED_BACKEND.md](DEFERRED_BACKEND.md) consolidates the live-market ladder, TWAP integration, pricing, indexing, wallet acceptance and release work postponed while frontend work continues. These items remain open; UI completion is not backend acceptance.

## ORC-04 / MKT-04 — expiry reference and aligned pricing (implementation in progress)

Dependencies: FIN-01, ORC-03, MKT-03, CORE-03, INF-01, APP-01/02 and a revised SPEC.
Invariant: immutable terms and canonical authenticated expiry evidence determine
the same payout independently of caller and execution delay; old series retain
their terms. Failure path: ambiguous/missing evidence delays settlement, never
substitutes a price. Evidence required: free-source feasibility, deterministic
selection/completeness, archive/replay and boundary/failure tests, valuation
agreement and actual testnet settlement/redemption/withdrawal. Current evidence
includes [real worker execution and resolver tests](../research/reports/ORC04_HISTORICAL_WORKER.md).
The selected window is 30 minutes ending at expiry, with native inverse-call
payout and complementary P. SPEC now fixes a Coinbase last-trade-hold candidate.
Two real Outlayer historical executions replay exactly; the isolated resolver
pins worker/source/window, verifies raw evidence, and supports the existing
core resolution callback. Generated schema and Sandbox lifecycle/failure tests
are available. New-profile maker valuation, indexing/collector/UI integration,
live availability under the three-page callback limit and public deployment/full
lifecycle remain open. The terminal model rejects unresolved new-profile series.
Independent oracle/contracts/economics/security reviewer: pending. This ticket
is not complete and the new profile is not activated.

Latest ORC-03/CORE-03/04 acceptance: eta has real three-report finalization/import,
project-account exact P/N redemption and a confirmed native withdrawal ticket.
The owner subsequently redeemed P and withdrew 0.02 test NEAR through Meteor;
actual receipts and the terminal ticket pass. Replay reconciles 73 transactions /
66 events. Post-settlement restart preserved receipts, events and monetary state;
operator-assisted lock recovery is disclosed. Owner N purchase on a later series and sustained
indexer freshness remain open. Evidence and checker failure/recovery details:
[11 November acceptance run](ACCEPTANCE_RUN_2026-11-11.md). Independent review pending.

## INF-02 — managed indexer migration candidate (11 November, in progress)

FASTNEAR additive discovery is enabled on the retained desk. Real parity checks
passed for 71 historical blocks / 72 watched receipts; post-restart reconciliation
preserved 73 transactions / 313 outcomes / 66 events. Continuous feed coverage
remains unaccepted because of throttling. [Evidence](../research/reports/INF02_NEARDATA.md).

User selected FASTNEAR hosted full-block discovery after the SubQuery runner
failure. The additive feed implementation now persists cursor/hints atomically,
discovers routed calls, resumes after failure/restart and discloses lag/cooldown.
Dependencies/invariants below still apply; no managed database cutover is claimed.
Real shadow scanning encounters free-provider HTTP 429, so continuous coverage
and sole-source acceptance remain open. Local tests cover receipt linkage,
malformed blocks, cooldown, cursor conflicts and preserved reconciliation gates.

Evaluate SubQuery on OnFinality against [hosted acceptance](HOSTED_INDEXER.md).
Dependencies: INF-01, CORE-01, ORC-03, APP-01/02 and verified free native-testnet
hosting. Invariant: complete finalized receipts and same-block monetary checks
remain required. Failure path: hold migration and preserve the current database
and journals. Evidence: user-created OnFinality project; pinned SubQuery package
build/schema generation; mapping replay matches 73 archived real transactions
and 66 events; malformed/incomplete outcomes and checkpoint failure tests pass;
package published to IPFS. Hosted deployment attempted; initialization is blocked
by the runner's mainnet-only genesis lookup ([evidence](../research/reports/INF02_HOSTED_STARTUP_FAILURE.md)).
Corrected hosted runner acceptance, live receipt parity,
restart, sustained freshness and app cutover remain pending. See
[package instructions](../services/subquery/README.md). Independent infrastructure/
security reviewer: pending. No active hosted integration is claimed.

Updated 9 November 2026. FIN-01/SEC-01 and the four G1 feasibility tasks have
implemented portions. CORE-01/02/03/04 now have a bounded Sandbox implementation;
FIN-02 now has a reproducible synthetic experiment with no passing rolling-policy
candidate. ORC-01/02 now have a local G4 demo oracle/collector implementation.
MKT-01/02 now have local G5 market/maker implementation and receipt evidence.
VLT-01 has Sandbox basket mechanics; VLT-02 has an experimental one-shot guard.
Economic strategy selection and independent review remain pending.
APP-01 now has a local SDK/journal/CLI foundation; browser/testnet acceptance remains pending.
INF-01 now has local PostgreSQL replay/reconciliation, API, metrics and alerts;
public testnet/load/operational acceptance remains pending. APP-02 has the local
UI and browser evidence. DEM-01 now has explicit create/resume for retained local
state; public-wallet/testnet and full release acceptance remain pending. G1
fixtures are not product implementations.
Reviewer roles must be assigned and do not constitute
sign-off. G0 independent review remains pending. The root plan is authoritative.

## Immediate feasibility (G1)

| Task | Dependencies | Invariant | Failure path / completion evidence | Reviewer |
|---|---|---|---|---|
| G1-RUNTIME | G0 units/accounting review | Tested Wasm matches pinned toolchain/source | Pin supported SDK/Sandbox/client; execute deposit/transfer/callback smoke, record gas/storage/hashes; fail incompatible toolchain | Contracts/infrastructure |
| G1-TOKEN | G1-RUNTIME | P/N/share supply, balance and registration namespaces separate | Combined NEP-245 and NEP-141/145/148, wallet/indexer checks; receiver burns/partial returns/failures and storage/unregister tests; document internal-ledger fallback | Contracts/integrations/security |
| G1-ORACLE | G0 observation definition, G1-RUNTIME | Only bound authenticated final record sets price | Synthetic evidence restart replay, proposal/challenge/deadline/delayed paths and wrong request/config/window callbacks; production source limits recorded separately | Oracle/contracts |
| G1-PAYOUT | G0 custody model, G1-RUNTIME | One payout or one restoration, never both | Success, failure, duplicate callback, callback gas exhaustion and success then callback failure; UNKNOWN persists without timeout resend/refund; production recovery gap documented | Contracts/security |

Local evidence now lives in [G1_PUBLIC_LEDGER](../research/reports/G1_PUBLIC_LEDGER.md).
G1-RUNTIME has pinned compiled-Wasm receipt evidence on macOS ARM64, with no
testnet/cross-platform measurement yet. G1-TOKEN has namespace and adversarial
resolver evidence, but full MT conformance and wallet/indexer compatibility are
pending; use the internal-ledger product path meanwhile. G1-ORACLE demonstrates
the synthetic lifecycle and immutable authenticated bindings, with product bond
flows/collector left to G4. G1-PAYOUT demonstrates success, restoration and UNKNOWN
quarantine, including callback panic/gas exhaustion; production verified recovery
remains unimplemented. Independent G0 review is still pending.

The internal-ledger fallback is now implemented in G3; this does not close the
independent-review or wallet/indexer gates. See [G3 evidence](../research/reports/G3_COLLATERAL_CORE.md).
G2's first comparison is in [G2 evidence](../research/reports/G2_ECONOMICS.md).
No candidate passes its frozen training gates; G6 policy selection stays open.
G4's local settlement evidence is in [G4 results](../research/reports/G4_SETTLEMENT.md).
G5's local funded execution is in [G5 results](../research/reports/G5_FUNDED_MARKET.md).
G6 VLT-01 evidence is in [G6 results](../research/reports/G6_BASKET.md).
VLT-02 local guard evidence is in [keeper results](../research/reports/G6_KEEPER.md).
APP-01 local receipt evidence is in [client results](../research/reports/G7_LOCAL_CLIENT.md).
INF-01 local execution is in [indexer results](../research/reports/G7_INDEXER.md).
APP-02 local execution is in [browser results](../research/reports/G7_APP.md).
DEM-01 clean restart evidence is in [retained-demo results](../research/reports/G7_DEMO_RESUME.md).
SEC-01 bounded models, SMT obligations and seeded contract evidence are in
[security results](../research/reports/G8_SECURITY.md); independent review and
broader load/interleaving acceptance remain pending. Next are SEC-02 candidate
review, public wallet/testnet integration and the full release walkthrough;
further economic experiments require a new holdout. Actual local fills
do not resolve FIN-02's failed policy selection.

## Implementation epics

| Epic / gate | Dependencies | Invariant | Failure path / completion artifact | Reviewer |
|---|---|---|---|---|
| FIN-01 / G0–G2 — partial | G0 | Complementarity, bounded payouts, explicit units | Retained rational/Rust code and 565 vectors; independent dimensional/fee/rounding review and limits; reject bad strike/units/overflow | Economics/protocol |
| FIN-02 / G2 — local experiment implemented; selection failed | FIN-01; independent G0/economics review pending | Funded simulation conserves collateral; executable outcomes distinct from marks/solvency | 9,180 strategy runs, 612 benchmarks, four policy families, frozen train/holdout seeds and published crash/no-bid/delay/maker-exit/disagreement losses; no passing candidate; G5 adds a local execution sample, while testnet/load validation and broader reviewed assumptions remain | Quant/economics — pending |
| CORE-01 / G3 — locally implemented | G0 review pending, G1-RUNTIME | Collateral/storage/operations/fees/in-flight categories isolated | Bounded custody/storage ledger, excess release and registration refund, donation/cap failures and full event replay; independent review/production limits pending | Contracts/security |
| CORE-02 / G3 — locally implemented | CORE-01, internal-ledger fallback, FIN-01 | Exact backed pairs, immutable terms, series isolation | Public series/P/N split/transfer/merge, caps/cutoffs/permissions and seeded stateful comparison; no token callback/standards surface | Contracts/protocol |
| CORE-03 / G3–G4 — local core implemented | CORE-02, FIN-01; ORC-02 for product oracle | Rounded payouts bounded by reserves; claims burn once | Fixture-backed authenticated import, zero-payout burns, fragmentation, late-merge/dust-sweep rejection; G4 must replace the oracle fixture | Contracts/economics |
| CORE-04 / G3, G10 — local tickets implemented | CORE-01, G1-PAYOUT | Debit first, confirmed restoration once | Collateral/storage-refund tickets, private callbacks, quarantine and cleanup; success-then-callback-failure and duplicate results; local collateral receipt CLI in APP-01; storage/oracle-credit CLI and reviewed production recovery pending | Contracts/security |
| ORC-01 / G4 local demo implemented, G10 sources pending | G0 review pending, G1-ORACLE | Historical M, fixed units/window | Committed synthetic source objects, content-addressed archive and separate-process replay; missing/corrupt/inverse/stale/zero rejection; no production collector/vendor or independent source claim | Oracle/data — pending |
| ORC-02 / G4 local demo implemented | ORC-01, CORE-02 | One-way finality, immutable request binding and bond conservation | Publisher authentication; bonded proposal/challenge; historical fallback/adjudication/delay; real core callback import; credits, slashing/refunds and failed/unknown native transfers. G7 browser evidence UI/public testnet indexing and independent review remain | Oracle/contracts/security — pending |
| ORC-03 / read-only feasibility implemented; settlement blocked | ORC-01/02, APP-01; DEM-01 budget | Only authenticated historical observations bound to immutable terms can settle | Public RPC/source evidence, exact decimal conversion and 13 rejection/identity/hold tests; null/stale/ambiguous data fails closed. Paid callback, source-to-deployment verification, historical policy/public acceptance remain pending; the candidate adapter and indexer evidence are recorded below. See OUTLAYER_FEASIBILITY | Oracle/contracts/security — independent review pending |
| MKT-01 / G5 — locally implemented | CORE-01/02, FIN-02 experiment; independent reviews pending | Funded exact legs/fees atomic, nonce used once | Registered keys, distinct trade/pair encodings, 256 nonce slots/epoch, revocation and unregister persistence; 29 Sandbox checks reject invalid/replayed/stale/unfunded fills and exercise both cancellation orderings. Broader concurrency/capacity and independent review pending | Market/contracts/security — pending |
| MKT-02 / G5 — locally implemented | MKT-01, FIN-02 experiment; policy selection remains open | Maker escrow ownership, atomic direct rolls | Two separate processes, four actual maker fills, integer spreads, TTL/inventory/position/loss guards and receipt-backed epoch cancellation; synthetic marks, P/L, subsidy and no-maker outcomes published. Testnet, relay, continuous monitoring and broader depth/load evidence pending | Market/quant — pending |
| VLT-01 / G6 — local basket mechanics | CORE-03, ORC-02, MKT-01; FIN-02 policy/review unresolved | Basket entry/exit does not dilute holders | Immutable seed, ceil mint/floor exit, internal share transfer, last-holder allocation and closure; compiled-Wasm model/event reconciliation, donations, dust/minima, maturity/pauses and holder-capacity checks. No receiver callbacks/token interface, selected policy or testnet vault; review and RFQ convenience flows pending | Contracts/economics — pending |
| VLT-02 / G6 — experimental local guard | VLT-01, MKT-02; FIN-02 selection/review pending | Keeper policy-bound with no managed withdrawal authority | Pre-bootstrap immutable one-shot Sandbox terms; authenticated synthetic reference, signed full-old/new roll, four-series/maturity/fee/loss/notional guards, persistent deferral and exits. Actual competing maker fill and regressions; recurring economic policy, source independence, broader interleavings and testnet remain pending | Quant/contracts/security — pending |
| APP-01 / G7 — wallet boundary and local execution | CORE-02/03/04, MKT-01, VLT-01; independent review pending | SDK/contract units, deployment domain and finalized receipt states agree; retained local operation submits at most once | 14 exact-amount builders, explicit testnet profile, durable handoff/hash hints and browser signing adapter; 26 SDK/wallet unit groups, 14 real browser-boundary checks and 19 SDK Sandbox regressions pass. One retained receipt cannot confirm two operations. See [WALLET](WALLET.md). [NEAR Connect desk](NEAR_CONNECT.md) now supplies connection/account UI and exact handoff. Actual vendor-wallet signing/public testnet conformance, remaining methods and independent review pending | Product/contracts/security — pending |
| APP-02 / G7 — local UI implemented | APP-01, VLT-02, INF-01; wallet/policy/reviews remain partial | Actual ownership and finalized receipts; no duplicate send or invented NAV/exit | Six views, same-block exact previews, durable browser pointers, receipt/evidence recovery and maker authorization controls; 35 actual browser checks / 43 recorded transactions. [NEAR Connect desk](NEAR_CONNECT.md) adds loopback testnet connection UI and recovery; [external-link navigation fix](../research/reports/G7_WALLET_ORIGIN_FIX.md) has HTTP/Chromium regression coverage; reconciled testnet indexer, actual vendor-wallet/public-testnet acceptance, wider accessibility coverage and independent review pending; see G7_APP and G7_NEAR_CONNECT reports | Product/QA/security — pending |
| INF-01 / G7 — local implementation | CORE-01 events; ORC-02/MKT-01/VLT-01/02; APP-01 units/domain | Finalized replay and same-block views reconcile; gaps/failures never advance accepted cursor or resend funds | PostgreSQL atomic cursor/projections, receipt/log dedup, parent-hash backfill, read API/metrics and withdrawal/oracle/keeper notices; 21 actual Sandbox checks plus PostgreSQL rollback/restart/concurrent-writer tests. Quote depth explicitly unobserved; testnet, archival/load validation, notifications and independent review pending | Infrastructure/contracts/security — pending |
| DEM-01 / G7–G9 — retained local lifecycle | G1, FIN-02, APP-01/02, INF-01; public wallet/policy/reviews partial | Resume retains chain, journal and nonce history without reseeding or repeat sends | Named create/resume, private generated-key/node/database retention, stable browser origin and fail-closed guards; clean fresh-process restart and actual per-action local costs. REL-01 adds local fresh-clone orchestration and frontend-offline recovery; public testnet funding/costs, broader incident coverage and independent review pending | Release/QA/security — pending |
| SEC-01 / G8 — bounded local suite implemented | FIN-01 and available G3–G7 implementations; public integration/reviews partial | Plan §15 invariants survive the documented bounded adversarial scope | Finite withdrawal/oracle/import/reserve fixed points, ten unsafe model controls; 32 SMT obligations plus rounding counterexample; multi-seed signed trades and ledger/fault/capacity replay with real receipts and measured gas/storage. Existing differential/schema/browser evidence retained. General concurrency/load and broader symbolic/refinement scope remain open; see G8_SECURITY | Security/QA — pending |
| SEC-02 / G8, G10 — local handoff prepared; review pending | SEC-01, exact candidate source/Wasm | Review claims match shipped artifacts/scope | Source-commit/Wasm/evidence bundle, externally anchored integrity verification, 12 negative/roundtrip tests and remediation procedure; see SECURITY_REVIEW. Independent review, severity/disposition, fixes/retests and release decision remain pending | Independent security reviewer — pending |
| REL-01 / G9 — local rehearsal; public acceptance pending | G7–G8 testnet gates, DEM-01, SEC-02 testnet scope | Every demo/README claim reproducible within its recorded scope | 109 passed fresh-local-clone runtime checks; two-maker walkthrough, both-leg redemption, frontend-offline CLI payout, browser/keeper/fault/restart/stress suites, hash-verified public package and unsubmitted draft; see [REL-01 evidence](../research/reports/rel01-local.md). Public wallet/testnet records, approved policy scope, independent review, a fresh full rehearsal for the wallet increment, published release reproduction and video remain pending | Release owner / QA — pending |
| REL-02 / G10 — optional | G9, production ORC-01/02, CORE-04 recovery, SEC-02 | Trust/custody/caps explicitly accepted | Independent historical sources, audited authority, recovery/incident drills, liquidity stress, monitoring and capped release runbooks | Security/operations |

G9 completes the hackathon product. G10 production and G11 expansions do not
block that definition, but remain mandatory for their own deployments. No
G1-AI/G1-ZK, PRIV or encrypted-RFQ tasks remain active. Source attribution is
required; preparing submission text does not authorize posting it.


## Options-first testnet follow-up (9 November 2026)

User approved the options lifecycle as the first public release; the vault stays
disabled until economic selection and its own acceptance pass. Dedicated-account
setup, durable administrative receipts, deployment-bound testnet indexing and
maker runtime preparation are tracked under DEM-01/APP-02/INF-01/MKT-02/ORC-02.
See [setup and evidence](TESTNET_SETUP.md). Public funding, deployment, vendor
wallet execution, load/restart evidence and release review remain pending.
Invariant: no ambiguous setup transaction is resent; new wallet risk requires
fresh matching reconciliation; UNKNOWN payouts remain quarantined. Reviewer:
infrastructure/contracts/security and release QA — independent review pending.

## Real-data public release revision (9 November 2026)

User directive supersedes the earlier synthetic testnet acceptance path. Local
fixtures remain tests; ORC-03 and MKT-03 below block G7/G9 public acceptance.

| Task | Dependencies | Invariant | Failure path / completion evidence | Reviewer |
|---|---|---|---|---|
| ORC-03 / native sampled design and first public refresh verified; lifecycle pending | ORC-01/02, SPEC versioning, authenticated source | Actual observations bound to immutable sampled-price terms; no invented future data | Replace fixture-only collector/commitment profile; verify source/time/units, archive and replay after downtime; no-data delays settlement; source authority, callback failures and real testnet receipts required | Oracle/contracts/security — pending |
| MKT-03 / implemented, actual-data Sandbox accepted; public/review pending | ORC-03 current-data authentication, MKT-01/02, pricing specification | Signed funded quotes derive from actual market inputs and explicit valuation assumptions | Replace fixed 50/50 marks; specify volatility/time/strike/inventory inputs, freshness and loss limits; no valid inputs means no quote; retain reproducible input-to-quote evidence and actual fills | Markets/economics/security — pending |
| REL-01 / revised public acceptance — pending | ORC-03, MKT-03, DEM-01, SEC-02 | Public UI and release evidence contain no fixture-derived market or settlement claims | Keep old setup held; audit UI provenance, real wallet transactions, receipt reconciliation, restart/recovery and revised budget; no synthetic fallback | Release/QA — pending |

ORC-03 signed-intake increment: exact-byte Ed25519 verification, bounded strict JSON,
immutable archive/replay and freshness/conflict handling are implemented; see
[ORC03_SIGNED_INTAKE](../research/reports/ORC03_SIGNED_INTAKE.md). The published
provider example fails verification and remains a negative vector. Positive unit
vectors are local test keys, not live integration evidence. Valid external sample,
key provenance and source policy remain pending; the native adapter candidate
below is a separate path, not acceptance of this signed interface.

The [real-data increment](../research/reports/REAL_DATA_IMPLEMENTATION.md) now records
live HTTP market input → two maker processes → actual signed Sandbox fills,
plus a versioned resolver candidate → core import → both redemptions → native
withdrawal under an explicit source fault fixture, plus PostgreSQL sequence/
state-commitment reconciliation, missing-sample alerts and restart recovery. These do not close public
integration/review gates. The user accepted the ingestion-time/reference and pause-only authority model
for testnet on 10 November. Actual source verification remains required before
deployment. Bounded collection and durable receipt recovery are now implemented;
see [sampler evidence](../research/reports/ORC03_SAMPLER.md).

ORC-03/DEM-01 public refresh increment: the exact owner-wallet source request
and callback-block price/code identity are verified. Native setup orchestration
passes seven compiled-Wasm checks with the revised 48-NEAR allocation and
receipt-backed restart; its funding page is browser-checked. Public protocol
funding, deployment, continuous source collection and wallet lifecycle remain
pending. Independent oracle/contracts/security and release review remain pending.
See [public refresh/setup evidence](../research/reports/ORC03_PUBLIC_REFRESH.md).

DEM-01 wallet compatibility increment: Meteor blocked the original `AddKey`
funding request; that plan is held and its unconfirmed attempt preserved. A new
transfer-only implicit-account plan passes nine compiled-Wasm creation/setup/
restart/reconciliation checks with the same budget. Dependencies: APP-01/02,
ORC-03 and native setup. Invariant: the owner signs only an exact transfer;
service keys control only separate accounts. Unknown receipts block deployment
and never authorize replay. Public wallet acceptance and the changed layout's
user signature remain pending; independent security/release reviewer pending.
See `research/reports/orc03-transfer-setup-sandbox.json` and `TESTNET_SETUP.md`.

## Public funding and deployment — 10 November 2026

Owner-approved transfer `4HZ3pepUhzm7GZGYvfJMyCNXqBCRQH3dokU4EeVJsB7H`
and all 18 setup operations are confirmed by complete finalized receipts. Core,
external resolver and both funded makers are deployed; same-block readback checks
code pins, immutable series, balances and disabled vault. The local runtime is
on port 8794. Indexer reconciliation is currently failing and blocks trading;
collector initially reports `WAIT_WINDOW`. No public trader or settlement
acceptance is inferred. See `research/reports/ORC03_PUBLIC_DEPLOYMENT.md` and
`research/reports/orc03-public-native-deployment.json` (paths from repo root).
Dependencies: APP-01/02, INF-01, DEM-01, ORC-03, MKT-03. Invariant: no receipt
replay, no synthetic fallback, unhealthy indexer blocks risk. Independent
security/release review remains pending.

Public collection/recovery update: the first actual refresh succeeded, but RPC
delays prevented a fresh slot-0 sample. `alpha` remains delayed; the collector
stopped further refresh spending. Both makers consumed their intact P/N pairs
through normal confirmed merges back to free ledger collateral. This is not
successful settlement and no series was rewritten. See the public deployment
report for hashes. The indexer has a separately bound watched-root discovery
profile and bounded header prefetch, with full receipt/sequence/snapshot checks;
indirect unselected roots must block reconciliation. Local checks pass; public
reconciliation and a successful fresh-series wallet lifecycle remain pending.

## Free public testnet RPC selection — 10 November 2026

FASTNEAR is now primary, with NEAR archival as read-only indexer fallback.
Both passed six small live compatibility checks; dRPC returned HTTP 429 and
Intear was inconsistent in this sample. No paid account/key was added. Native
setup/resumption preserves the selected endpoints and pacing. The indexer shares
a 250 ms request-start budget, respects HTTP 429 Retry-After (60 seconds by
default), and retains cached immutable history. All chain/deployment, complete
receipt and state-reconciliation checks still apply; public catch-up/lifecycle
acceptance remains pending. Evidence: `research/reports/testnet-rpc-provider-check.json`
and 21 focused indexer tests; all 11 compiled Sandbox setup/restart checks also
pass. Shared schemas, 565 payoff vectors and RFQ vectors reproduce.
Dependencies: INF-01, APP-02, ORC-03. Failure path:
all providers unavailable disables risk, without replaying writes. Independent
infrastructure/security reviewer pending.

## Native journal discovery and hosted headers — 10 November 2026

Added an explicitly bound `journal-roots` profile: wallet/service journals supply
only candidate hashes; complete FINAL RPC receipt trees, actual chunk inclusion,
full finalized ancestry, contiguous event sequences and same-block balances/state
remain required. The old full-scan schema is preserved. Neardata supplies
numeric-height header hints; actual testnet anchor/recent headers were verified
without an API key. RPC still pins final head, chain/genesis and contract state.
Public catch-up is in progress; this implementation entry is not a healthy-public
acceptance claim. A missing actual transaction fails closed in compiled tests.

Evidence: `research/reports/INDEXER_SOURCE_DECISION.md`, 27 focused indexer tests,
14 compiled setup/discovery checks (full-scan equivalence, restart, omission),
12 wallet boundary and 42 origin/browser checks. Root locked Rust tests, format,
Clippy, contract locked tests/format and Wasm-target Clippy, reference/schema
checks and vectors pass. Dependencies: INF-01, APP-02, DEM-01, ORC-03. Failure:
unrecorded operations, unavailable headers/receipts or state disagreement block
risk, never reset/replay transactions. Independent infrastructure/security review
pending. `docs/REAL_DATA_READINESS.md` defines actual remaining public-flow gates.

## Public reconciliation achieved — 10 November 2026

The actual native testnet checkpoint is RECONCILED with risk allowed and both
contract snapshots matching receipt replay: core sequence 13, resolver sequence
2, 20 indexed transactions, 68 outcomes and 15 canonical events. The audit export
rechecks the stored complete FINAL trees and reconstructs balances/resolver state;
no synthetic data or success was substituted. Evidence:
`research/reports/native-public-indexer-reconciliation.json`.

Selected profile: `canonical-journal` with canonical receipt-block height/hash
checks, actual root chunk inclusion, fresh same-block snapshots and unchanged
lag/stale/sequence/custody gates. It stores sparse canonical checkpoints rather
than requiring every network header; HTTPS RPC provider trust and journal-only
discovery coverage are explicit in SPEC. The earlier full-ancestry schemas and
verified history are retained. The migration reverified existing evidence and
kept risk disabled until fresh reconciliation. This is operational acceptance
for the local demo indexer, not independent review or complete public lifecycle.

31 focused indexer cases and 18 compiled setup/discovery/migration checks pass.
Dependencies: INF-01, APP-02, DEM-01, ORC-03. Outside/missing transactions,
unavailable receipts or state mismatch still block risk. Independent
infrastructure/security review remains pending. Real user storage/deposit,
funded trading, successful fresh-series settlement, redemption and withdrawal
remain required by `docs/REAL_DATA_READINESS.md`.


Public restart acceptance also passed: after stopping the process, inspecting and
removing only its dead ownership lock, the same database resumed to a fresh
RECONCILED checkpoint. The same 20 transaction hashes, 68 outcomes, 15 events,
all ledger balances and resolver commitment were retained; no on-chain operation
was replayed. Evidence: `research/reports/native-public-indexer-restart.json` and
`research/reports/native-public-indexer-restart-check.json`. The user has been
asked to sign separate 0.04096-test-NEAR storage and 0.1-test-NEAR collateral
transactions at port 8794. Those signatures and the subsequent real lifecycle
remain pending; no timed beta series was started prematurely.

## Wallet funding and beta setup — 10 November 2026

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

## Beta missed-sample failure and quote handling — 10 November 2026

Beta's first actual refresh succeeded (`8qSVgDRpYZGNXpLF4f3jjvXiEb1Sx7xRmQd3PiXPQLNi`),
but the report aged beyond the 15-second collector preflight allowance before
sampling. All three samples remained null; beta is delayed, not settled. The
owner reported `MAKER_UNAVAILABLE` for both quotes. That response was generic;
the precise transient worker error was not retained and must not be inferred.
Subsequent direct domain/account/series reads succeeded. No owner trade was
submitted; the latest actual account view retains 0.1 test NEAR free collateral.
Both makers normally merged their intact beta pairs. The first merge's initially
unknown result was recovered by its original hash, never resent. Evidence:
`native-public-beta-sampling-observation.json`, `native-public-beta-pair-recovery.json`
in `research/reports/`.

The public quote gateway and fill preview now reject missed samples from
reconciled resolver state before new authorization. UI copy distinguishes
missed-sample, expired-series, RPC, timeout and generic maker failures, and displays
loading while fetching offers. Intact-pair merge preview now matches the contract:
maturity alone does not disable merging; finalization does. No settlement rules,
source reports or owner balances were rewritten.

Collector independent identity/head reads and same-block source/resolver/code
reads are concurrent. The final preflight checks actual report age against the
latest head, preserving the 15-second bound and on-chain 30-second maximum.
A public read-only pass took 3,900 ms; this is one observation, not a latency SLA
or proof of successful public sampling. Nine coordinator unit cases and seven
compiled-Wasm sampler checks pass. Eight actual-market compiled maker checks,
including durable cancellation and repeated-shutdown no-send, also pass. The
negative restart test preserves unknown cancellation and blocks new quotes.
Four quote-gate cases include an HTTP proof that a missed slot never invokes a
maker. Origin/browser checks and schema reproducibility pass.

Reports: `orc03-sampler-concurrent-sandbox.json`,
`mkt03-journal-market-sandbox.json`, `native-public-collector-read-timing.json`.
The initial maker test directory-permission failure is retained separately in
`mkt03-journal-private-directory-failure.json`; earlier passing evidence is
preserved. Dependencies: APP-02, INF-01, MKT-03, ORC-03, REL-01. Failure path:
missing/old data disables new risk and leaves settlement delayed; unknown writes
are recovered, never repeated. Independent review remains pending.

## Authenticated refresh handoff — 10 November 2026

Gamma also missed slot 0 after collection errors; its refreshed report was real,
but no sample was accepted. Both makers normally merged their intact pairs, and
the owner still had 0.1 test NEAR free. Gamma/alpha/beta terms remain immutable.
See `research/reports/native-public-gamma-pair-recovery.json`.

The collector now reuses the just-verified complete FINAL refresh receipt tree
and authenticates source code, asset state and timestamp at its actual callback
block, using the existing source-proof verifier. Four independent reads run
concurrently. If the report passes the same 15-second preflight at the latest
final head, it immediately submits the resolver sample. The resolver still reads
the external contract itself and enforces its unchanged on-chain freshness,
slot, callback and pause rules. Unavailable/invalid proof does not authorize a
sample or another paid refresh; unknown submissions remain quarantined.

A separately bounded actual source refresh proved the handoff: source transaction
`5D9XSFCxRH4oXE82YSpbA9VH1n3hnoBQVEb7g75JyKFS`, proof reads 354 ms,
actual report age at final head 1.049107481 seconds. This establishes one actual
fresh handoff, not option settlement. Evidence:
`research/reports/native-public-refresh-handoff.json`. Three new evidence-replay/
coordinator tests reject changed code/report/receipt trees and prevent a duplicate
sample across restart. HTTP-200 JSON-RPC `-429` responses now trigger a 60-second
indexer cooldown, with a regression test; earlier handling covered HTTP 429 only.

Delta has four confirmed setup operations with actual market strike 3.6327 USD
and immutable window 08:02:46.796–08:11:46.796 UTC. Evidence:
`research/reports/native-public-delta-setup.json`. The fresh public run remains
pending. Demo creation is bounded to alpha/beta/gamma/delta; other IDs reject.
The current client/collector primary is free FASTNEAR, rechecked by the successful
handoff; indexer reads keep Intear primary and FASTNEAR fallback. No paid API key.

A real 0.001-P internal-ledger round trip between the project makers passed with
complete actual receipts and restored balances; this is not wallet-token standard
support. Evidence: `research/reports/native-public-claim-transfer.json`.
Dependencies: APP-02, INF-01, MKT-03, ORC-03, REL-01. Independent review pending.

## Source-cache cause established and fixed — 10 November 2026

Delta accepted its first actual sample (report age at request about 5.53 seconds),
but its second refresh returned cached data. The response wrapper timestamp was
`1794297957925314073`; the actual stored report remained
`1794297785591631204`. Source policy at that block was 300 seconds. The callback
proof correctly rejected `REFRESH_REPORT`. Evidence:
`research/reports/native-public-source-cache.json`. The pinned upstream
`request_price_data` returns cached price data while reports are within recency;
its wrapper time is not report time. Earlier latency-only diagnosis was incomplete.
Three fresh reports with this cache cannot reliably fit the old 180-second slots.

The collector now reads and verifies the source's 300-second cache policy and
uses only stored report time to wait for cache expiry before its one refresh
attempt per slot. It preserves immediate authenticated callback handoff, the
15-second preflight and all unchanged on-chain guards. New series use three
360-second slots (18 minutes). Existing alpha/beta/gamma/delta terms are retained;
none was rewritten or falsely finalized. Source-policy changes fail closed.

20 focused cache/coordinator/handoff/bounds tests and seven compiled setup/
restart/reconciliation checks pass. The new regression explicitly verifies a
cached source does not invoke a refresh, and changing wrapper time cannot make
it fresh. The initial unit test used a BigInt where the strict API requires a
canonical string; that test input was corrected. Delta maker pairs were normally
merged with actual receipts; owner free collateral remains 0.1 test NEAR. See
`research/reports/native-public-delta-pair-recovery.json`.

The next bounded series is epsilon; its successful public lifecycle remains to
be verified. Further arbitrary series IDs reject. Dependencies: ORC-03, APP-02,
INF-01, MKT-03, REL-01. Invariant: cached response is never a new observation;
missed samples delay settlement, unknown writes never resend. Oracle/security/
infrastructure/release independent review remains pending.

## Unresolved setup isolation — 11 November 2026

Epsilon registration remains SUBMISSION_UNKNOWN under its original hash
`56zM3T4ok74SsHwV31MKimxgSdG6SfHKNbSXvC9Y4c3Q`. Its window has elapsed.
No core registration, maker inventory or successful epsilon lifecycle is claimed.
The intent and hash remain retained; no resend, refund or replacement of its terms.

INF-01 now distinguishes an explicit matching UNKNOWN_TRANSACTION response from
every identity-verified provider from outages/mismatches. Such discovery hints
remain unresolved and are retried; they produce no events or success records.
Exact same-block sequence, custody and resolver-state reconciliation still gates
risk. Missing executed transactions must still fail reconciliation. The health
response lists unresolved hints. This change needs focused and compiled acceptance.

The bounded next independent series is zeta, with fresh immutable terms and
three 360-second slots. Epsilon remains isolated; this is not its resubmission.
Existing funded maker inventory is reused only through normal contract operations.
Dependencies: INF-01, ORC-03, MKT-03, APP-02, REL-01. Invariant: unresolved attempts
never fabricate balance changes; failed reconciliation blocks risk. Evidence and
public lifecycle results will be recorded as observed. Independent review pending.

Validation: 24 focused transport/discovery/setup-bound tests passed. The compiled
Sandbox regression then passed 19 checks, including exact full-scan agreement,
unknown-hint retention, restart, and rejection of an omitted real financial
operation. Evidence: `research/reports/indexer-unknown-hint-none-sandbox.json`.
The first regression exposed that waiting for FINAL on an absent hash can time
out instead of returning UNKNOWN_TRANSACTION; discovery now requests NONE and
still requires returned receipt trees to be FINAL. The first failed report remains
retained separately. Current public source code matches its pin; owner free
collateral is 0.1 test NEAR and each maker has 4 test NEAR free before zeta setup.
No owner trade, settlement or withdrawal completion is inferred.

The retained broadcast classes for epsilon and zeta are `NotEnoughBalanceError`,
not evidence of execution. Both remain unresolved under their original hashes.
Current administrator balance was 0.3401062703031869 test NEAR. A bounded actual
transfer of 2 test NEAR from resolver operating surplus to the administrator
confirmed as `HaiPagpGeBtZo1Nsm4GxevjKD3CRovuU73EnUKUv2ChB`; the resolver retains
over 6 NEAR and core/user/maker collateral was untouched. Evidence:
`research/reports/native-operating-rebalance.json`. No additional owner funding
was requested. Setup now requires at least 0.5 test NEAR administrator operating
balance before fresh series materialization. Eta is the next bounded independent
series; zeta and epsilon are not resent or reset. The service runtime was restarted
with the tested unknown-hint isolation and cache-aware collector. Actual public
reconciliation and eta acceptance are still to be recorded.

## Live eta and maker clock alignment — 11 November 2026

Eta's four setup operations now have complete confirmed receipts in
`research/reports/native-public-eta-setup.json`. Window: 03:13:04.230–03:31:04.230
UTC, then 60 seconds review. The public indexer recovered with unresolved epsilon
and zeta hints retained; `native-public-unknown-isolation.json` independently
replays 49 actual transactions / 193 outcomes / 39 events at that checkpoint.

The first eta quote probe returned MARKET_DATA_UNAVAILABLE. Direct reproduction
identified MODEL_SOURCE: a fresh exchange tick can precede its inclusion in
finalized chain time. The maker now retains that observed tick and makes bounded
finalized-head reads until chain time catches up; otherwise no quote. Consumption
clock validation also accepts ticks arriving during transport without widening
the 60-second age limit or allowing future completion-time data. 18 pricing/expiry
checks pass. Actual public fill and sampled settlement remain pending. Dependencies:
MKT-03, APP-02, INF-01, ORC-03. Independent markets/security review remains pending.

The market-clock fix passed eight actual-market compiled Sandbox checks, including
P/N purchases, P sale and durable cancellation; evidence:
`research/reports/mkt03-clock-alignment-sandbox.json`. Both public eta makers now
returned actual funded signed offers with Coinbase snapshot provenance, recorded
in `research/reports/native-public-eta-clock-quote.json`. No owner fill is inferred
from a quote. Owner purchase signatures were requested through the live desk.
Root rational/vector tests, locked workspace tests, format/Clippy and 14 schema
checks pass. The HTTP quote-gate regression passes with loopback permissions;
its first sandboxed invocation hit a Node native assertion, not a passing test.
Active series now sort before historical delayed series in the UI.

The current live run and remaining acceptance gates are maintained in [11 November acceptance](ACCEPTANCE_RUN_2026-11-11.md). Hosting is deferred by user direction until backend/end-to-end acceptance finishes.

## Retail homepage preview — 11 November 2026

APP-02 now includes a plain-language homepage with an off-white/black/lime
visual direction, interactive introduction, risk/exit FAQs and working links
to the existing testnet desk. No transaction or financial behavior changed.
[Implementation and browser evidence](../research/reports/APP02_HOMEPAGE.md).
User design acceptance and independent review remain pending; other app pages
are not redesigned by this work.

Homepage revision: removed decorative arrows, the two highlighted hero labels,
the real-money/wallet-connection FAQs and the FAQ eyebrow per user feedback.
Remaining risk and exit explanations are retained. Visual acceptance remains pending.

Homepage content expansion: added the problem, interactive position/exit
explanations and a sourced Deribit inverse-options comparison. An attributed
10-word excerpt from the user-linked Vitalik post was verified through X's
public oEmbed endpoint; it links to the original and is not presented as an
endorsement. No example prices or simulated returns were added. Chromium
checks pass at 375/768/1280/1440 px, including keyboard action selection and
no page overflow. Financial behavior is unchanged; independent review pending.

Homepage comparison now includes Derive alongside Deribit and Hedgeveil, using
current official product, margin and settlement documentation. Four-column
layout checked at 375/768/1440 px; independent review remains pending.

Homepage comparison condensed to Yes/No and short labels per user feedback;
necessary purchase-risk and payout qualifications remain below the table.

Homepage comparison now emphasizes payout backing, seller liquidation, portfolio
margin, order-book availability, settlement, currency, puts and release status.
Short cells retained; seller/buyer scope and capital trade-offs explained below.

Homepage copy: removed testnet/test-token labels and the availability comparison
row at user request. This is a presentation change only; deployment network,
wallet network indicators, transaction safeguards and release status are unchanged.

Homepage refinement: removed the comparison notes/source-links block and dangling
footnote markers at user request. Research sources remain in APP02_HOMEPAGE.md;
the backing row now explicitly describes a requirement. No financial behavior changed.

Homepage FAQ now addresses perps vs options, spot limit orders, fragmented
liquidity, project-operated makers/no quotes, oracle outages, pricing and residual
risks. Seven keyboard-accessible disclosure rows checked at 375/768/1440 px.
No financial behavior changed; independent product review remains pending.

FAQ content corrected to Hedgeveil-specific questions: paired positions, capped
exposure, dollar reference vs NEAR payout, locked backing, expiring offers,
series price rules and claim/withdrawal separation. Reference-inspired generic
questions replaced; existing disclosure layout retained.

Hero redesigned to the user’s centered dark reference: two-tone headline, pill
actions and interactive payoff/backing panels. No fabricated prices or balances.
Both normalized curves verified against shared payoff math (762 points), with
responsive/keyboard checks at 375/768/1440 px. Rest of page retains light styling.

Hero correction: restored the existing light palette and flat styling; the
reference informs centered composition only. Payoff interactions unchanged.

Approved homepage integration (11 November 2026): the wallet runtime now serves
this homepage at `/` and `/home`, with the trading desk at `/app`. Existing root
trade bookmarks redirect to the desk; legacy wallet-return queries still load
receipt recovery, and new wallet returns target `/app`. Sandbox root routing and
origin guards remain intact. User visual direction accepted; independent review
remains pending. Evidence: 53 origin/model checks passed, plus Chromium against
the retained local runtime on port 8794 confirmed homepage → desk and legacy
portfolio navigation with no script errors or horizontal overflow. No financial
behavior changed. See `research/reports/APP02_HOMEPAGE.md`.

## APP-02 Next.js homepage — 12 November 2026

The approved light, centered homepage now has a real Next.js App Router / React /
TypeScript implementation in `apps/frontend`, served locally at port 3000. It
uses reusable JSX components and React state for the interactive selectors,
with the original design tokens and copy. Existing wallet/trading pages remain
in the retained desk at port 8794; links navigate there without a proxy or new
signing boundary. This supersedes the earlier implication that HTML integration
completed the React frontend. Trading/portfolio migration remains planned.

Dependencies: APP-02, approved homepage, existing wallet desk. Invariant: no
changes to financial rules, transaction recovery, origin guards or live data;
no credentials loaded into the new frontend. Failure path: missing backend
means trading is unavailable, never replaced with simulated results; malformed
public desk URLs fail configuration validation. Evidence: optimized Next.js
build, strict TypeScript, formatting and eight automated checks passed, including
375/768/1440 px hydration/keyboard/layout, no-JS FAQs, route behavior and 762
payoff points compared with shared exact arithmetic. Desktop/mobile captures
inspected. User design accepted; independent product/QA/security reviewer pending.
See `apps/frontend/README.md` and `research/reports/APP02_NEXT_FRONTEND.md`.

APP-02 visual follow-up (12 November): centered hero app CTA now uses the closing
section's lime token; the secondary CTA uses a blackish-green forest token.
Dependency: Next.js homepage. Invariant: destinations and interactions unchanged.
Hover/focus states retained; build passed. Independent visual review pending.


## APP-02 React application pages — 12 November 2026

Markets, Trade, Portfolio, Funds, Activity, Liquidity and disabled-vault pages are
implemented in `apps/frontend` with the approved light/lime/forest theme. Homepage
links now open `/markets`. This supersedes the homepage-only migration scope above.
The existing backend and journal remain running, reached through an allowlisted,
origin-checked loopback bridge. The browser uses the existing exact SDK wallet
boundary and pinned Meteor/Intear executors; it holds no service signing keys.

Dependencies: APP-01, APP-02 homepage, INF-01, DEM-01, existing maker/oracle runtime.
Invariant: unchanged financial behavior, exact quantities, durable handoff and
receipt-based completion; no fabricated market data or success. Failure path:
missing service/market data disables the affected action, stale checks block new
risk, uncertain signing remains recoverable without resend. Vault stays disabled.
Evidence: optimized build, TypeScript/format checks, 21 bridge/SDK checks and 15
homepage/workspace browser checks passed, including all seven routes at three
viewport sizes against actual retained backend data. See
[workspace evidence](../research/reports/APP02_NEXT_WORKSPACE.md).

Fresh wallet-signing acceptance in React, connected-account visual acceptance,
new-series RFQ checks and public hosting remain pending. All five currently
retained series are past expiry; the UI does not manufacture active markets.
Reviewer: independent product/QA/security review pending; no G9 completion claim.


## APP-02 frontend self-review — 12 November 2026

Applied seven relevant frontend skills and reviewed the code plus actual browser
renders. Improved mobile navigation, compact page hierarchy, readable numbers
with exact-value disclosure/copy, keyboard/modal behavior and unavailable-trade
guidance. Offer transport errors are distinct from no liquidity; stale request
results are discarded. Approved homepage styling and financial behavior persist.

Dependencies: APP-02 React workspace, SDK, retained backend/indexer/makers.
Invariant: exact signing units and receipt-based completion, no fabricated data.
Failure path: unavailable/stale data blocks new risk, wallet uncertainty never
authorizes resend. Evidence: build/TypeScript/format, 23 deterministic checks,
16 browser checks and responsive screenshot inspection; [self-review](../research/reports/APP02_FRONTEND_REVIEW.md).
Reviewer: implementation-agent self-review completed; independent review pending.
Live new-interface signing, connected-account visuals, fresh open-market RFQs and
public deployment remain pending. Backend health was paused and retained series
expired during review; this does not establish readiness for new trades.


APP-02 refinement (12 November): removed the two-column Upside / Capped value
explainer below the Markets table, as requested, and its unused styles.
Dependency: React Markets page. Invariant: market data and trading behavior
unchanged. Failure handling remains unchanged. Evidence: optimized build and
TypeScript passed. Reviewer: agent self-check; independent review pending.


## APP-02 retail flow — 12 November 2026

Priorities 1–4 implemented: open/history defaults, human market names, three-item
primary navigation, real freshness-checked Coinbase spot, USD/NEAR scenario chart,
quote cost/loss/bounds/breakeven/countdown, direct claim reviews, simpler funding
and receipt history. Explicit intent choices persist in the URL. USD values are
indicative; settlement and exact signing remain unchanged. Registration/deposit
remain two disclosed approvals; unresolved withdrawals block repeats.

Dependencies: APP-02 workspace, SDK, real backend/makers and public spot endpoint.
Invariant: no fixture live prices, changed financial behavior or optimistic
transaction success. Failure: stale spot removes estimates; missing markets,
health checks and unresolved outcomes continue to block affected actions.
Evidence: build/TypeScript/format; 30 deterministic checks (2,400 scenario reference
comparisons), 17 actual-service browser checks and responsive screenshot review.
See [implementation and gates](../research/reports/APP02_RETAIL_FLOW.md). Reviewer: implementation-agent self-review;
independent review pending.

Priority 5 automatic selection/rolling remains gated, as requested, on execution
proof. It additionally depends on ORC-04 matching maker/collector/indexer/public
lifecycle acceptance and bounded atomic cross-series quote support. No new series,
wallet signatures or rollout approval were fabricated. Connected-wallet visual
and signing acceptance, automatic receipt recovery for a new actual attempt,
public hosting and G9 completion remain pending.


### APP-02 trade layout refinement — 13 November 2026

Implemented chart beside trade ticket, real market selection strip, optional
“Help me choose”, selected-offer cost/chart synchronization, prominent purchase
cost/loss/breakeven and mobile selection → cost → chart → review order. Sell
remains accessible from Portfolio. Dependencies: existing APP-02/SDK/backend;
live acceptance needs open liquidity and the existing settlement gates.
Invariant: exact signing/payoff/custody unchanged. Expired or mismatched offers
lose their cost estimate; unavailable markets/health still block execution.
Evidence: build/TypeScript, 18 browser checks, 9 amount/market checks and three-size
visual inspection. [Details and limitations](../research/reports/APP02_RETAIL_FLOW.md#trade-layout-refinement--13-november-2026).
Implementation-agent self-review only; independent review and live wallet/quote
execution acceptance remain pending. No fresh markets or receipts fabricated.


### APP-02 compact markets / MKT-05 ladder — 13 November 2026

Compact grid, inline selectors, corner status and wallet-independent read-only
model/final-payout rows implemented. No-open state shows labelled historical
numbers; it does not activate historical trading. Model estimates are distinct
from signed offers. [Evidence and blockers](../research/reports/APP02_COMPACT_MARKETS.md).
User selected daily + Friday 08:00 UTC and five 90–110% spot levels. A deterministic
seeded planner exists but submits no actions. The current contract has **8 lifetime
series slots**, so ten simultaneous markets plus replenishment require a new
compatible storage/version/migration design. ORC-04/MKT-04 pricing and public
lifecycle acceptance also remain open; automatic provisioning is not implemented.
Dependencies: APP-02/SDK/INF-01/public prices, ORC-04/MKT-04 and versioned scalable
core for activation. Invariant: historical terms, custody and exact signing remain
unchanged. Failure: stale/unavailable data, insufficient capacity, unknown receipts
or unaccepted profile blocks affected actions. Evidence: build/types/format,
18 browser-suite and 12 deterministic checks; four-width visual inspection.
Reviewer: implementation-agent self-review; independent review pending.


### APP-02 wallet UI — 13 November 2026

Implemented a themed wallet picker with local logos, pending/retry states and a
compact connected-account dialog (switch/copy/explorer/funds/activity/disconnect).
Dependencies: APP-02 provider, pinned NEAR Connect wallets and SDK. Invariant:
validated accounts only; signing, custody and receipt recovery unchanged. Failure:
connection errors return to the picker; clipboard failures provide manual copying.
Build/types/format, 16 wallet boundary tests and three targeted browser tests passed;
picker visually reviewed at 375/768/1440px. Live account-menu acceptance and
independent review remain pending. [Evidence](../research/reports/APP02_WALLET_UI.md).


### APP-02 Cult terminal — 13 November 2026

Implemented themed Cult UI tabs/buttons/mobile drawer, persistent real series
rail, USD/NEAR scenarios, signed-offer economics, sampled settlement evidence,
finalized-payout exposure, position actions, separate balances and unresolved
receipt visibility. This supersedes the earlier Trade selector/model-mark layout;
models are not executable prices. No financial terms or signing authority changed.
Dependencies: APP-02 SDK/NEAR Connect, INF-01, spot service and real evidence.
Invariant: bigint financial math, core-finalization payout lock and receipt-based
completion. Failure: stale spot hides derived estimates; outdated account checks,
closed markets, expired quotes and missing evidence block affected actions.
Build/types/format, 17 deterministic checks, 19 browser checks and 16 wallet
boundary tests passed; visual evidence and
remaining live acceptance are recorded in [the report](../research/reports/APP02_CULT_TERMINAL.md). No open series
or successful new wallet transactions are fabricated. Reviewer: implementation-agent
self-review; independent review pending. Ladder capacity, ORC-04/MKT-04 public
lifecycle, hosting and G9 completion remain separate open gates.


APP-02 graph interaction refinement (13 November 2026): removed the separate
scenario slider. The payoff graph supports pointer hover, touch selection, arrow
keys and Home/End, with a crosshair and synchronized price/payout readout.
Dependency: existing ScenarioChart and exact payoff helpers. Invariant: financial
math remains bigint; hypothetical selection never changes a quote or signs an
action. Pointer positions clamp to the plotted range; unavailable spot retains
the labelled strike-based illustration. Build/types/format, two targeted browser
checks and actual mobile touch inspection passed. Reviewer: implementation-agent
self-review; independent review pending.


APP-02 settled-series corrections (13 November 2026): actual final price and
per-unit P/N payouts, read-only finalized chart with correct quantity/axis labels,
final-price historical ratios, slot-relative evidence timing, visible missing
slots, series backing and matched-pair merge context implemented. Closed ticket
controls/fields use explicit gate reasons; default quantity is one. Dependencies:
existing stored evidence, account reads and SDK. Invariant: no recomputation from
rounded reports, no changed payout/signing semantics. Failure: missing source or
account data remains unavailable; unfinished series do not imply finality.
Build/types/format and real-data browser checks recorded in APP02_CULT_TERMINAL.
Reviewer: implementation-agent self-review; independent review pending.
MKT-05 activation remains blocked by the eight-slot fixed layout and old-profile
allowlist, plus TWAP public acceptance/funded inventory. No open markets fabricated.


APP-02 exit/supply follow-up (13 November 2026): delayed series now put the
matched-pair merge panel first, with a working wallet-connect path and an exact
SDK merge review once holdings are known. Closed Buy/Sell controls are disabled.
The quote area uses one gate message and unavailable-value dashes. Cumulative
minted, merged and per-leg redeemed units explain unequal outstanding supply;
redemption is derived as total_split - total_merged - outstanding for each leg,
with missing/inconsistent counters unavailable. Key chart ticks are exact strike
and final price with separate label positions. All three missed slots read
"Window elapsed · no reports". Dependencies: retained series/account evidence
and SDK. Invariant: no new payout or custody behavior; no wallet send on inspect
or connect. Failure: insufficient/unavailable matched holdings block merge;
finalized series do not offer it. Build/types/format and targeted browser/data
checks recorded in APP02_CULT_TERMINAL. Reviewer: implementation-agent self-review;
independent and connected-wallet merge acceptance pending. MKT-05 activation
remains incomplete; this follow-up makes no live-market acceptance claim.

### APP-02 chart inspection and compact footer — 2026-11-13

Graph hover/tap/keyboard inspection now shows the selected price, NEAR/USD payout
and P&L when a cost is available. Finalized-series inspection is explicitly
hypothetical; the actual settled result remains fixed. A shared compact footer
replaces the homepage tagline and workspace footer, using existing documentation,
FAQ, pricing, NEAR and GitHub destinations in the existing theme.
Dependencies: exact payoff helpers, retained settlement and spot/cost evidence.
Invariant: no financial behavior, wallet submission or settlement-state changes.
Failure: absent cost leaves P&L unavailable; stale spot cannot supply USD entry
cost. Evidence: production build, typecheck and formatting passed; two focused
workspace browser tests passed, plus touch inspection at 390px with no horizontal
overflow. Desktop footer measured 49px; desktop/mobile visuals self-reviewed.
Reviewer: implementation-agent self-review; independent review pending.
This UI update does not complete the MKT-05 live ladder activation.

### APP-02 footer placement correction — 2026-11-13

Moved the shared footer outside the content frame, with a full-width divider and
an inset link row (82%, capped at 1280px). Removed the trailing blank scroll area:
chart screen-reader instructions now have a positioned containing block inside
the scroll panel. Dependencies: existing shell and shared footer. Invariant:
content/actions and keyboard instructions are preserved. Failure path: mobile
links wrap without horizontal overflow. Evidence: build/type compilation and
format check passed; full-page desktop (1512px), mobile (390px), and homepage
browser checks put footer bottom within 1px of viewport bottom at end of scroll.
Desktop footer 53px; mobile 89px. Full-page screenshots self-reviewed.
Reviewer: implementation-agent; independent review pending.

### APP-02 settlement clarity and merge visibility — 2026-11-13

Backing now reads "NEAR backing remaining" with six display decimals and exact
atomic units retained; outstanding claims remain separately labelled in units.
The final-price gridline/tick is solid and drawn above the fill; strike caption
uses the same exact price as its tick. Delayed rows omit redundant final-price
pending text. Finalized markets lead with the payout chart; settlement reports,
coefficients and supply remain available in an initially collapsed disclosure.
The existing delayed-series primary merge action was verified on real alpha
state (wallet-connect opens without a transaction). Mobile now labels its drawer
entry "Merge matching pairs". Finalized eta correctly does not offer merge.
Dependencies: exact display helpers, recorded core/oracle data, existing SDK.
Invariant: no change to settlement, holdings or signing; hypothetical inspection
cannot change the fixed payout. Failure: unavailable or unmatched holdings still
block merge; missing live offers stay unavailable. Evidence: production build
and type compilation; 10 amount/terminal tests and 2 focused browser tests pass;
desktop alpha/eta visuals inspected, mobile merge-to-wallet route checked.
Reviewer: implementation-agent self-review; independent review and connected
wallet merge acceptance remain pending.

MKT-05 remains unimplemented beyond the read-only planner: current core has eight
lifetime slots and a constructor-bound sampled oracle version; five slots are in
use. The ten-market rolling ladder requires a compatible new deployment/storage
layout and TWAP maker, collector/indexer and public receipt acceptance. No new
series, funded offers, chain actions or acceptance evidence were fabricated.

### APP-02 guided tour and contextual help — 13 November 2026

Implemented an optional six-step trade tour, launched with Start here and
replayable as Quick tour. It highlights the current controls, supports Back,
Next, Skip, Escape and focus restoration; dismissal is a nonessential local
preference. The tour acknowledges zero open markets and never clicks a wallet,
requests an offer or submits an action. Existing theme retained.

Installed Base UI Popover powers reusable information buttons with hover,
keyboard activation, touch, Escape/Close and viewport collision handling.
Quantity, set price, chart semantics, matched pairs, backing, trading balance,
quote reserves and quote execution/cost definitions now use contextual help.
Cost/loss values, price provenance, pending states and execution blockers remain
visible; underlying financial calculations and signing are unchanged.

Dependencies: APP-02, existing Base UI/Cult stack, current SDK/provider state.
Invariant: explanatory UI cannot fabricate markets or authorize transactions.
Failure: missing live markets remains explicit; unavailable storage does not
block the tour; unavailable amounts and gates keep their existing behavior.
Evidence: production build/type compilation, formatting, two guidance browser
checks and two existing focused workspace checks passed. Tests exercise six
steps/back/replay/dismissal, real no-open state, focus, hover/keyboard/touch,
mobile fit and zero tour POSTs. Desktop/mobile screenshots self-reviewed.
Reviewer: implementation-agent; independent review and new-user usability
acceptance remain pending. Backend work remains in DEFERRED_BACKEND.md.

### APP-02 header and wording cleanup — 13 November 2026

Removed the header network label/status dot and the inline indicative/source/age
subtitle. Source, observation age and display-only meaning remain in the price
info popover; stale prices still become unavailable. Removed middle-dot text
separators across frontend components/display labels, using plain punctuation
and clearer wording. Wallet account IDs, network configuration and signing are
unchanged. Dependencies: APP-02/spot/help. Invariant: data provenance and execution
guards remain available. Failure: stale/offline spot stays explicit and hides
spot-derived estimates. Evidence: build/types passed; tour/help, settlement and
real-source/stale-price browser checks passed; 1440px/390px headers inspected
with no dot separators or horizontal overflow. Reviewer: implementation-agent
self-review; independent review pending.

### APP-02 automatic anchored onboarding — 13 November 2026

Replaced the fixed-corner/manual tour with a first-visit tour using the installed
Base UI Popover. Each step anchors beside its wallet, market list, position,
chart, ticket or account-panel target and scrolls that target into view. Removed
the launch button. Completion, Skip and Escape persist a versioned browser
preference; unavailable local storage falls back to dismissal for this page
session. Startup waits for workspace data and avoids an already-open dialog.
Dependencies: APP-02 workspace and Base UI. Invariant: onboarding never submits
wallet/financial actions or substitutes live data; closed-market explanations
remain truthful. Failure path: unavailable data defers onboarding; blocked
storage cannot break the workspace. Evidence: production build/type compilation
and formatting passed; three guidance checks cover automatic startup, six-step
desktop/mobile placement, Back, completion/Skip/Escape persistence, focus,
help interactions and zero tour POSTs. Two focused settlement/stale-price
workspace checks passed. Desktop/mobile screenshots self-reviewed. Reviewer:
implementation-agent self-review; independent/new-user review remains pending.
Backend completion remains tracked separately in docs/DEFERRED_BACKEND.md.

### APP-02 payout explanation cleanup — 13 November 2026

Replaced the shared “Settlement terms” raw series JSON/resolver dump with
“How payouts work”: end date, profile-specific final-price method, configured
source, NEAR payouts, claiming and missing-evidence delays. Dependencies:
APP-02 and existing series metadata. Invariant: existing settlement rules and
execution remain unchanged. Unknown profiles/source metadata show unavailable
information rather than invented terms. Evidence: production build/types and
formatting passed; real eta checked at 390px/1440px with no JSON in the disclosure
and no horizontal overflow; mobile disclosure visually inspected. Reviewer:
implementation-agent self-review; independent review pending.

### APP-02 compact settlement hierarchy — 13 November 2026

Settled trade views now lead with final reference price and the fixed payout for
selected quantity, followed by a 180px reference chart. Removed duplicate result
headings, midpoint gridline, far-end x tick and stacked settlement/terms disclosures.
Samples (default), Backing and Terms use the existing Cult/Base UI tabs. Evidence
metadata and payout explanations use info popovers. Backing has one remaining
NEAR reserve and a three-column minted/redeemed/outstanding table; merged pairs
remain visible so supply still reconciles. Unknown evidence remains unavailable;
delayed markets retain missing-sample blockers and merge actions. Existing terms,
exact bigint payouts, original source data and execution gates are unchanged.
Dependencies: APP-02, existing series/indexer metadata and Cult/Base UI. Invariant:
hypothetical hover cannot change the finalized outcome; no invented observations
or live markets. Failure path: missing reports and stale snapshots remain explicit.
Evidence: production build/types, format check and five focused browser checks
passed (tabs/keyboard, fixed payoff and hover, delayed merge/mobile drawer, stale
spot, tour and help). Real eta reviewed at 390/768/1440px; evidence panels have no
internal scrolling. Final outcome block measured 289px desktop/291px mobile plus
180px chart within it. Reviewer: implementation-agent self-review; independent
review remains pending. Deferred backend/release gates remain open.

### APP-02 remove redundant trade header — 13 November 2026

Removed the visible trade title row and full-width degraded-status strip on
/trade. More detail now lives in the NEAR markets header; the open count is
beside Open now. Trading status and refresh are available from the ticket info
button, including reconciliation, snapshot age, discovery lag and unavailable
spot. Unresolved-operation badges, unavailable spot display and action-level
execution gates remain visible. Other workspace pages retain their status strip.
Dependencies: APP-02 shell, market list and ticket. Invariant: presentation does
not enable stale/unreconciled execution or alter wallet actions. Failure path:
price estimates remain hidden on stale data and affected actions stay blocked.
Evidence: production build/typecheck, desktop/mobile visual checks and four
focused browser checks passed (status, settlement/mobile controls and first-visit
tour). No horizontal overflow at 390/1440px. Reviewer: implementation-agent
self-review; independent review pending.

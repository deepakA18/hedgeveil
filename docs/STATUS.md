# Implementation status

FASTNEAR full-block discovery is implemented as an optional addition to the
canonical receipt indexer: durable cursor and hints, routed-call discovery,
atomic restart, free-tier pacing and persisted cooldown, plus discovery health.
The live shadow run saved actual blocks but encountered HTTP 429; continuous
coverage is not accepted. Additive mode preserves the original reconciliation
gates and reports feed lag separately. The application still owns its database
and API. [Configuration and checks](../services/indexer/README.md#fastnear-full-block-discovery).
The additive worker is now enabled at port 8794. Actual feed parity passed for
71 historical blocks / 72 watched receipts. Post-restart same-block reconciliation
preserved 73 transactions / 313 outcomes / 66 events.
[Evidence and operational limits](../research/reports/INF02_NEARDATA.md).

New-series expiry-price policy: Deribit-style inverse-call payoff and a 30-minute
pre-expiry NEAR/USD TWAP selected on 11 November. A fixed Coinbase trade-history
worker and separate resolver are implemented; new-profile public acceptance is pending.
[Derive / Deribit / Panoptic / Paradex comparison](../research/reports/EXPIRY_SETTLEMENT_COMPARISON.md)
records the research. Existing deployed series keep their rules.
[ORC-04 evidence](../research/reports/ORC04_HISTORICAL_WORKER.md) now contains two
real Outlayer worker executions, exact Rust/Python historical replay, a pinned
callback resolver, generated isolated schema and compiled-Wasm lifecycle tests.
Matching TWAP maker valuation, indexer/collector/UI integration, callback-limit
availability and the new profile's public lifecycle remain open. The existing
terminal model explicitly refuses unresolved new-profile series. Independent
review and release approval remain pending.

Current hosted-indexer assessment: [SubQuery / OnFinality](HOSTED_INDEXER.md).
The user deployed `hedgeveil-testnet`, but runner initialization fails because
6.0.2 requests the hard-coded mainnet genesis block on testnet; see
[diagnosis and support handoff](../research/reports/INF02_HOSTED_STARTUP_FAILURE.md).
The native-NEAR
SubQuery package is built, tested against 73 real archived transactions / 66
events and published to IPFS. Hosted runner operation, same-block parity and
cutover remain unverified. The live desk still uses the retained custom PostgreSQL
indexer. See [package instructions](../services/subquery/README.md) and
[publication record](../research/reports/inf02-subquery-publication.json).

Latest real testnet evidence (11 November): eta collected three verified external
reports, finalized/imported their exact average, and project accounts redeemed
both legs and completed a native withdrawal with a SUCCEEDED ticket. Post-flow
replay reconciles 71 transactions / 63 protocol events. Owner P purchase is
confirmed; the owner's P redemption and 0.02 test NEAR withdrawal now also pass
actual receipt/ticket verification, with 73 transactions / 66 events reconciled.
The post-settlement restart check preserved all receipts, events, positions and
tickets, with operator removal of a confirmed-dead ownership lock. Owner N
purchase remains incomplete. Live
indexer freshness still fails during receipt ingestion; a recovered checkpoint
does not establish sustained reliability. See [current acceptance](ACCEPTANCE_RUN_2026-11-11.md).

Reconciled 10 November 2026 against the Open Innovation revision of
[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The plan defines the target;
this file records evidence. Documents and fixtures alone do not complete a gate.

| Gate | Current evidence | Remaining exit evidence |
|---|---|---|
| G0 specification | Public SPEC, threat model, accounting assumptions, ADRs, draft schema v0.2 | Independent review; pin wire encodings, IDs, caps and unresolved choices |
| G1 feasibility — partial | Pinned local Wasm/Sandbox harness, FT/MT resolver experiments, synthetic oracle lifecycle and real payout callback faults | Independent G0 review, complete token conformance/wallet/indexer decision and testnet measurements; production recovery/source limits remain separate |
| G2 economics — local experiment implemented | Rational/Rust payoff agreement; 9,180 synthetic strategy runs, four policy families, finite makers, 612 benchmark runs, held-out results and failure envelope; G5 adds a local execution sample | No rolling candidate passes frozen training gates; independent review, broader market assumptions and testnet/load execution validation; vault policy unselected |
| G3 collateral core — local implementation | Bounded public ledger, separate storage/refunds, immutable series/P/N, split/transfer/merge, rounded redemption/dust, scoped pauses, native tickets, canonical events and compiled-Wasm tests | Independent review, broader adversarial/load coverage, production key/recovery controls; local collateral CLI now in G7; complete SDK/browser flows remain |
| G4 settlement — local demo implementation | Committed synthetic archive/replay, authenticated publishers, bonded proposals/challenges, fallback/arbitration/delay, immutable resolution import and bond-credit custody | Independent review, broader timing/load/interleaving coverage, broader browser evidence/fault coverage and public testnet indexing; authenticated external sampled-price source/adapter required for G9; production economic bond sizing remains G10 |
| G5 market — local implementation | Registered Ed25519 keys, funded exact fills/pair issuance, durable nonce/epoch cancellation, two separate maker processes, atomic direct rolls and receipt/event reconciliation | Independent review, broader capacity/interleavings, testnet maker funding/measurements; relay/wallet flows remain G7 |
| G6 vault — local basket and experimental guards | Sandbox-only basket/share mechanics plus optional immutable one-shot roll, authenticated synthetic reference, competing maker execution, fee/loss/notional limits and deferred inflows with exits | Independent review, selected recurring policy/current-source trust, broader interleavings, RFQ-and-mint/cash-only conveniences and testnet deployment |
| G7 application — SDK wallet boundary and local UI/indexer | Exact SDK/journal/CLI and PostgreSQL replay/reconciliation; six browser views with real funding, RFQs, basket entry/exit, settlement, payout recovery and maker controls; 35 browser checks plus a 14-check wallet-boundary fixture | Connected external-wallet UI and public wallet/testnet conformance, full demo orchestration/crash drills, remaining SDK/strategy UX and browser fault coverage, operator notifications/load/accessibility checks and independent review |
| G8 adversarial — bounded local SEC-01 | Arithmetic/schema checks; finite withdrawal/oracle/import/reserve models; 32 bounded SMT obligations; multi-seed signed-trade/ledger comparison, event replay, capacity and receipt faults | General cross-module/concurrent schedules and sustained load, broader symbolic/refinement scope, independent SEC-02 review and remediation |
| G9 hackathon release — local rehearsal verified | 109 fresh-local-clone checks, actual frontend-offline CLI exit, scoped twelve-step map, verified source/Wasm/evidence archive and unsubmitted draft; see [REL-01](../research/reports/rel01-local.md) | Public wallet/testnet lifecycle and records, policy decision, independent review, fresh full rehearsal for the wallet increment, published-candidate reproduction and walkthrough video |
| G10 capped pilot | Separate, optional; blocked | Independent historical oracle, reviewed unknown-payout recovery, custody/key audit, limits and incident drills |
| G11 expansion | Out of initial release | Pilot evidence and specification/review for each new trust boundary |

## Real-data release requirement — accepted, implementation pending

The user rejected synthetic data in the public product on 9 November 2026.
[Readiness inventory](REAL_DATA_READINESS.md) identifies the fixture collector,
resolver commitments/test arbitrator and originally fixed 50/50 maker marks.
Their public replacements and acceptance are G7/G9 requirements. Synthetic local tests and simulations
remain historical/test evidence, not public release acceptance. Market-derived maker pricing now has actual-data Sandbox receipt evidence; an
isolated native sampled resolver candidate has compiled-Wasm lifecycle evidence.
The user accepted sampled-price settlement with pause-only authority for testnet
on 10 November 2026. Public source verification and the testnet lifecycle remain pending.
The held public setup must not be resumed unchanged.

## Options testnet integration — preparation in progress

User approved dedicated accounts under `0xdeepak18.testnet` and an options-first
release with the vault disabled. Meteor connection and an actual wallet-signed Outlayer request are confirmed.
The options protocol wallet lifecycle remains pending. After the source request,
the observed owner balance was 49.9972773225077191 test NEAR. The former 81-test-NEAR setup budget is on hold, not a current
funding request. No public deployment has been sent.

[Setup instructions and acceptance limits](TESTNET_SETUP.md) describe the public
review plan, local wallet funding page, durable administrative receipt journal,
HTTPS testnet indexer profile and maker/service orchestration. Testnet domain
replay uses network-specific operation IDs, and a mismatched deployment cannot
enable wallet funding. Local compiled-Wasm checks are retained separately in
[g7-testnet-integration-sandbox.json](../research/reports/g7-testnet-integration-sandbox.json).
The [preparation report](../research/reports/G7_TESTNET_PREPARATION.md) records
11 passing compiled-Wasm setup/settlement checks and 35 passing browser regressions.
Neither local tests nor planned accounts establish testnet deployment or sign-off.
Independent review and full public lifecycle/release acceptance remain pending.

## External oracle feasibility — ORC-03

The [Outlayer report](../research/reports/OUTLAYER_FEASIBILITY.md) records actual
read-only testnet/mainnet responses, source review and 13 passing safety tests.
Both initial observed caches lacked a usable NEAR price. A 10 November local-date
read found an actual but stale testnet report with matching chain/code pins.
Historical venue-time acceptance remains outstanding; a separately specified
native sampled adapter now has local evidence below. A later owner-wallet request now has verified public receipts and matching
callback-block source data; see the refresh/setup increment below. The current and
newly prepared setup plans block bootstrap/deployment pending budget review;
existing keys, journals and local synthetic oracle tests are preserved.
Independent oracle/contracts/security review remains pending.

ORC-03 now also has an [offline signed-intake/archive increment](../research/reports/ORC03_SIGNED_INTAKE.md).
Exact signatures, strict decoding, freshness, immutable replay and conflict checks
are implemented. The provider's published example failed two verifiers; valid
external interoperability remains pending. No paid API was called. The held maker
runtime now refuses startup before keys/workspace access. Those intake-only checks do not establish settlement acceptance; the separate
pricing/resolver work is described below.

## Real-data implementation increment

[Implementation evidence](../research/reports/REAL_DATA_IMPLEMENTATION.md) records
market-derived maker valuation (11 unit groups, seven actual-market Sandbox
checks) and the native sampled resolver candidate (24 compiled-Wasm checks through
redemption/withdrawal and PostgreSQL reconciliation/restart). The user accepted its specified on-chain report
times and pause-only authority for testnet on 10 November. It does not establish
historical venue timestamps or bonded arbitration. Public source verification,
refresh acceptance and deployment remain open. The indexer now verifies native resolver sequences/state commitments,
exposes authority accounts and detects missing samples. The bounded 0.02-test-NEAR source request is now confirmed by actual finalized
receipts; public protocol lifecycle acceptance remains pending.
A non-executable 48-test-NEAR budget draft replaces the old 80-NEAR estimate
under the accepted native profile, subject to source/deployment preflight. The old public synthetic setup remains held; maker requests cannot inject marks
into the public external-data pricing profile.

## Retained verification

Five Python financial tests include 2,000 seeded rational identity cases and
1,000 fragmentation cases. Two Rust unit tests and one differential test cover
565 shared vectors. Eleven public-schema test groups cover 29 transaction intent
shapes, public accounting, domain/amount constraints, vault baskets and withdrawal
restoration restrictions. Offline schema validity is not authorization or
signature verification.

Fifteen G2 test groups check funded execution, failed-fill rollback, delayed
settlement, permanent resolution loss, future-data independence, depth/capital
limits, metrics and training-only selection. Eighty-one analytic/binomial pricing
cross-checks accompany the synthetic experiment. See [G2 report](../research/reports/G2_ECONOMICS.md).

G4 adds six collector/schema test groups and 38 compiled-Wasm checks with 174
recorded transactions and 151 validated oracle events. Its normal clearinghouse
artifact at that recorded revision is byte-identical to G3. See [G4 evidence](../research/reports/G4_SETTLEMENT.md)
for sample/capacity coverage, costs and remaining review limits.

G5 adds four signing-codec tests, two public binary vectors and 29 compiled-Wasm
checks: 97 transactions, 61 canonical ledger events and 11 signed fills (four
from the two maker processes). The new core also passes the complete G3 lifecycle,
capacity and withdrawal-fault regression. See [G5 evidence](../research/reports/G5_FUNDED_MARKET.md).
Maker marks/demand are synthetic; funding is Sandbox genesis capital. Production
price feeds, continuous maker monitoring and independent economic/security review
remain open. Original G3/G4 receipts remain historical evidence for their artifacts.

G6 VLT-01 adds 15 compiled-Wasm basket checks, with 132 recorded transactions and
105 validated events. An independent integer model and event replay cover
rounding, ownership and custody, including nine assets and all 16 holder slots.
The new binary also passes G3 lifecycle/fault and G5 market regressions, recorded
separately. See [G6 evidence](../research/reports/G6_BASKET.md). This is a Sandbox
basket profile with no approved policy, NAV or enabled keeper.

VLT-02 now adds 13 guard checks, 136 transactions and 119 canonical events across
three fresh Sandbox cores. Two funded maker processes provide competing quotes
and a separate planner proposes one actual atomic vault roll. Reference freshness,
immutable budgets, deferral/exit paths and post-roll issuance are exercised.
G3, G5 and basket regressions pass on the new artifact. See
[keeper evidence](../research/reports/G6_KEEPER.md). This one-shot profile remains
experimental; economic policy selection and independent source/review gates stay open.

APP-01 adds 13 client unit tests, TypeScript checks and 19 compiled-Wasm checks:
31 recorded transactions, 31 canonical events and 17 retained finalized RPC
responses. CLI merge, redemption and in-kind exit recover across fresh processes;
lost deposit responses cannot cause a repeat submission from the retained journal.
Callback panic/gas faults remain UNKNOWN despite successful native payouts. See
[client evidence](../research/reports/G7_LOCAL_CLIENT.md). This is a local Node
client, not a browser wallet or verified on-chain recovery mechanism. INF-01 now
supplies the separate indexer below.

INF-01 adds five replay/transport tests, a real PostgreSQL transaction/restart/API
suite and 21 compiled-Wasm acceptance checks across normal core, fault core and
real demo oracle. The worker discovers transactions from finalized block history,
retains linked outcomes and publishes only after exact custody/sequence matching.
Fresh-process restart and a fresh-schema rebuild reproduce balances; missing
events, RPC outages and mismatches preserve the prior cursor with risk disabled.
See [indexer evidence](../research/reports/G7_INDEXER.md). Production, archival/load
validation, operator notifications and independent review remain open.

APP-02 adds a neutral local browser desk, ephemeral Sandbox signing gateway and
two funded maker workers. Its 35 browser checks retain 43 real deployment/method
transactions and cover lost HTTP/signing responses without resend, quote/asset
checks, basket entry/exit, disputed settlement, actual payout failure and maker
cancellation/key controls. The SDK now has 14 builders and 14 unit groups; shared
portable amount parsing keeps browser and CLI integers aligned. See
[APP-02 evidence](../research/reports/G7_APP.md) and [application usage](APP.md).
Browser wallet/testnet acceptance and independent review remain pending.

DEM-01 adds named local create/resume with retained chain/database, generated test
keys, maker nonce reservations and SDK journal. 24 lifecycle checks preserve
identity/ownership without reseeding, keep uncertain sends unresolved and execute
a real exit after resume. Three focused state/permission tests and the existing
35 browser checks pass. See [restart evidence](../research/reports/G7_DEMO_RESUME.md).
This covers clean local stops; REL-01 below adds local fresh-clone orchestration
and frontend-offline recovery. Public wallets, testnet, broader crash/incident
drills and independent review stay open.

SEC-01 adds finite models reaching fixed points for withdrawals, oracle lifecycle,
overlapping resolution imports and reserve redemptions, with ten unsafe model
mutation counterexamples. Separate bounded integer SMT checks pass 32 obligations
at eight complementary coefficients and the configured supply cap; a rounding-up
mutation produces a checked counterexample. The compiled-Wasm stateful profile
now mixes signed P/N trades, failed late-leg fills, nonce replay, finalized
transfers and fragmented redemptions, retaining real fault/capacity/event checks.
Three seeds pass 28 checks each: 480 stateful steps, 75 signed fills, 1,463
recorded transactions and 1,406 reconciled events, with observed gas/storage at
the local caps.
See [SEC-01 evidence, measurements and limits](../research/reports/G8_SECURITY.md).
These are local bounded tests, not an independent audit or Rust/runtime refinement
proof; G8 remains open for broader schedules/load and SEC-02 review.

SEC-02 now has a local review-bundle generator and offline integrity verifier,
with an exact committed candidate, normal/fault Wasm separation and current versus
historical evidence inventory. Twelve negative/roundtrip tests and a real package
verification pass. See [review handoff](SECURITY_REVIEW.md). Independent review,
finding disposition and release approval remain pending; packaging is not sign-off.

Commands are in [README](../README.md). The [G1 report](../research/reports/G1_PUBLIC_LEDGER.md)
and [G3 report](../research/reports/G3_COLLATERAL_CORE.md) link source-hashed
receipt evidence. The core reuses the unchanged payoff library. Normal and
explicit fault-injection Wasm run in ephemeral
Sandbox accounts only. A disposable local UI demo now exists; no public product deployment, external
wallet flow or complete G9 release demo exists. The scope-reconciliation report remains a historical record
of the earlier migration, not the latest implementation status.

## Next increment

The documented internal-ledger fallback is the current interface decision; no
standards conformance is claimed. G0 independent review and G1 integration gaps
remain open, so local G3 implementation does not imply those gates passed.
MKT-01/02 and VLT-01/02 now have local implementation/evidence, with VLT-02
limited to an experimental one-shot Sandbox policy. APP-01 now has its local
SDK/journal/CLI foundation, and INF-01 has local PostgreSQL indexing, reconciliation
and a read API. APP-02 now supplies the local UI and durable browser pointers.
DEM-01 now retains the local deployment across clean process stops. SEC-01 adds
the local bounded model/SMT/stateful suite. Next are SEC-02's independent review
of an exact release candidate, public wallet/testnet integration under APP-01/02 and the complete fresh-clone
DEM-01 release workflow in [BACKLOG](BACKLOG.md). Economic selection, reviewed current
reference sources and independent review remain unresolved; no approved recurring
strategy or testnet vault is enabled. See [keeper evidence](../research/reports/G6_KEEPER.md).
G4's demo lifecycle and collector are local implementations; see the
[G4 report](../research/reports/G4_SETTLEMENT.md). FIN-02's
first synthetic experiment is reproducible but selects no passing rolling policy;
revising economic assumptions requires a new experiment/holdout and review. Production
oracle sourcing and verified payout recovery remain separate from testnet.

The prior proof, verifier deployment, public AI attestation checks, completion
tooling and original specifications are preserved in
[archive/privacy-track](../archive/privacy-track/README.md). They are not active
dependencies or evidence for revised G1/G8 gates. The old account was not changed
or deleted. Local `.env` values were not changed during migration.

REL-01 adds a temporary source-snapshot repository and real fresh local clone,
locked installs/builds, 109 runtime checks, the frozen 9,180-case stress rerun and
a hash-verified public package. The walkthrough executes a real CLI payout with
the HTTP frontend closed; separate keeper, UNKNOWN-fault and retained-restart
fixtures have explicit scope labels. The rehearsal exposed and fixed the long
PostgreSQL socket-path and omitted SQL-source failures; zero process exit alone
cannot pass a phase without evidence. See [REL-01 results](../research/reports/rel01-local.md)
and [release usage](RELEASE.md). No public deployment, external submission or
independent approval occurred; REL-01/G9 remain incomplete.

APP-01 now adds an explicit HTTPS testnet profile, durable wallet handoff, a
browser-portable Wallet Selector v10 adapter, persistent untrusted hash hints and
atomic receipt-hash ownership within the retained deployment journal. Twelve
new boundary unit groups and 14 Chromium/Sandbox checks pass; the existing
14 SDK unit groups, 19 real SDK fault checks and 35 browser checks also pass.
See [wallet-boundary evidence](../research/reports/G7_WALLET_BOUNDARY.md) and
[usage/limits](WALLET.md). A test wallet transport supplied the local signatures;
no installed external wallet, public testnet execution or deployment acceptance
is claimed. The desk remains local-only. Future release runs include these
checks; the prior REL-01 archive remains historical evidence.

### APP-01/02 NEAR Connect increment (9 November 2026)

The [NEAR Connect desk](NEAR_CONNECT.md) adds pinned Meteor/Intear choices,
explicit account selection, reconnect/disconnect, exact wallet handoff and
receipt-only recovery in a separate loopback testnet profile. It retains the
neutral vanilla UI and local FileJournal; the Sandbox signer flow remains.
Connection works without deployment credentials. Missing deployment disables
transactions; the launcher marks the currently absent reconciled testnet indexer
unhealthy, so new risk stays blocked. Mainnet/testnet vault actions remain off.

[Evidence](../research/reports/G7_NEAR_CONNECT.md) includes controlled connector
and HTTP fixtures, real Sandbox signing/lost-response recovery and the existing
browser regression suite. Vendor wallet/public-testnet receipts, hosted
NEP-413 authentication, independent review and a fresh full release rehearsal
remain pending. G7/G9 are not complete; no deployment or release was published.

APP-02 follow-up: [local navigation regression](../research/reports/G7_WALLET_ORIGIN_FIX.md)
fixes `LOCAL_ORIGIN_ONLY` on external links to the wallet document. Forty HTTP
cases and a real Chromium link/picker/reload test pass (42 Node test results
including the parent). API/write, Host and Origin guards remain in force;
independent review stays pending. Earlier wallet evidence retains its original
source hashes and receipts.

## Sampled-price decision and collector — 10 November 2026

The testnet design decision is accepted; historical venue-time/bonded arbitration
remain production work. Source acceptance is still separate. The bounded
collector now checks chain/code pins, immutable terms and actual report freshness,
retains one refresh and sample attempt per slot, recovers uncertain receipts before
later work, and uses an exclusive journal lock. A crash leaves the lock for operator
inspection; it is never removed on a timer. Confirmed source failure or a missed
slot cannot create synthetic data or authorize another paid attempt.

`services/testnet/sampling.mjs` adds the guarded `sample` command for a newly
provisioned native deployment; old synthetic deployments and held plans reject
before loading keys. The older synthetic `settle` command now also enforces the
deployment hold. Public native deployment preparation/funding and wallet/source
acceptance remain unfinished. See `research/reports/ORC03_SAMPLER.md` for checks.

## Verified external refresh and native setup — 10 November 2026

Wallet transaction `BMV5wLTUnJHR5bE664AGb15bDypkbaDSH4XWW97mMynn`
completed the exact 0.02-test-NEAR `request_price_data` call to
`price-oracle.testnet`. Complete finalized receipts, pinned source code, and
callback-block `get_asset` agree on `3618966660000` at price scale `10^12`.
The upstream result reported `from_cache: false`. This confirms a real request
path and sample; it does not prove continuous availability or the whole lifecycle.
The provider request allows cached data up to 300 seconds; our freshness checks
refer to on-chain ingestion, not independent venue time.

A separate native workspace is prepared under `hv-native.0xdeepak18.testnet`.
The tested allocation is core 30, resolver 8, two makers 4.5 each and admin 1:
48 test NEAR total, with a one-NEAR owner reserve. The earlier resolver estimate
of 5 (also 5.1) failed initialization; 8 passed. Maker collateral stays 4 each.
Seven compiled-Wasm setup checks pass, including restart, inventory, disabled
vault, PostgreSQL reconciliation and retained admin headroom. The native funding
review page on port 8793 is browser-checked; funding and deployment remain pending.
The old synthetic workspace remains held. See [refresh/setup evidence](../research/reports/ORC03_PUBLIC_REFRESH.md).

## Meteor funding block and transfer-only replacement — 10 November 2026

Meteor blocked the original new-account `AddKey` wallet request. The `native`
workspace is held as `METEOR_ADD_KEY_BLOCKED`; its attempt has no hash and remains
unresolved. No reset, resend or receipt success was inferred. Read-only public
state at block `DffnMNLuVbU7WPozHTk7N8wbfrGdGVdbSQZY1XRn5D64` showed the
original destination absent and owner balance 49.9972773225077191 test NEAR.

The separate `native-transfer` plan requests a single 48-NEAR transfer to a
locally generated implicit administrator account. Core, resolver and two makers
are independent implicit accounts, replacing the named subaccount layout.
Wallet keys are untouched; allocations remain 30/8/4.5/4.5/1. Nine compiled-Wasm
checks pass, including real single-transfer account creation, deployed contracts,
restart, inventories and PostgreSQL reconciliation. A named top-level account
experiment failed the current registrar rule in Sandbox and is not used.
Evidence: `research/reports/orc03-transfer-setup-sandbox.json`. Public wallet
acceptance, funding/deployment and lifecycle are still pending. Dependencies:
APP-01/02, DEM-01, ORC-03 and native setup. Invariant: exact receipts before
spending, no access key on owner, unresolved attempts never resend. Failure path:
block deployment and retain journal. Independent security/release review pending.

The transfer review page passes eight read-only Chromium checks at 375/768/1280
pixels: exact receiver/amount/action, disclosure of the changed account layout,
connect-before-sign, no script errors and no claimed/broadcast operation during
preview. Evidence: `research/reports/orc03-transfer-funding-preview.json`.
All 59 focused funding/receipt/proof/collector/origin checks pass. Schema, payoff
(565 cases) and RFQ vectors reproduce; Rust workspace/contract tests, formatting
and Clippy completed successfully. No public funding or deployment is inferred
from these checks. The replacement page awaits the owner's wallet signature.

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

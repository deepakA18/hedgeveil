# Implementation status

**Delivery telemetry and retry visibility deployed (14 November 2026, 10:56 UTC):** Railway now retains exact source-request-to-resolver-callback timings and exposes a strict public projection. The series row and settlement panel show observed attempts/cap, elapsed expiry, review/cap stops, and the next eligible attempt countdown only when fresh and actually scheduled. No completion ETA is invented. Eight retained deliveries contain four yield timeouts, three `STALE_TRADE` rejections and one acceptance; executor pickup timestamps are unavailable, and this mixed sample establishes no SLA/P99. Ordinary workers still default to one request. An explicit private per-series reviewed policy permits two or three total attempts with backoff and a short authorization window; it does not retry deterministic rejection or UNKNOWN. No new paid request or contract change was made. At 10:53 UTC, the public app had **ten open markets** and both makers returned real P/N offers; `0 open` is superseded. Focused telemetry/coordinator/UI tests, release checks, typecheck, schema generation check and production build pass. Real public desktop/mobile browser checks verify progress/history without mock data. Older rejected cases, first-time public combined deposit, owner-wallet redemption, sustained ten-user execution and independent review remain open. [Delivery distribution](../research/reports/delivery-distribution-2026-11-14.json), [deployment and UI evidence](../research/reports/delivery-progress-release-2026-11-14.json).

**Sequential retry and real settlement completed (14 November 2026, 10:36 UTC):** one explicitly reviewed 0.02-test-NEAR retry delivered the unchanged historical TWAP in 26.651 seconds. Outlayer request 44377 and transaction `2NWCHvCvbr1Jrx7fLt7wSpJmhGpqB8yYWDy9FwtJdBBS` have final successful receipts. The resolver accepted 3.329403079313 USD/NEAR; finalization and clearinghouse import agree, and the exact callback response passes independent Rust/Python replay. Both sides of the project-owned 0.01-NEAR pair were redeemed and their total payout was withdrawn with a successful transfer/callback (one yoctoNEAR rounding dust). This proves the new-profile project-account lifecycle, not owner-wallet redemption or sustained provider reliability. Both makers returned real P/N offers again at 10:36 UTC with ten open markets. The capped sequential scheduler and failure guards pass 16 focused tests; 17 schema checks, reference/vector checks, locked workspace tests, format and Clippy pass. The tested modules were staged privately on Railway for this single policy; ordinary automatic workers still default to one request. No contract changes or overlapping requests. Older rejected cases, first-time public combined deposit, owner-wallet redemption, sustained ten-user execution and independent review remain open. [Retry evidence](../research/reports/sequential-delivery-retry-2026-11-14.json), [completion receipts](../research/reports/timely-settlement-completion-2026-11-14.json), [public offers](../research/reports/public-quotes-after-settlement-2026-11-14.json).

Earlier dated entries below are historical checkpoints, superseded only by the evidence above.

**Sequential delivery assessment (14 November 2026, 10:25 UTC):** seven existing requests were remeasured without new spending. Three worker errors returned within 107–180 blocks (64.913–102.570 seconds); four yield timeouts completed at 201 blocks. This rules out assuming a fixed 138-second callback lag but does not prove successful price delivery or exact pickup latency. Single-pending remains unchanged. A capped sequential retry scheduler is proposed, not implemented; finalized rejection, distinct attempt journals, failure classification, backoff and UNKNOWN quarantine are required. [Evidence](../research/reports/outlayer-latency-assessment-2026-11-14.json). Independent review pending.

**Delivery architecture review (14 November 2026):** durable authenticated results independent of yield expiry are now the primary provider request. The deployed resolver permits one pending request per series; overlapping +5/+50/+95-second attempts are not supported. A constant per-request pickup lag would defeat each independent timeout. Cache reuse and warm-up remain unverified hypotheses; no new paid attempt or contract change was made. Existing terms and UNKNOWN quarantine remain intact. See [recovery assessment](OUTLAYER_DELIVERY_INCIDENT.md). Implementation and independent review remain pending.

**Settlement delivery failure isolated (14 November 2026, 10:02 UTC):** the funded timely test requested Outlayer five seconds after its fixed expiry. The request expired after 201 blocks (114.386 seconds). Outlayer's worker then submitted a successful calculation, but its source contract rejected that transaction with `Execution request not found`. The actual submitted history/calculation replays exactly in Rust and Python at 3.329403079313 USD/NEAR; this is diagnostic evidence, not an accepted settlement. The resolver retains `REJECTED`, no accepted/final price, and the 0.01-NEAR pair remains backed. No redemption or payout was fabricated and no repeated paid request was made. Public reconciliation and both makers' P/N offers recovered at 10:00:50 UTC with ten open markets. New-profile settlement/redemption remains blocked on provider delivery; independent review and sustained ten-user execution acceptance remain pending. See [failure evidence](../research/reports/timely-settlement-delivery-failure-2026-11-14.json) and [provider handoff](../docs/OUTLAYER_DELIVERY_INCIDENT.md).

**Renewal and provider diagnosis (14 November 2026, 09:45 UTC):** ten ladder markets are visible after the new daily cohort reconciled. Both makers returned real P/N quotes through the public frontend at 09:40 UTC. A transient event-sequence gap during renewal blocked offers until receipts caught up; sustained availability is not claimed. The keeper now uses dRPC after the former official archival endpoint returned a deprecation/rate-limit error. Outlayer public job diagnostics identify three old executions as `STALE_TRADE` and three as failed result submissions with `Execution request not found`. These are provider-reported diagnostics, not independent attestations. All six resolver cases remain rejected with no invented payout. The project-funded timely series still awaits its 09:56:42 UTC expiry and actual callback. See [renewed-market offers](../research/reports/public-quotes-after-renewal-2026-11-14.json) and [provider diagnostics](../research/reports/outlayer-failure-diagnostics-2026-11-14.json).


**Timely settlement / restored offers (14 November 2026, 09:32 UTC):** real public P/N quotes pass from both makers after restart, with receipt reconciliation allowing risk. A separate project-owned 0.01-NEAR pair is registered for the unchanged 30-minute TWAP profile, expiring 09:56:42 UTC. Its settlement, redemptions and withdrawal are pending; registration is not lifecycle acceptance. All six older request transactions have reached final receipts, but rejected evidence does not establish a final price. Newly due windows are prioritized; successful receipt evidence is retained rather than repeatedly refetched, while rejected/complete observations are rechecked within 60 seconds and UNKNOWN remains uncached and write-blocking. Seventeen focused tests pass. See [actual offers](../research/reports/public-quotes-restored-2026-11-14.json) and [funded setup](../research/reports/timely-settlement-setup-2026-11-14.json). Independent review remains pending.


**Settlement recovery checkpoint (14 November 2026):** the original service request is classified expired and not included using exact envelope/nonce evidence from two RPC providers. Its distinct replacement finalized, but Outlayer returned null after execution failure and the resolver rejected evidence; no final price or payout is claimed. A read-only reproduction hits the pinned worker’s 2 MB history limit before reaching the old expiry. This establishes a late-retrieval limitation, not Outlayer’s undisclosed internal error. Existing series keep immutable terms. Other requests remain receipt-gated, and renewal/public reconciliation may pause while callbacks are pending. Settlement/redemption, sustained availability and independent review remain open. Latest public RFQ check at 09:18:58 UTC returned `INDEXER_UNHEALTHY` / `TRANSACTION_NOT_FINAL` for both legs while external receipts were pending; five listings remain open, but current executable availability is not claimed. See [quote check](../research/reports/public-quote-check-2026-11-14.json).


**Public trading restored (14 November 2026):** ten finalized project-maker pair merges released 1 NEAR of expired matched backing. Both makers returned real funded P/N offers. The owner then bought 0.01 Upside units on the public Vercel app; transaction `81w1373sAcoZ4VdmWjoFd3z3p5khNnjG7JFFs2PodPJ9` is FINAL with successful receipts and an exact 0.0004812929534123283645-NEAR trading debit. Gas is separate. No user funds were used for maker cleanup. Wallet verification now uses a themed lime action, compact account panel, busy state and sign-in-specific retry text; the Vercel production build and isolated responsive light/dark checks pass. Settlement/renewal and independent review are still tracked separately; this is not full backend acceptance.

**Public hosting (14 November 2026):** the user-authorized testnet demo is live at [hedgeveil.vercel.app](https://hedgeveil.vercel.app), with one persistent Railway backend. The laptop expiry runtime was stopped before cutover. An authenticated encrypted migration restored 1,148 retained files and 2,310 rows across 12 tables; per-table content hashes matched in both isolated Linux and Railway restoration. The application runs as UID/GID 1000. Exact-origin bridge enforcement, signed-message authentication, account isolation and logout pass on the actual hosts. Ten signed sessions across three project-controlled accounts passed concurrent private-record reads; this is not sustained ten-user trading acceptance. The user reports completing public-origin wallet sign-in. The hosted snapshot preserves 0.079735591721855544332 NEAR free collateral and 0.04096 NEAR storage. A real hosted P/N quote probe returned no offers: Coinbase validation passes, but both makers hold expired unresolved daily inventory and valuation refuses unresolved maturity. Five weekly markets are open; open listings do not imply executable liquidity. Public-origin monetary execution, first-time combined deposit, new-profile settlement/redemption, renewal and independent review remain open. Production and vault remain disabled. [Deployment evidence](../research/reports/public-hosting-2026-11-14.json), [runbook](DEPLOYMENT.md). Earlier preparation entries below are historical checkpoints, superseded only where this entry supplies evidence.

**Hosted access steps 1–2 (14 November 2026):** implemented NEP-413 account verification, short-lived protected sessions, server-side operation ownership, an authenticated exact-origin HTTPS bridge and bounded request rates. Thirty focused checks pass, including cross-account denial, replay/expiry rejection, unknown-operation quarantine and ten concurrent session identities. Frontend typecheck and production build pass. Local cryptographic/HTTP tests use isolated fixtures; actual hosted wallet, ingress, restore and ten-user sustained execution acceptance remain pending. No live state migration, signing or public exposure performed. [Security evidence](../research/reports/hosted-access-2026-11-14.json). Existing settlement/renewal gates and independent review remain open.

**Linux backend packaging (14 November 2026):** prepared a pinned, non-root Docker image and private Railway configuration (one replica, persistent mount, no sleeping, 150-second drain). Linux/amd64 build and network-disabled smoke checks pass for runtime imports, wallet integrity, PostgreSQL schema/exact amounts and database restart. The real entrypoint rejects an empty workspace; restore guards preserve crash locks and reject incompatible state. Thirteen focused startup/preflight/wallet checks pass. A clean build exposed changed upstream Meteor bytes; unchanged hash-matching public executors and upstream licenses are now retained for reproducibility, with existing wallet pins intact. [Container evidence](../research/reports/backend-container-2026-11-14.json), [hosting runbook](DEPLOYMENT.md). No live state mounted or services migrated. Hosted gateway and user isolation now pass local tests; actual host restore/load acceptance and the existing settlement/renewal gates remain open; independent review pending.

**Deployment preparation (14 November 2026):** Vercel is the selected frontend host, targeting `hedgeveil.vercel.app`; Railway is the recommended backend host; provisioning remains pending. Added `apps/frontend/vercel.json` and `.vercelignore`, plus [hosting/migration runbook](DEPLOYMENT.md), read-only `scripts/deployment-preflight.mjs` and [sanitized live evidence](../research/reports/deployment-preflight-2026-11-14.json). Five focused checks pass for missing/stale/future/duplicate telemetry, bounded reads, redaction and non-bypassable release gates. Public exposure is not ready: hosted ownership/authentication, HTTPS origins and abuse limits now pass local tests but still require final-host acceptance; settlement/renewal, first-time combined deposit and target-host/public-origin acceptance remain open. Live checkpoint: frontend/spot/API/maker heartbeats operational, chain reconciliation freshness unverified, settlement/renewal/discovery degraded. No public listener or new deployment created. Independent review pending.

**First deposit and legacy recovery (13 November 2026):** new accounts now review storage plus trading funds in one transaction/approval. Exact two-action wallet validation, amount-bound receipt verification, registration-race guards, schemas, browser form checks and compiled-Wasm success/rollback checks pass. Public first-time browser-wallet acceptance is still pending; existing registrations are unchanged. The retired native-transfer deployment returned **22.186305711682354042994213 test NEAR** to `0xdeepak18.testnet` through confirmed redemptions, withdrawals, storage refunds and surplus transfers. Its operating allocation and remaining owner obligations are preserved; no account/code deletion or active-deployment change occurred. The owner then withdrew 0.07966 NEAR with a verified successful callback; only 0.000002349869425157005740 NEAR free collateral and 0.04096 NEAR storage remain. [Owner withdrawal evidence](../research/reports/legacy-owner-withdrawal-confirmed.json). [Recovery receipts](../research/reports/legacy-fund-recovery.json), [first-deposit Sandbox evidence](../research/reports/first-deposit-sandbox.json). Independent review pending.

**Backend resumed (13 November 2026):** the separate layout-2 core/resolver and ten-market ladder are deployed on public testnet; the 32-test-NEAR funding transfer and all 54 setup operations have confirmed receipts. Both funded makers returned signature-verified P/N offers using retained real Coinbase inputs. Next.js now uses the new deployment. User-approved receipt-based indexing passes same-block reconciliation; FASTNEAR is an additive audit with incomplete full-block coverage. Owner account setup and the 0.1-NEAR deposit are confirmed in retained receipts and the finalized account audit. Read-only RPC failover is activated. Owner P/N buys and sells, withdrawal and split/merge have finalized receipt evidence. New-profile settlement/redemption and subsequent public renewal remain open. Old deployments stay separate. [Evidence and remaining work](../research/reports/BACKEND_RESUME_2026-11-13.md). Independent review pending.

**Deferred backend resume checklist (13 November 2026):** [DEFERRED_BACKEND.md](DEFERRED_BACKEND.md) consolidates the live-market ladder, TWAP integration, pricing, indexing, wallet acceptance and release work postponed while frontend work continues. These items remain open; UI completion is not backend acceptance.

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

### APP-02 full-width workspace and draggable dividers — 13 November 2026

Removed inherited shell/header/frame width caps. The navbar divider spans the
viewport; workspace outer gutters are 12px desktop and 8px mobile. Following
the user's correction, draggable shared edges replace the earlier button-based
collapse/expand controls. Desktop vertical dividers resize Markets, the chart
and the trade ticket; the horizontal divider adjusts the split above the account
panel. Double-click resets a divider; keyboard arrow keys resize it, with
Home/End bounds and accessible separator values. Mobile retains the stacked
layout and trade drawer without drag handles.

Dependencies: APP-02 terminal, responsive styles and account dock. Invariant:
resizing preserves selected series, leg, quantity and execution gates, and never
submits transactions. Failure path: viewport resizing clamps panel widths to
keep the chart usable; unavailable data/offers still block affected actions.
Evidence: production build/typecheck, format check and git diff check passed.
Five focused browser checks passed, covering actual pointer drags, account-panel
height, keyboard/reset behavior, viewport clamping, retained trade state,
first-visit onboarding and information controls. Layout checked at 390, 1440
and 2400px with no horizontal overflow or transaction POSTs; desktop/mobile
screenshots self-reviewed. Reviewer: implementation-agent self-review;
independent review pending. No backend/release gate completion claimed.

### APP-02 light and dark themes — 13 November 2026

Added a keyboard-accessible sun/moon switch to homepage and workspace headers.
Light remains the default; the dark palette uses forest-tinted surfaces, soft
white/sage text and lime actions. Shared tokens cover charts, navigation,
forms, wallet dialogs, tooltips, drawers and the footer. The choice persists
across navigation/reloads and synchronizes open tabs. An early nonce-authorized
script applies the saved theme before paint under the workspace CSP; blocked
storage does not prevent switching for the current page.

Dependencies: APP-02 shared layout, palette and existing CSP nonce. Invariant:
theme changes preserve selection, quantities, wallet state and execution gates;
they do not submit transactions. Failure path: unavailable storage falls back
to light on reload without breaking the page. Evidence: production build/types,
format and diff checks passed. Five theme browser checks cover 375/768/1440px,
keyboard operation, saved preferences, cross-tab sync, storage denial, CSP,
wallet dialogs, overflow and zero transaction POSTs. Five existing homepage
and draggable-workspace checks also passed. Dark desktop/mobile screenshots
self-reviewed; primary, muted, action and error text contrast exceed AA.
Reviewer: implementation-agent self-review; independent review pending.
Deferred backend/release gates remain open.

### APP-02 edge-to-edge trading workspace — 13 November 2026

Removed the trade page's outer horizontal/top gutters and bottom frame padding.
Panels now meet the navbar and viewport edges; the account dock fills down to
the footer. Desktop sizing measures the actual header/content offset and footer
height instead of reserving a fixed empty area. Dragging the horizontal divider
reallocates space between the upper workspace and account dock. Small screens
retain the scrollable stacked layout; short desktop windows preserve minimum
usable panel sizes and can scroll.

Dependencies: APP-02 draggable dividers and shared shell. Invariant: layout
changes preserve trade selection/quantity and do not submit transactions or
change execution gates. Failure path: minimum widths/heights and scrolling keep
controls reachable. Evidence: production build/types, formatting and diff checks
passed; focused browser coverage at 390/1440/2400px verifies zero outer gutters,
navbar/panel contact, account/footer contact before and after dragging, keyboard
resizing, retained trade state, no overflow and no transaction POSTs. Desktop
and mobile screenshots self-reviewed. Reviewer: implementation-agent self-review;
independent review pending. Backend/release gates are unchanged.

### APP-02 direct Trade entry — 13 November 2026

Homepage app CTAs now open /trade. The redundant /markets page redirects to
/trade, and its separate mobile navigation entry is removed. Portfolio/vault
entry links also target Trade; series selection and history remain in its rail.
The default HEDGEVEIL_DESK_URL is /trade; legacy /markets configuration maps to
/trade without changing user settings. Dependencies: APP-02 trade workspace
and homepage routing. Invariant: navigation never submits a trade or changes
execution gates. Failure path: existing URL validation and trading data gates
remain active; old bookmarks resolve through a 307 redirect. Evidence: build/
typecheck, eight homepage checks, live redirect verification and diff check
passed. Reviewer: implementation-agent self-review; independent review pending.

### APP-02 Funds navigation — 13 November 2026

Workspace navigation is now Trade, Portfolio and Funds on desktop and mobile.
Removed the redundant Manage funds link at the bottom of the trade ticket and
updated onboarding to point to navigation. Activity remains in the account dock;
its details/recovery route and unresolved-operation links remain accessible.
Dependencies: APP-02 shell, Funds and account dock. Invariant: this navigation
change does not alter deposits, withdrawals, receipt recovery or execution gates.
Failure path: existing wallet/funding gates remain enforced. Evidence: production
build/typecheck, diff check and real-browser checks at 390/1440px passed for Funds
navigation, retained Activity tab and no horizontal overflow. Reviewer:
implementation-agent self-review; independent review pending.

### APP-02 funding panel heights — 13 November 2026

The Funds page now stretches its side-by-side Add funds and Withdraw panels to
the same grid-row height, scoped through funds-panels. Mobile single-column
rows retain natural content height. Dependency: APP-02 Funds grid. Invariant:
no form, balance or transaction behavior changes. Failure path: expanded storage
or recipient details grow the row without fixed-height clipping. Evidence:
production build/typecheck, format and diff checks passed; CSS self-reviewed.
Connected-wallet visual acceptance and independent review remain pending.

### APP-02 centered wallet prompts — 13 November 2026

Disconnected Funds and Portfolio pages now center a contextual Connect wallet
prompt in the available page area; the shared Activity gate uses the same
layout. Positions uses a compact centered prompt inside the account panel.
Buttons open the existing provider picker and preserve busy/service checks.
Dependencies: APP-02 wallet provider, shared gate and account dock. Invariant:
opening the picker does not submit a transaction or fabricate account data.
Failure path: unavailable service/busy state disables connection; connecting
status remains visible. Evidence: production build/types, format/diff checks,
real-browser checks at 390/1440px for all three requested surfaces, picker open/
Escape/focus return, centering, overflow and zero POSTs passed. Screenshots
self-reviewed; independent review pending.

### APP-02 Activity table and homepage tweet — 13 November 2026

Activity now has a navigation entry and a compact Coss UI table with action,
exact formatted amount, receipt state, explorer link and a Details dialog.
Submitted transactions, unresolved actions and unsubmitted drafts have separate
filters; the account-dock shortcut remains. Existing receipt polling/recovery
and withdrawal-ticket controls are retained. UNKNOWN remains quarantined with
an explicit do-not-resend message. Recovery checks receipts only; draft resume
returns to review and does not submit automatically.

The homepage uses Cult UI's tweet-grid layout with real react-tweet syndication
data for Vitalik's specified post. Upstream placeholder content was replaced,
not shipped. The fixed-ID server endpoint validates the author/ID, coalesces
requests, caches successful reads for five minutes and bounds requests to eight
seconds. Unavailable data shows an original-post link, without fabricated text
or engagement. CSP permits avatar images from pbs.twimg.com; no X script/frame
permission was added. Both components use existing light/dark design tokens;
upstream MIT notices and source attribution are retained.

Dependencies: APP-02 journal/provider and modal, Coss Table/Base UI, Cult grid,
react-tweet 3.3.1 and class-variance-authority 0.7.1. Invariant: financial behavior,
receipt completion and transaction authorization are unchanged; no wallet or
receipt success is simulated in the product. Failure paths: disconnected wallet
shows the existing gate, empty activity is explicit, unknown operations stay
quarantined, unavailable tweet data falls back to its original link.
Evidence: production webpack build/types, diff check, and
`node tests/e2e/next-activity-live.mjs` passed. The read-only browser check used
four real journal records (two submitted, two drafts) in an isolated table
harness; checked filtering, modal Escape/focus return, 375/768/1440px overflow,
light/dark screenshots, real post rendering, unavailable-post fallback, invalid
post-ID rejection, and no page errors. The actual disconnected Activity route
was also checked. No wallet transaction was signed by these checks. Reviewer:
implementation-agent visual self-review; independent review pending. Existing
backend release gates remain open.

### Backend renewal, ten-user tests and live quote recovery — 13 November 2026

The expiry runtime now schedules bounded, journaled ladder renewal on startup,
every 60 seconds and after settlement. Maintenance drains maker requests, shares
the settlement ownership lock and resumes the persisted cohort after interruption.
Only project-maker inventory is recycled; user holdings and historical terms stay
unchanged. The confirmed 2-test-NEAR top-up is recorded in
`research/reports/renewal-funding-confirmed.json`; it is a finite operating budget.

The owner’s “No funded offer” report exposed RPC timeouts/rate pressure, not an
invalid 0.05 quantity. Maker reads now use identity-checked read-only RPC failover
and share successful snapshots for at most two seconds. Display sessions share
common same-block reads; wallet previews and handoff still obtain fresh verified
state. Empty ticket lists are skipped only when the on-chain retained count is
zero. Maker queues remain bounded/serialized; signatures and nonce persistence
remain request-specific. UI reasons distinguish unavailable market data, busy
makers, provider failures and actual inventory limits. TWAP series stop appearing
as open when their observation window begins.

Dependencies: CORE layout 2, ORC-04 immutable windows, MKT-04 market inputs,
INF same-block reconciliation and APP-02 receipt journals. Invariant: no fixture
prices in public operation, no stale-on-error fallback, no changed freshness
threshold, no broadcast failover/retry, no timeout-based UNKNOWN release.
Failure: exhausted funds/capacity, missing data or unresolved receipts blocks the
affected action. Queue overload returns a retryable availability reason, not a
fabricated quote or a claim that the user must lower quantity.

Evidence: `renewal-sandbox.json` passes interrupted renewal/resume, preserved terms
and duplicate prevention; `ten-users-sandbox.json` passes ten distinct accounts’
funding, both-leg fills, transfers, merges, redemption and withdrawal callbacks
with exact event reconciliation (94 transactions). These are local Sandbox tests,
not ten funded public users. `backend-renewal-maker-regression.json` passes G5
(29 checks, 97 transactions). `backend-public-concurrency.json` records ten real
concurrent sessions for one existing public account: every request received both
makers’ signed offers in 7.8 seconds; canonical reconciliation remained healthy.
The earlier failed burst is retained separately. Focused cache/API/failover,
indexer, frontend gate/cutoff, schema, reference/vector and locked Rust/Clippy
checks passed. Reports are under `research/reports/`.

Remaining: owner wallet P/N fills, live acceptance-series source callback/import
and redemption, actual subsequent public cohort renewal, wider lifecycle load
observations, public-origin wallet acceptance and release review. A separate real
30-minute acceptance series is registered and funded; its creation is not proof
of settlement. Production and vault remain disabled. Reviewer: implementation
agent checks; independent reviewer unassigned/pending.

Follow-up validation: frontend production Webpack build/typecheck and diff check
passed. The five-minute `backend-public-health-observation.json` contains 61/61
healthy canonical reconciliation samples, with maximum observed age 48.785 seconds
under the unchanged 60-second gate. RPC failures did occur and read fallback
recovered them; this does not claim an error-free provider or long-term uptime.
The live frontend returned HTTP 200 and the reconciler remained risk-allowed.


### APP-02 / INF-01 system status page — 13 November 2026

Implemented `/status` and a live Status indicator in the shared platform/homepage
footer. Eleven service rows cover the web application, API, receipt reconciliation,
RPC reads, contracts, FASTNEAR audit, two makers, Coinbase spot, Outlayer settlement
and market renewal. Diagnostics use real retained observations, not synthetic
probes or new quote requests. RPC/contract status is derived from reconciliation;
keeper health is not a guarantee that a future external request will succeed.

Dependencies: APP-02 frontend/bridge/spot reader, INF-01 reconciliation and live
maker/keeper/renewal telemetry. Invariant: status is read-only, exposes only
allowlisted fields, never authorizes execution and never claims unmeasured uptime.
Failure path: stale/missing observations become unknown; failed backend requests
replace previous healthy results. Idle makers without a recent offer result are
unverified. FASTNEAR audit lag is distinguished from canonical reconciliation.

Evidence: production frontend build/typecheck passed; eight focused status,
preview-RPC and expiry-runtime tests passed. `tests/e2e/status-live.mjs` passed
against the running application: 11 rows, light/dark themes, 375/768/1440px layouts
without horizontal overflow, footer navigation, keyboard refresh, failure/recovery,
zero browser errors and zero POST requests. History contains up to 30 measured
checks in server memory, collected on request and reset on restart; no 30-day
uptime percentage is claimed. No contract or financial behavior changed. Existing
backend acceptance tasks remain open. Reviewer: implementation-agent checks;
independent review pending.


### APP-02 compact positions table — 13 November 2026

Replaced stacked position cards with the existing Coss Table in the trade dock
and Portfolio: position/set price, expiry, status, units, payout, matched pairs,
optional exposure and inline Sell/Merge/Claim actions. Settlement details remain
expandable inside the payout cell. Existing review requests, exact quantities,
stale-spot handling and wallet/empty/error states are preserved. Narrow screens
scroll the table internally instead of overflowing the page.

Dependencies: APP-02 account state, Coss table and existing action reviews.
Invariant: presentation does not create quotes, authorize signatures or change
payoff calculations. Failure path: unavailable data retains its existing gate;
merge/claim stay disabled until their existing conditions pass.
Evidence: production build/typecheck passed. Read-only browser review used the
actual owner account balance; one 0.05 Upside row rendered with the correct sell
deep link and disabled merge/claim, both themes and 375/768/1440px widths passed.
No wallet was impersonated or transaction submitted. Independent review pending.

Owner transaction `4tQKiNzMtgRr8qn56hmd8YY26NBqWm58juceGft5cYa3` was verified
through public RPC as FINAL/SuccessValue with a QUOTE_FILLED ledger event crediting
0.05 N units for `l5b6afa68eaa43bd71237ea5f` to `0xdeepak18.testnet` on the current
`ef5328f9` core. This verifies that purchase only; it does not close remaining
both-leg, settlement, renewal or release acceptance work.


### Owner sell acceptance — 13 November 2026

Verified `VmKTQNe9xzfsLxewh1f1XYjBpRUAgRu3kg8JuVBvF8B` via public RPC:
FINAL, successful receipt outcomes and QUOTE_FILLED on the current `ef5328f9`
core. Owner `0xdeepak18.testnet` sold 0.05 N units of
`l5b6afa68eaa43bd71237ea5f`; the ledger credited exactly
0.0008124095356277152425 NEAR to free collateral. A subsequent live state read
shows P=0, N=0 and free collateral 0.0998997409324711111675 NEAR.
Evidence: `research/reports/owner-sell-confirmed.json`. The existing N buy and
this sell establish the owner's N round trip; other-leg and settlement acceptance
remain separate. Dependencies: funded RFQ, wallet signature, finalized receipt,
canonical ledger. Invariant: only confirmed receipt deltas establish completion;
UNKNOWN would remain quarantined without resend. Reviewer: implementation-agent
verification; independent review pending. No transaction submitted by the agent.


### Owner current-deployment withdrawal — 13 November 2026

`HU858PeWXoYWc59yuWybr1YahsUS9LQVNB2pXRsnuq1y` is FINAL with successful
transfer and callback outcomes. The `ef5328f9` core emitted WITHDRAWAL_REQUESTED
and WITHDRAWAL_SUCCEEDED for 0.02 NEAR to `0xdeepak18.testnet`. Retained ticket 0
is SUCCEEDED, not pending/UNKNOWN; no balance restoration occurred. Subsequent
live state shows free collateral 0.0798997409324711111675 NEAR and no positions.
Evidence: `research/reports/owner-withdrawal-current-confirmed.json`.
Dependencies: current core withdrawal callback, external wallet and finalized RPC
receipts. Invariant: transfer plus callback completion is verified; timeout never
permits resend/refund. Failure path: UNKNOWN remains quarantined. Reviewer:
implementation-agent verification; independent review pending. This closes this
owner's tested deposit/buy-N/sell-N/withdraw round trip, not both-leg settlement
or complete release acceptance. No transaction was submitted by the agent.


### APP-02 follow-up: transaction feedback and trade controls — 13 November 2026

Implemented the requested Activity cleanup (introductory heading/copy and persistent
operation banners removed), compact aligned market tabs/details, and exposure plus
Buy/Sell controls at the top of the trade ticket, including its mobile drawer.
The chart retains its axes and height for zero/empty quantity, and zero quantities
cannot request offers. The mobile tour follows the moved controls.

Shared wallet submission, close-review and redirect-return paths now keep the user
on the initiating page. Base UI toasts carry receipt-derived confirmation/failure,
pending spinners, validated explorer links when a hash is known, and an explicit
recovery action for unknown outcomes. Repeated receipt polls update one toast per
operation/state rather than replaying confirmations. Forms, wallet processing,
refresh and maker requests show loading feedback. Error messages remain available
beside forms where correction is needed.

Dependencies: existing Base UI Toast, NEAR Connect, retained operation journal,
receipt recovery and live market state. Invariant: wallet handoff is not success;
only SUCCEEDED/WITHDRAWAL_SUCCEEDED produce success toasts. UNKNOWN and RPC
uncertainty remain quarantined, with no resend/refund. No financial behavior,
contract schema, signing authorization or quote validation changed.

Evidence: production Next build/typecheck, targeted Prettier and diff checks;
19 passing receipt-feedback/market-display/terminal-data unit tests; read-only
`tests/e2e/interaction-feedback-live.mjs` passes desktop/tablet/mobile light/dark
layouts, zero-quantity chart, moved controls, mobile ticket and Activity cleanup.
Its isolated notification harness checks pending-to-success, confirmed failure,
UNKNOWN recovery, explorer links, duplicate suppression and dismissal. No test
fixture was inserted into the application and no transaction was submitted.
Screenshots inspected in `/tmp/hedgeveil-controls-*`,
`/tmp/hedgeveil-empty-chart.png`, `/tmp/hedgeveil-mobile-ticket.png` and
`/tmp/hedgeveil-feedback-{light,dark}.png`. A fresh external-wallet transaction
through the changed notification flow has not been signed during this task.
Reviewer: implementation-agent visual/functional review complete; independent
review pending. Existing keeper/renewal and release acceptance blockers remain open.


### APP-02 panel extent follow-up — 13 November 2026

Positions/Orders/Activity now span only the markets and payoff columns on desktop.
The trade ticket and its vertical resize edge span the full workspace to the
footer. The horizontal drag edge resizes the chart/account area independently.
Mobile retains the stacked account panel and trade-ticket drawer.
Dependencies: existing workspace grid, resize hook and TradingDock. Invariant:
layout changes do not affect selected market, balances or transaction state;
constrained panels scroll rather than hiding controls. Evidence: production build
and typecheck passed; read-only browser checks at 1440px and 1024px verify dock/chart
and ticket/footer alignment, pointer/keyboard resizing, and the 375px mobile
drawer. Screenshot `/tmp/hedgeveil-dock-layout-dark.png` visually reviewed.
Reviewer: implementation-agent review complete; independent review pending.


### APP-02 payoff plot density — 13 November 2026

Expanded the payoff SVG to the center column width, compacted the USD/NEAR switch
and heading, and arranged outcome details in two compact columns. At 1440px the
plot is 356px tall (previously capped at 260px); the switch is 34px and the outcome
caption is 62px. Mobile retains larger touch targets. Dependencies: existing
ScenarioChart and theme CSS. Invariant: payoff math, hover coordinates and currency
selection are unchanged; narrow content wraps and scrolls within existing panels.
Evidence: production build/typecheck and diff checks pass; read-only browser checks
verify enlarged bounds, hover, USD/NEAR switching and no overflow at 375px.
Screenshots `/tmp/hedgeveil-larger-graph-{dark,mobile}.png` visually reviewed.
Reviewer: implementation-agent review complete; independent review pending.

### Owner pair round-trip acceptance — 13 November 2026

Split confirmed FINAL in `9vtLyBG8op6vcUHj7MiL4MjjJoXo5wKtdrV7C4ysffXZ`: owner spent 0.01 free NEAR and received 0.01 P plus 0.01 N in `l5b6afa68eaa43bd71237ea5f`. After split, free balance was 0.0698997409324711111675 NEAR; series reserve increased from 0.20 to 0.21 NEAR. Dependencies: current core, funded registered owner and eligible series. Invariant: equal claim issuance equals backing locked. Evidence: `research/reports/owner-split-current-confirmed.json`; public RPC finalized success, SPLIT deltas and finalized balance checks agree. Unsigned 0.01 merge preview has no blockers and was cancelled without handoff. Merge confirmed FINAL in `Fy8fhSoYEmPhx2L4gBsFRoUK4uHCTcUDY6jdHiBbpt5T`. Public RPC receipts and MERGE ledger deltas agree: 0.01 P and 0.01 N burned, 0.01 NEAR credited, owner positions both zero, free collateral restored to 0.0798997409324711111675 NEAR, and series reserve/outstanding supply per leg restored to 0.20. Evidence: `research/reports/owner-merge-current-confirmed.json`. Owner split-to-merge round trip is verified; this does not close settlement or other release gates. Failure path: insufficient matching claims or finalized series blocks merge; ambiguous submission must be recovered, never resent. Reviewer: implementation-agent verification; independent review pending.

### Hashless expired RFQ recovery — 13 November 2026

Additional validation: 17 market-display/terminal-data tests, typecheck, schema reproducibility and production webpack build passed. Restarted frontend and current expiry runtime. Read-only browser check verified the actual retained operation API state and rendered its ActivityTable row in an isolated harness: “Expired without a fill”, “Verified from chain state”, no quarantine/awaiting-receipt text and no browser errors. No wallet was impersonated or transaction signed. Default Turbopack build hit a local port-permission error; webpack build succeeded. Independent review remains pending.

Owner reported no wallet prompt for operation `1e15b1343fd7a88e8ac8c2d2e6f6fd8169a12e7598d9c4dac0cc15ef6bc7d4fd`. The original journal remains attempted, with no hash. Added quote-specific recovery using a finalized block after expiry, matching deployment code, unchanged maker epoch and unused consumed-nonce bit. Actual quote nonce 23, epoch 0 resolved to QUOTE_EXPIRED_UNFILLED; evidence retained in `research/reports/owner-expired-quote-recovery.json`. This proves no fill, not that no transaction/gas occurred. No refund, resend, signing or balance mutation. New offers still need explicit owner review/signature. Changed epochs, consumed nonces, missing/RPC evidence and non-quote actions stay unresolved. UI labels this result separately from success/failure and exposes missing-prompt guidance. Dependencies: immutable attempt, pinned deployment and finalized RPC registry view. Validation: 21 SDK/feedback tests passed including boundary/failure cases; independent review pending. Cause of missing wallet prompt is unconfirmed, and this does not resolve the separate keeper UNKNOWN.


### Owner Capped value purchase — 13 November 2026

Confirmed FINAL in `CyJpwo6LfpRt3md23kEyRhYaXhkTUtuSKbz8oCaPr95n`: owner bought 0.01 P in `l5b6afa68eaa43bd71237ea5f` (K $3.536, November 14 08:00 UTC). Trading collateral debit, including maker fee, is 0.009938035911859589502 NEAR; finalized free balance is 0.0699617050206115216655 NEAR and holdings are P 0.01 / N 0. All receipt outcomes succeeded; the app journal independently reports SUCCEEDED. Dependencies: current core, funded maker and owner wallet signature. Invariant: exact signed claim credit and collateral debit match finalized ledger and slot-2 account state. Failure path: missing/ambiguous receipts remain unresolved; no resend. Evidence: `research/reports/owner-capped-buy-confirmed.json`. Both owner P and N purchases are now verified; P sell and new-profile settlement/redemption acceptance remain pending. Reviewer: implementation-agent verification; independent review pending.


### Capped value sale and combined trade review — 13 November 2026

Owner sale `2L3z6FvM6yqNTaeuC4rYL52kaYxxNpffmba7tiMTp8tX` is FINAL with successful receipts: 0.01 P sold from `l5b6afa68eaa43bd71237ea5f`, net trading credit 0.0097738867012440226665 NEAR, finalized free balance 0.079735591721855544332 NEAR, P/N holdings both zero. Evidence: `research/reports/owner-capped-sell-confirmed.json`. Both owner P and N buy/sell round trips now have receipt evidence; new-profile settlement/redemption and subsequent public renewal remain pending.

APP-02 now combines offer discovery and preview behind **Review trade**. It fetches fresh exact-size offers, selects the lowest fee-inclusive buy cost or highest net sell proceeds, and opens the existing exact-action review. Wallet approval stays explicit. One automatic retry is limited to quote discovery for busy/maintenance responses; no prepare, sign or send is retried. Account/selection changes discard late responses. Loading locks duplicate requests. Queue saturation and inventory maintenance have distinct messages.

The expiry scheduler previously paused makers before renewal discovered an existing unresolved signer operation. It now skips maintenance/renewal when the settlement sweep already reports HALTED_SIGNER or interrupted execution. The unresolved transaction stays quarantined; recovery checks continue and renewal can resume after resolution. This removes an avoidable quote interruption, not all possible queue/RPC failures. After restart both live makers returned real P offers for 0.01 units; no transaction was submitted during that check.

Dependencies: current funded makers, finalized account state, server preview/signature checks, immutable operation journals and server-derived quote time. Invariant: only a fresh matching offer reaches exact review; discovery never authorizes a fill, and unresolved signer state never permits renewal. Failure paths: no offer shows a specific gate; expired/malformed/mismatched offers cannot be selected; sustained busy fails after one retry; missing receipt evidence stays unresolved.

Validation: 21 focused trade-review, terminal-data, expiry-runtime and renewal tests pass; Next.js production build passes. The actual Trade component in an isolated fixture harness passes single-click review, best-price selection, bounded retry, stale-response rejection and loading checks. Read-only live browser checks pass controls, zero-quantity chart, Activity, receipt-toast transitions and six responsive/theme views. Fixture offers were confined to the isolated test route; live quote checks used actual makers. Reviewer: implementation-agent verification; independent review pending. Existing release/settlement acceptance blockers remain open.


### Service attention investigation — 13 November 2026

Maker status now uses a read-only worker health command every 30 seconds rather than requiring a customer quote within 90 seconds. The probe runs through the real worker queue, reports paused/retired/unresolved-cancellation states, drains on shutdown, and never signs, allocates a quote nonce or cancels an offer. Healthy idle workers are explicitly described as idle; executable pricing and funded size are still checked only on a trade request. A recorded failed quote is not cleared by a successful heartbeat. Missing/failed/stale health responses remain unknown or degraded.

Current live verification: both workers respond; receipt reconciliation, contract checks and RPC reads pass. The full-block audit remains behind (31,191 blocks at the retained observation). Its displayed timestamp now comes from the feed itself, not the more recent receipt snapshot; rate-limit/backoff states cannot appear healthy even at zero lag. The observed free full-block quota remains below chain growth, as recorded in BACKEND_RESUME_2026-11-13.md. No cursor jump, invented coverage or rate-limit bypass was introduced. Closing continuous-audit acceptance needs sufficient provider throughput; receipt reconciliation remains mandatory for this approved demo mode.

The settlement request `QGtg5ZYzVotHzMzw7Wk2QP3XK8P1XDLap9dNRGW2kh3` remains SUBMISSION_UNKNOWN. Four RPC endpoints returned UNKNOWN_TRANSACTION using read-only lookup. A pinned finalized resolver view reports NOT_REQUESTED, with no pending/accepted/final price for acceptance-20261113. This is diagnostic evidence, not proof authorizing a retry. The original journal remains quarantined and market renewal remains blocked. Status now names that shared dependency; it does not imply that Outlayer itself is down. Required next evidence: a final matching receipt or a separately reviewed cryptographic non-execution proof. Neither a timeout nor operator dismissal closes this blocker.

Dependencies: live worker IPC, immutable admin journal, finalized resolver reads and persisted discovery cursor. Invariant: service health is scoped to what was measured; no probe moves funds or weakens UNKNOWN handling. Failure paths: failed probes, stale checks, incomplete audit and missing receipt proof remain visible. Evidence: `research/reports/service-attention-investigation.json`; 22 focused maker/status/expiry/discovery tests pass, including isolated PostgreSQL cursor/restart checks. The PostgreSQL test initially hit sandbox EPERM on its loopback port and passed when rerun with the required local-server permission. Current backend gracefully restarted with journals retained. Reviewer: implementation-agent verification; independent review pending. Settlement, renewal and full-block coverage are explicitly not complete.


### Portfolio pair actions — 13 November 2026

Replaced the buried “Advanced: create or combine a backed pair” disclosure with visible Create a pair and Merge pairs buttons beside the Portfolio heading. Each opens its selected form above balances; market selection, pair quantity, concise backing explanation and explicit review remain available. No financial behavior changed.

Dependencies: connected account, finalized holdings, existing split/merge preview. Invariant: these buttons only open forms; signing still requires exact review and wallet approval. Failure path: missing eligible markets or unmatched holdings retain the disabled review reason, and split remains gated by risk checks. Evidence: production Webpack build and TypeScript pass (Turbopack hit a local worker-port permission error); isolated browser checks passed both review methods, exact 0.01 amounts, close behavior and 1440/375px overflow checks with compiled theme styles. No wallet or chain transactions were submitted. Frontend restarted on port 3000. Reviewer: implementation-agent verification; independent review pending.


### Compact navigation and footer — 14 November 2026

Removed the redundant Add / withdraw funds action from the Portfolio heading; Funds remains in navigation. Workspace desktop navbar is 52px (previously 72px), footer content row 40px (previously 52px). Mobile navigation retains two rows and touch targets; footer wraps when needed. Dependencies: existing theme and shared layout. Invariant: routes, wallet controls and transaction flows unchanged. Failure path: narrow screens wrap without horizontal overflow. Evidence: production Webpack/TypeScript build, read-only browser measurements at 1440/768/375px in both themes, visual inspection and diff whitespace check pass. No transactions submitted. Reviewer: implementation-agent verification; independent review pending.


### Footer alignment — 14 November 2026

Removed the requested “Test assets. Production disabled” footer text. Shared footer link groups now align to opposite viewport edges with 12px insets, wrapping on mobile. Dependencies: shared SiteFooter and theme styles. Invariant: production execution remains disabled; only presentation changed. Failure path: narrow widths wrap without clipping. Evidence: production Webpack/TypeScript build and browser checks at 1440/768/375px passed; both edge offsets measured 12px, removed text absent, no horizontal overflow. Reviewer: implementation-agent verification; independent review pending.

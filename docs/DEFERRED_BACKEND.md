# Deferred backend and live-flow work

**Delivery telemetry and retry visibility deployed (14 November 2026, 10:56 UTC):** Railway now retains exact source-request-to-resolver-callback timings and exposes a strict public projection. The series row and settlement panel show observed attempts/cap, elapsed expiry, review/cap stops, and the next eligible attempt countdown only when fresh and actually scheduled. No completion ETA is invented. Eight retained deliveries contain four yield timeouts, three `STALE_TRADE` rejections and one acceptance; executor pickup timestamps are unavailable, and this mixed sample establishes no SLA/P99. Ordinary workers still default to one request. An explicit private per-series reviewed policy permits two or three total attempts with backoff and a short authorization window; it does not retry deterministic rejection or UNKNOWN. No new paid request or contract change was made. At 10:53 UTC, the public app had **ten open markets** and both makers returned real P/N offers; `0 open` is superseded. Focused telemetry/coordinator/UI tests, release checks, typecheck, schema generation check and production build pass. Real public desktop/mobile browser checks verify progress/history without mock data. Older rejected cases, first-time public combined deposit, owner-wallet redemption, sustained ten-user execution and independent review remain open. [Delivery distribution](../research/reports/delivery-distribution-2026-11-14.json), [deployment and UI evidence](../research/reports/delivery-progress-release-2026-11-14.json).

**Sequential retry and real settlement completed (14 November 2026, 10:36 UTC):** one explicitly reviewed 0.02-test-NEAR retry delivered the unchanged historical TWAP in 26.651 seconds. Outlayer request 44377 and transaction `2NWCHvCvbr1Jrx7fLt7wSpJmhGpqB8yYWDy9FwtJdBBS` have final successful receipts. The resolver accepted 3.329403079313 USD/NEAR; finalization and clearinghouse import agree, and the exact callback response passes independent Rust/Python replay. Both sides of the project-owned 0.01-NEAR pair were redeemed and their total payout was withdrawn with a successful transfer/callback (one yoctoNEAR rounding dust). This proves the new-profile project-account lifecycle, not owner-wallet redemption or sustained provider reliability. Both makers returned real P/N offers again at 10:36 UTC with ten open markets. The capped sequential scheduler and failure guards pass 16 focused tests; 17 schema checks, reference/vector checks, locked workspace tests, format and Clippy pass. The tested modules were staged privately on Railway for this single policy; ordinary automatic workers still default to one request. No contract changes or overlapping requests. Older rejected cases, first-time public combined deposit, owner-wallet redemption, sustained ten-user execution and independent review remain open. [Retry evidence](../research/reports/sequential-delivery-retry-2026-11-14.json), [completion receipts](../research/reports/timely-settlement-completion-2026-11-14.json), [public offers](../research/reports/public-quotes-after-settlement-2026-11-14.json).

Earlier dated entries below are historical checkpoints, superseded only by the evidence above.

**Sequential delivery assessment (14 November 2026, 10:25 UTC):** seven existing requests were remeasured without new spending. Three worker errors returned within 107–180 blocks (64.913–102.570 seconds); four yield timeouts completed at 201 blocks. This rules out assuming a fixed 138-second callback lag but does not prove successful price delivery or exact pickup latency. Single-pending remains unchanged. A capped sequential retry scheduler is proposed, not implemented; finalized rejection, distinct attempt journals, failure classification, backoff and UNKNOWN quarantine are required. [Evidence](../research/reports/outlayer-latency-assessment-2026-11-14.json). Independent review pending.

**Delivery architecture review (14 November 2026):** durable authenticated results independent of yield expiry are now the primary provider request. The deployed resolver permits one pending request per series; overlapping +5/+50/+95-second attempts are not supported. A constant per-request pickup lag would defeat each independent timeout. Cache reuse and warm-up remain unverified hypotheses; no new paid attempt or contract change was made. Existing terms and UNKNOWN quarantine remain intact. See [recovery assessment](OUTLAYER_DELIVERY_INCIDENT.md). Implementation and independent review remain pending.

**Settlement delivery failure isolated (14 November 2026, 10:02 UTC):** the funded timely test requested Outlayer five seconds after its fixed expiry. The request expired after 201 blocks (114.386 seconds). Outlayer's worker then submitted a successful calculation, but its source contract rejected that transaction with `Execution request not found`. The actual submitted history/calculation replays exactly in Rust and Python at 3.329403079313 USD/NEAR; this is diagnostic evidence, not an accepted settlement. The resolver retains `REJECTED`, no accepted/final price, and the 0.01-NEAR pair remains backed. No redemption or payout was fabricated and no repeated paid request was made. Public reconciliation and both makers' P/N offers recovered at 10:00:50 UTC with ten open markets. New-profile settlement/redemption remains blocked on provider delivery; independent review and sustained ten-user execution acceptance remain pending. See [failure evidence](../research/reports/timely-settlement-delivery-failure-2026-11-14.json) and [provider handoff](../docs/OUTLAYER_DELIVERY_INCIDENT.md).

**Renewal and provider diagnosis (14 November 2026, 09:45 UTC):** ten ladder markets are visible after the new daily cohort reconciled. Both makers returned real P/N quotes through the public frontend at 09:40 UTC. A transient event-sequence gap during renewal blocked offers until receipts caught up; sustained availability is not claimed. The keeper now uses dRPC after the former official archival endpoint returned a deprecation/rate-limit error. Outlayer public job diagnostics identify three old executions as `STALE_TRADE` and three as failed result submissions with `Execution request not found`. These are provider-reported diagnostics, not independent attestations. All six resolver cases remain rejected with no invented payout. The project-funded timely series still awaits its 09:56:42 UTC expiry and actual callback. See [renewed-market offers](../research/reports/public-quotes-after-renewal-2026-11-14.json) and [provider diagnostics](../research/reports/outlayer-failure-diagnostics-2026-11-14.json).


**Timely settlement / restored offers (14 November 2026, 09:32 UTC):** real public P/N quotes pass from both makers after restart, with receipt reconciliation allowing risk. A separate project-owned 0.01-NEAR pair is registered for the unchanged 30-minute TWAP profile, expiring 09:56:42 UTC. Its settlement, redemptions and withdrawal are pending; registration is not lifecycle acceptance. All six older request transactions have reached final receipts, but rejected evidence does not establish a final price. Newly due windows are prioritized; successful receipt evidence is retained rather than repeatedly refetched, while rejected/complete observations are rechecked within 60 seconds and UNKNOWN remains uncached and write-blocking. Seventeen focused tests pass. See [actual offers](../research/reports/public-quotes-restored-2026-11-14.json) and [funded setup](../research/reports/timely-settlement-setup-2026-11-14.json). Independent review remains pending.


**Settlement recovery checkpoint (14 November 2026):** the original service request is classified expired and not included using exact envelope/nonce evidence from two RPC providers. Its distinct replacement finalized, but Outlayer returned null after execution failure and the resolver rejected evidence; no final price or payout is claimed. A read-only reproduction hits the pinned worker’s 2 MB history limit before reaching the old expiry. This establishes a late-retrieval limitation, not Outlayer’s undisclosed internal error. Existing series keep immutable terms. Other requests remain receipt-gated, and renewal/public reconciliation may pause while callbacks are pending. Settlement/redemption, sustained availability and independent review remain open.


**Resume update:** [13 November implementation evidence](../research/reports/BACKEND_RESUME_2026-11-13.md)
records layout-2 capacity/archive, keeper/indexer integration, a pre-window TWAP
valuation candidate and both a ten-market deployment rehearsal and confirmed public setup (54 successful operations). The checklist below
remains unchecked where combined public acceptance is still missing. The baseline
below describes the retained public deployment, not the new separate layout-2 deployment. The new deployment has ten open markets, verified real offers and a connected Next.js frontend. User-approved receipt-based reconciliation gates new risk; full-block discovery is an additive audit, not a completed coverage claim. Owner setup is confirmed; deposit, fills, renewal and the complete new settlement lifecycle remain pending.

Recorded 13 November 2026 at the user's request while frontend work continues.
This is the resume checklist, not completion evidence. The root
[implementation plan](../IMPLEMENTATION_PLAN.md) remains authoritative. Items
below are unchecked until their stated acceptance evidence is recorded.
Historical deployments and receipts must remain separate from the new profile.

## Historical baseline before the separate deployment

- The observed desk has **zero open markets** and five historical series.
- The deployed core has **eight lifetime series slots**, with fixed-size account
  positions. Five slots are used. Increasing a constant on this funded deployment
  is not a migration and does not support a replenishing ten-market ladder.
- Existing series use `native-sampled-v1`. Their settlement terms cannot change.
  The current core binds its oracle account/version at construction.
- New series are intended to use the accepted **30-minute pre-expiry NEAR/USD
  TWAP**, with native NEAR payouts. The historical worker and isolated resolver
  have implementation evidence; their complete public integration is unfinished.
- Real owner storage/deposit, P purchase, P redemption and withdrawal have
  receipts under the old profile. This is not acceptance of the new deployment
  or the current Next.js transaction UI. The owner's N purchase is still open.
- FASTNEAR supplies additive discovery; the project still runs the canonical
  receipt reconciler, PostgreSQL database and API. Fully hosted indexing has not
  been achieved. Sustained freshness remains unaccepted.

Sources: [public acceptance](ACCEPTANCE_RUN_2026-11-11.md),
[listing planner](../services/markets/README.md),
[expiry worker/resolver](../research/reports/ORC04_HISTORICAL_WORKER.md),
[FASTNEAR evidence](../research/reports/INF02_NEARDATA.md).

## Resume order and acceptance checklist

All items require implementation-agent checks plus independent review; the
independent reviewer is **unassigned/pending**, not implicitly signed off.
New financial/storage behavior requires SPEC revision before implementation.

### 1. Compatible core and deployment design — MKT-05 / CORE

- [ ] Specify and implement scalable market/position storage for ten simultaneous
  markets and subsequent cohorts, including storage charging, pagination and
  compatibility with the SDK, indexer and account snapshots.
- [ ] Prepare a separate compatible core/resolver deployment and an explicit
  account/exit migration or coexistence plan. Preserve old claims and exits;
  do not rewrite historical terms or reuse their slots unsafely.
- [ ] Validate the new oracle-profile binding and deployment configuration.

Dependencies: frozen SPEC, current custody/storage invariants, ORC-04 interface.
Invariant: collateral, storage and operating funds stay separate; old holdings
remain recoverable. Failure: insufficient storage/capacity or incompatible state
blocks activation. Acceptance: locked tests, shared vectors, schema checks,
compiled-Wasm storage/exit tests and actual deployment/configuration receipts.

### 2. Finish expiry-price integration — ORC-04

- [ ] Wire the historical worker/resolver into the collector/keeper, new core,
  metadata and operational receipt journal. Retain authenticated raw evidence,
  request/response hashes and deterministic replay.
- [ ] Validate real availability under the resolver's current **three-page /
  3,000-trade / 500,000-byte** callback bounds and its gas budget.
- [ ] Define and test oversized-history, missing-history, provider-outage,
  callback-failure and uncertain-request recovery; do not truncate evidence to
  make it pass. Confirm sponsor funding and refund behavior in the live flow.
- [ ] Verify the complete public registration → request → authenticated callback
  → finalization → core import path for the new profile.

Dependencies: item 1, pinned worker/source/window and actual external data.
Invariant: settlement selection is deterministic; late execution cannot select
another price. Failure: incomplete/ambiguous evidence delays resolution; UNKNOWN
requests do not become retry/refund permission through timeouts. Acceptance:
real archived evidence, independent arithmetic replay, final receipts and failure
checks. Two historical worker runs and Sandbox tests alone do not close this.

### 3. Match maker pricing to settlement — MKT-04

- [ ] Implement and validate valuation for the actual arithmetic TWAP payout,
  including any already-observed part of the averaging window.
- [ ] Connect authenticated market inputs, freshness rules, inventory, fees and
  signed quote expiry to both maker services for the new series/profile.
- [ ] Verify the terminal's indicative calculations and executable quote fields
  use the intended profile and units; model estimates remain distinct from bids.

Dependencies: frozen payout/window policy in item 2, exact payoff reference.
Invariant: no old terminal-price model silently prices the new TWAP profile;
no fixed 50/50 or fixture marks in public operation. Failure: unsupported profile
or missing/stale market inputs returns no quote. Acceptance: payoff/model checks,
recorded real inputs, funded signed offers and actual successful/rejected fills.

### 4. Activate and replenish the market ladder — MKT-05

- [ ] Turn the read-only planner into an idempotent provisioner with persisted
  cohort seeds, immutable terms, receipt reconciliation and restart recovery.
- [ ] Use the accepted schedule: next daily and next Friday expiry at **08:00
  UTC**, with five strikes at **90/95/100/105/110%** of fresh spot. Retain the
  planner's distinct-date and setup-lead rules.
- [ ] Reconcile on startup, periodically and after settlement; prevent duplicate
  cohorts, accidental repricing and repeated unresolved submissions.
- [ ] Fund actual maker inventory for each market within an explicit operating,
  storage and collateral budget. A registered series alone is not liquidity.
- [ ] Confirm open series, real executable quotes and replenishment after expiry
  in the desk, with linked registration/inventory/fill receipts.

Dependencies: items 1–3 and reconciled indexing from item 5. Invariant: retained
terms and exact funded all-or-nothing execution. Failure: bad source, insufficient
funds/capacity, unsupported profile or UNKNOWN receipt blocks the affected action.
Acceptance: ten genuine markets when prerequisites permit, funded quote/fill
checks, duplicate/restart tests and a real subsequent cohort. Provider outages
can legitimately leave no tradable markets; never manufacture activity.

### 5. Indexing and service reliability — INF-01 / INF-02

- [ ] Add the new core/resolver schema, events and account layout to discovery,
  projection, same-block reconciliation, collector and API responses.
- [ ] Measure sustained freshness during quotes, fills, settlement, redemptions
  and withdrawals. Fix recurring lag rather than relaxing financial gates.
- [ ] Exercise FASTNEAR catch-up, 429 cooldown and restart with a genuinely
  unjournaled public operation. Selected historical parity is not continuous
  coverage or sole-source acceptance.
- [ ] Complete repeatable restart/ownership-lock recovery without deleting
  journals or assuming that unresolved operations failed.

Dependencies: retained receipt baseline, item 1/2 schemas, available RPC/feed.
Invariant: hints are discovery only; complete finalized receipts and monetary
reconciliation determine state. Failure: preserve the cursor, journal and
quarantined operations; block affected new risk. Acceptance: timestamped
sustained-load/catch-up measurements, outside-operation discovery, parity and
restart evidence. A single healthy checkpoint does not close this item.

Hosted replacement is an **optional follow-up**, not a prerequisite to keep
using FASTNEAR plus the reconciler. OnFinality/SubQuery startup was blocked by
the tested runner's mainnet-genesis lookup on testnet. Resume only with verified
native-testnet support, same-block parity and restart/freshness acceptance.
[Hosted assessment](HOSTED_INDEXER.md).

### 6. Current frontend + real wallet end-to-end acceptance — APP-02 / G9

- [ ] Complete owner N purchase on a new open series; do not retry expired eta.
- [ ] Verify current Next.js flows against the chosen new deployment: register,
  deposit, split, transfer, buy both legs, sell, merge eligible matched pairs,
  settle/import, redeem both legs and withdraw with final receipt/ticket checks.
- [ ] Exercise actual wallet connect/reject/account-switch/disconnect behavior,
  expired/unavailable offers and recovery after an interrupted wallet response.
- [ ] Verify restart preserves holdings, events and unresolved operations; UNKNOWN
  is quarantined, not rendered as a confirmed failure inviting resubmission.
- [ ] Verify the new delayed-series merge UI with a connected wallet and actual
  matched holdings. Opening a wallet picker does not prove execution.

Dependencies: items 1–5, user wallet signatures and real funded liquidity.
Invariant: receipt completion, not optimistic UI, establishes success. Failure:
failed/unknown outcomes have distinct recovery paths and never auto-resend.
Acceptance: wallet transaction hashes, FINAL receipt trees, exact ledger/ticket
changes and recorded browser walkthrough. Old service-account receipts and
unauthenticated browser checks do not substitute for this acceptance.

### 7. Release, hosting and independent review — SEC-02 / REL-01 / REL-02

- [ ] Independently review the final core/oracle, pricing, custody, recovery and
  security changes and resolve findings; retain reviewer identity/evidence.
- [ ] Rerun the release rehearsal on the actual candidate: reference/vector,
  locked Rust, format/Clippy, schema and relevant compiled-Wasm/browser checks;
  reproduce deployment/configuration and recovery from a fresh checkout.
- [x] Configure the user-authorized public testnet frontend and persistent backend:
  Vercel + Railway are live. Actual encrypted state restore and hosted access
  boundaries pass. The laptop expiry runtime is stopped; Railway is the only writer.
  User reports final-origin sign-in completed. See [DEPLOYMENT](DEPLOYMENT.md).
- [ ] Complete final-host sustained ten-user quote/receipt load and operational
  backup/restart acceptance. Ten concurrent signed-session reads across three
  project accounts passed; this does not close execution capacity acceptance.
- [ ] Recheck wallet execution from the public origin and finish the reproducible
  release evidence, walkthrough and submission materials.

Dependencies: items 1–6 and hosting choice when resumed. Invariant: deployed
candidate matches reviewed artifacts and production stays disabled. Failure:
missing evidence/review blocks the corresponding release claim. Acceptance:
review records, reproducible build/rehearsal, deployment links and public-origin
receipts; neither UI polish nor a published frontend closes backend readiness.

## Deliberately separate from the options-first release

- **Tracking vault:** stays disabled. Strategy selection failed its economic
  gates; research, approved policy and later vault/keeper acceptance are separate.
- **Standard wallet tokens:** P/N remain an internal ledger. Complete interfaces,
  callbacks and conformance are required before claiming token-standard support.
- **Independent liquidity:** current makers are project-operated. Recruiting
  independent makers is not completed by deploying two project processes.
- **Automated intent selection/rolling:** not activated. Requires tested quote
  quality, explicit costs, supported atomic roll semantics and wallet acceptance.
  Batched first-deposit/storage is now implemented and locally verified; a first-time
  external-wallet approval remains unverified. Existing registered accounts use a normal deposit. [Retail-flow limits](../research/reports/APP02_RETAIL_FLOW.md).
- **G10 production / G11 expansions:** separate from hackathon G9; not silently
  added to the immediate backlog or declared complete by finishing the demo.

## Resuming

Start with items 1–3 and item 5's schema integration; then activate the ladder,
prove the wallet lifecycle and finish the release. Link evidence here and update
STATUS/BACKLOG as each checkbox closes. No new deployment, funding or transaction
was performed to write this checklist. Independent review remains pending.

## 13 November renewal and quote-reliability follow-up

Renewal implementation and interrupted-restart/duplicate tests now pass locally;
a subsequent public cohort is still required to close item 4. Ten distinct Sandbox
accounts completed the monetary lifecycle with exact reconciliation. Ten concurrent
public sessions for one account received real signed offers from both makers after
RPC read-sharing/failover fixes; this is not ten distinct funded public users.
See [updated backend evidence](../research/reports/BACKEND_RESUME_2026-11-13.md)
and `research/reports/backend-public-concurrency.json`. The earlier failed burst
is preserved as `backend-public-concurrency-before-read-sharing.json`.

A real, separately labelled acceptance series has a complete future 30-minute
window and funded service-owned claims. Callback/import/redemption remain pending;
registration must not close ORC-04. Owner wallet fills remain pending. The checklist
above tracks combined acceptance and independent review, not only implementation.


Owner P purchase verified (13 November 2026): 0.01 Capped value at K $3.536; FINAL receipt and exact balance reconciliation in `research/reports/owner-capped-buy-confirmed.json`. Both P/N purchases now have owner-wallet evidence. P sell and new-profile settlement/redemption remain pending; independent review pending. See STATUS, “Owner Capped value purchase”.


13 November follow-up: owner P sale is now FINAL and reconciled in `research/reports/owner-capped-sell-confirmed.json`; both owner P/N buy and sell flows are verified. Review trade now fetches a fresh offer and opens exact review in one action. Scheduler skips unnecessary maker pauses while settlement reports an unresolved signer; it does not clear that unresolved transaction. Current-profile settlement/redemption, later public renewal, first-time combined deposit wallet acceptance and independent review remain open. See STATUS, “Capped value sale and combined trade review”.


Service attention follow-up (13 November): idle maker checks are now active and verified without issuing quotes. Four RPCs still report the retained settlement request as unknown; finalized resolver state is NOT_REQUESTED. Quarantine and renewal block remain. FASTNEAR audit remains behind at the observed free quota; no coverage reset is permitted. Evidence and exact closure requirements: STATUS, “Service attention investigation”, and `research/reports/service-attention-investigation.json`.


## Public hosting checkpoint — 14 November 2026

Vercel/Railway cutover and encrypted exact-state restoration passed. Owner reports
hosted sign-in completed; existing balance survives migration. Ten signed read
sessions across three project accounts passed isolation/logout checks. This is
not ten-user execution acceptance. [Evidence](../research/reports/public-hosting-2026-11-14.json).

**Next blocker:** both makers hold matched 0.1 P/N pairs in five expired unresolved
daily markets. Coinbase's exact validator passes from Railway, but valuation
refuses unresolved maturity, so even weekly RFQs return no offers. Resolve the
settlement quarantine or use a separately verified, journaled maker-inventory
cleanup path under the single-writer guard. Never drop positions from equity,
substitute a terminal price, remove UNKNOWN records or resend on timeout. Public
monetary tests must wait for real funded offers. The root settlement request and
renewal gate are preserved; automatic successful renewal is not claimed.

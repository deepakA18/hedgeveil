# Backend resume — 13 November 2026

Status: separate public deployment, initial funded ladder, verified offers and Next.js cutover confirmed; wallet trading acceptance pending. Independent
contracts, oracle, economics and infrastructure review remains unassigned/pending.
Public funding and all 54 setup operations are confirmed. New live trading
and full lifecycle acceptance remain pending.

## Delivered and verified locally

- Separate clearinghouse layout 2: 32 retained markets, 16 accounts, bounded
  pagination, immutable empty-market archive and safe reuse of zeroed slots.
  Existing eight-slot deployments must not be upgraded in place.
- Resolver layout 2: 32 retained cases and immutable finalized-case archive.
  Indexer validates archived evidence at the same finalized block as core state.
- Full-capacity payout/import callbacks now reserve 120 Tgas; event deltas retain
  ordering while avoiding an extra full ledger-map clone.
- Receipt-journaled expiry keeper: pinned external worker/source/contracts,
  one automatic request per series, finalization and import. UNKNOWN operations
  stop the signer; rejected evidence requires review, never automatic paid retry.
- Arithmetic-TWAP maker candidate under the NEAR numeraire. Moment matching and
  continuous averaging are explicit approximations; fees, funded inventory and
  complementary exact units remain enforced. Trading closes at window start
  because partially observed-window valuation is not implemented.
- SDK, indexer, backend quote gate and Next indicative marks support the new
  profile. This is not evidence that the current browser has traded it.
- Separate deployment provisioner retains immutable cohort seeds, creates the
  accepted daily/Friday 08:00 UTC ten-market ladder, and funds both makers.
  Restart checks prevent duplicate funds, splits and repricing.

## Evidence

| Check | Recorded result |
|---|---|
| [Capacity and archival Sandbox](mkt05-capacity-sandbox.json) | 18 checks, 223 transactions |
| [Full-capacity G3 regression](mkt05-g3-regression.json) | 30 checks, 800 transactions, 812 events |
| [Resolver, keeper and indexer Sandbox](orc04-layout2-indexer-sandbox.json) | 22 checks, 95 transactions |
| [Actual deployment/listing Sandbox](mkt05-expiry-deployment-sandbox.json) | 6 checks, 54 transactions, ten markets with funded inventory |
| JS SDK/indexer/oracle/market/funding/marks checks | 138 passed in the combined run; subsequently added global-UNKNOWN, expiry-funding and two runtime binding/halting cases passed |
| Schemas | 16 tests; generated schema checks passed |
| Rust | Locked root tests, format and Clippy; contracts Wasm Clippy passed |
| Frontend | Typecheck passed after new-profile marks adapter |

Sandbox observations/source responses are explicitly test fixtures. They prove
contract and integration behavior, not public source availability. Existing real
Outlayer runs remain in [ORC04_HISTORICAL_WORKER](ORC04_HISTORICAL_WORKER.md).

## Funding and coexistence

The reviewed transfer is 32 **test NEAR** to a fresh service administrator:
21 funds the new core account, 6 the resolver and 1.5 each of two new makers.
The remaining 2 NEAR funds setup fees and gas. The fresh-account Sandbox rehearsal
left 0.5000536986495379 service NEAR from that initial 2 after setup. Each maker
starts with 1.1 collateral, splits 0.1 for each of ten markets and retains 0.1 free.
This is limited inventory and an initial-cohort budget, not indefinite operations.
Old contracts, reserves, user claims and exits stay separate. No owner access key
is requested. The owner must sign the exact transfer after reviewing the plan.

Public preparation found two unresolved historical service-registration attempts
(`oracle-series-epsilon` and `oracle-series-zeta`) with retained
`NotEnoughBalanceError` observations. RPC still returns unknown transactions;
this is not final failure evidence. They remain quarantined without deletion or
resend. The prepared replacement uses a new signer, leaves the old service's
2.1687699431039259 NEAR untouched, and increases the owner transfer from the
initial 30-NEAR estimate to 32. The owner subsequently signed the exact 32-NEAR transfer. Finalized matching
receipts verified transaction `6qZksiqsSUczSuxQ1M2zL9xyWBm2XiCtkshPqetdZNZv`.
Public deployment completed with 54 successful operations; [actual transaction records](mkt05-testnet-setup.json) retain the hashes, code pins and immutable terms. Ten markets cover 14 November and 20 November at 08:00 UTC. Initial strikes use the retained real Coinbase observation of $3.536.
The public plan is [expiry-plan.json](../../deploy/testnet/expiry-plan.json).
The local review page at port 8795 was verified to expose exactly one 32-NEAR
Transfer action, with no AddKey and no prior handoff at the time of inspection. Browser-host access was
unavailable; this check inspected the served HTML, bundle and public plan API.

## Still open

1. Complete required full-block discovery catch-up and same-block reconciliation before enabling new risk. The new desk is at port 8796; the legacy exit desk remains at 8794. The actual free-feed response states 30 blocks/minute, below chain growth; continuous catch-up is blocked at this quota. Both desks now have configurable pacing (legacy 15000 ms, new 2500 ms). The user subsequently approved receipt/journal discovery with strict same-block reconciliation and additive full-block auditing. Configuration now uses `discovery_required: false`; no continuous-discovery claim is made. Initial restarts required operator removal of confirmed-dead locks; a subsequent coordinated-shutdown fix passed an actual PostgreSQL SIGTERM test exceeding five seconds and a real new-desk drain that released its lock automatically. Broader unattended restart acceptance remains pending.
2. Complete periodic/after-settlement ladder renewal, inventory recycling and
   budget/capacity exhaustion tests. Initial listing is not renewal acceptance.
3. Authenticate live bounded historical responses and complete the new public
   request/callback/finalize/import/redemption lifecycle, including failure cases.
4. Complete real maker fills, sustained indexer freshness, outside-journal discovery and restart acceptance. Both makers already returned verified P/N offers; raw model inputs are retained.
5. Complete wallet deposit, N/P buys, sell, merge, claim and withdrawal from the current UI. Next.js now connects to port 8796; old exits remain at 8794. Owner account setup is confirmed.
6. Independent review, updated release rehearsal, public hosting and demo video.

## Dependencies and failure rules

Dependencies: FIN-01 units/payoff, CORE custody, ORC-04 immutable evidence policy,
MKT-04 pricing, INF replay/reconciliation and APP wallet receipts. Invariant:
collateral and operating/storage funds remain separate; no price/receipt fixtures
in public operation; no implicit migration; UNKNOWN stays quarantined. Failure:
unavailable source, incompatible code, insufficient funds/capacity or unresolved
receipt blocks the affected action. Acceptance requires final public receipts,
source replay, sustained service measurements and independent review.

## Model references

The implementation uses the stock-numeraire drift adjustment and an approximation
to arithmetic-average moments; it does not claim an exact arithmetic Asian price.
[Stock-numeraire treatment](https://library.nexteinstein.org/wp-content/uploads/2022/04/qondisa.pdf)
and [arithmetic-average moment approximations](https://griselda.deelstra.web.ulb.be/DDV2.pdf)
provide mathematical context. Tests independently simulate antithetic GBM paths
locally, including complement, monotonicity, zero-volatility and window boundaries.

## Live infrastructure findings

- Both free RPCs pruned the legacy deployment anchor. Reusing its original retained, hash-pinned RPC response restores startup; live chain identity and current reconciliation remain mandatory. The old desk returned RECONCILED without deleting receipts or quarantined historical operations.
- Removed the deprecated archival endpoint from the local legacy indexer; routine reads use Intear first with FASTNEAR fallback.
- A bounded real feed probe returned HTTP 429 and `{"error": "rate-limit exceeded of 30 blocks per minute", "message": "Please get a plan from https://fastnear.com for higher rate limits"}`. The repository’s documented 180 requests/minute is not the observed full-block quota. No rate-limit bypass or fabricated coverage is used.
- The database dependency’s exit hook raced the service drain. Coordinated shutdown now drains work before stopping PostgreSQL; forced exits still leave the ownership lock. Tests verify the database remains usable after six seconds of drain and terminates once.

## Live quote, frontend and RPC review follow-up

- [Real P/N offers](mkt05-live-quotes.json) include both funded makers, verified signatures and request-bound exact quantities. [Retained Coinbase inputs](mkt05-market-inputs.json) replay to the captured model inputs. Offers are historical evidence, not currently executable prices.
- [Next.js offer check](mkt05-frontend-quote.json) verified two real N offers through the frontend bridge. Production webpack build/typecheck passed and the active frontend uses the separate new deployment. No visual or wallet-fill acceptance is inferred from HTTP checks.
- [Paced reconciliation observation](mkt05-reconciliation-paced.json) recorded 19 healthy samples over approximately three minutes, with one wallet balance-read RPC failure. This is a bounded observation, not sustained-uptime acceptance. Prior unsuccessful observations are retained.
- Indexer queries now deduplicate exact same-block reads within a batch only. New requests are paced at 1000 ms, legacy synchronization at 60000 ms, and full-block discovery remains additive. No stale threshold or receipt/accounting invariant was relaxed.
- Wallet reads now support configured read-only RPC fallback with chain/genesis checks, exact view-block verification and rate-limit cooldown. Broadcasts never fail over or retry. The service was gracefully restarted with journals retained.
- Owner storage setup succeeded: `CyW4SipfAd8XN6FBLeA9Xhkbsc8tvvMmpYexZ2VDecTe`. Two deposit preparations failed before handoff (`attempted: false`, no hash). The [repaired deposit review](mkt05-deposit-review.json) returns no blockers; it does not submit or prove a deposit.
- Preparation RPC failures now use a distinct message saying no wallet transaction was sent. Post-handoff RPC failures still require receipt recovery; UNKNOWN quarantine is unchanged. 27 focused SDK/API tests and the frontend production build/typecheck passed.

Dependencies: SDK identity/receipt verification, wallet journal, INF reconciliation and the configured free RPC providers. Failure path: all reads unavailable still blocks review; mismatched provider identity or view block fails closed. Implementation-agent checks only; independent review remains pending.

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

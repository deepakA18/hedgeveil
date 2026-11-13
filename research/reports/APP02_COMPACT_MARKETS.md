# Compact trade grid and listing assessment — 13 November 2026

## Implemented

The trading workspace uses a bounded 1440px frame, 24px heading, 12px labels,
13px body/data, tabular monospace numbers and right-aligned values. Desktop rows
and controls use approximately 34px heights; touch controls retain 44px targets.
The chart/ticket/history form one bordered grid with 12px panel padding. Set
price and expiry use inline buttons. Same-day expiries include local times to
avoid ambiguous duplicate date labels. Historical terms remain immutable.

Removed Help me choose, placeholder sales copy, sidebar slogan and unit explainer
from the Trade surface. Unit/model explanations remain under How pricing works.
The top status strip is replaced by an accessible corner dot opening status and
refresh controls; failed or older-than-60-second checks cannot display green.
Actual errors and action-specific blockers remain visible at the point of use.

`GET /api/marks` needs no wallet and never requests/signs an RFQ. It reads the
configured backend's public session/state, scopes data to that contract and uses
the existing CoinbaseMarket/marketReference implementation. Supported open legacy
series receive indicative marks from fresh validated bid/ask and 168 historical
hourly returns. Cache/coalescing is 15 seconds; model timestamps expire after 60
seconds and failures produce unavailable values, never fixtures or zero prices.
The browser polls marks every 15 seconds while visible. The source is fixed,
origin checked and no secrets, caller URL, signer or nonce are accepted.

Model marks exclude spread, fees and gas. Model-cost estimates are explicitly
labelled and are not executable offers. A selected signed offer takes priority
for chart cost and exact preview; the signing path is unchanged. The new TWAP
profile still returns MODEL_TWAP_NOT_READY rather than using the old model.

With no open markets, Trade explicitly inspects the most recent registered
historical series instead of a blank brochure. The chart is labelled a scenario;
the ticket and history table show actual recorded final payouts where present.
Unresolved historical rows remain pending, not made-up settlements. No historical
series can request or fill a new trade. Backend/indexer errors still block risk.

## Ladder: concrete policy, not activation

User selected next daily and weekly expiries at 08:00 UTC, with five strikes at
90/95/100/105/110% of fresh spot. Weekly means Friday; if daily coincides, use the
following Friday. The read-only planner in services/markets/ladder.mjs adds one
hour of setup lead, keeps a first-observation seed for each expiry, deterministic
IDs, existing-term conflict checks and capacity/profile blockers. It always
returns PLAN_ONLY and an empty actions list. A production provisioner/event loop
is NOT implemented or enabled.

The root cause cannot be solved by silently adding ten rows:

- Current clearinghouse MAX_SERIES is **8 lifetime series**, with fixed
  `[Position; MAX_SERIES]` serialization and no slot reclamation. Raising the
  constant on a funded account is not a migration and does not solve recurring
  cohorts. Ten simultaneous markets and replenishment require scalable versioned
  market/position storage, priced storage, pagination and migration/exit tests.
- Current core binds one oracle account/version; the retained deployment uses
  native-sampled-v1. New-profile deployment must preserve old exits.
- ORC-04/MKT-04 aligned TWAP valuation, runtime/indexer/collector integration and
  public lifecycle acceptance remain open in the authoritative plan.
- Every new market additionally needs actual funded maker inventory, operating
  funds, authenticated price evidence, idempotent receipt recovery and monitoring.

The eventual provisioner must persist seeds before submission; run at startup,
on settlement and periodically; reconcile existing terms; preserve unknown
operations without resend; and replenish only with accepted profile, capacity,
fresh data and budget. Listing alone cannot guarantee executable liquidity.
Outages must remain fail-closed, even if that leaves zero tradeable markets.

## Evidence and limits

- Optimized Next build, strict TypeScript and formatting pass.
- 18 homepage/workspace checks pass against the retained real backend and public
  spot feed: inline selection, historical marks without a wallet, status keyboard
  focus, no POST on inspection, responsive rendering and offline/foreign-origin
  rejection. No successful browser response was mocked.
- 12 deterministic amount/market/marks/ladder checks pass. Fixtures here are local
  test inputs only. Existing 2,400 exact payout comparisons remain included.
- Screenshots reviewed at 390, 768, 1440 and 2500px. No page overflow; ultrawide
  frame measured 1440px. The history table scrolls within its container on phones.
- Live data shows five retained markets, only eta with recorded final payout.
  No claim is made that the other four are settled or that any is currently open.
- No new contract, market, collateral transfer, quote or wallet signature was sent.
  The public model branch needs a genuinely open supported market for live
  acceptance; TWAP listing/quotes and fresh owner execution remain pending.

Dependencies: APP-02, existing SDK/indexer/public source; ladder activation also
ORC-04/MKT-04 and a compatible versioned core. Invariant: no payoff, custody,
settlement, oracle allowlist or exact intent change. Failure: missing inputs
remain unavailable, historical markets cannot trade, and insufficient capacity
or unresolved profile acceptance stops provisioning.

Reviewer: implementation-agent self-review. Independent product, financial,
contracts and security reviews remain pending. This does not close G9.

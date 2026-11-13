# APP-02 retail flow improvements — 12 November 2026

Implementation-agent self-review. Independent product, accessibility and security
review remain pending. This increment implements the first four UI priorities
and explicit intent choices; it does not claim live execution acceptance or
activation of automated selection/rolling.

## Delivered

- Primary navigation: Trade, Portfolio, Activity. Market history, funding and
  pricing/maker tools remain reachable. Unshipped vault is absent from navigation.
  One Connect wallet action lives in the shared header.
- Markets defaults to Open now; History contains past series. Trade no longer
  silently defaults to an expired series. An explicit historical deep link is
  still inspectable, labelled historical, and cannot request a new trade.
- Names show NEAR, set price, relative expiry and local date/time; exact strikes
  remain visible and UTC is available on hover. Internal IDs remain in evidence.
- NEAR upside / Capped NEAR value are explicit user choices. They do not select
  a supposedly safe strike, advertise a dollar peg, auto-buy or hide expiry.
  Choice/series/direction persist in the URL without reinitializing the wallet.
- Real Coinbase Exchange NEAR/USD spot appears with source and observation time.
  The source is indicative and distinct from the series resolver. Its age never
  changes contract finalization or the indexer's permission to add risk.
- Trade has an SVG USD/NEAR scenario chart, price ticks, set-price/spot markers,
  scenario slider and quantity-scaled payout. A selected, unexpired BUY offer
  supplies actual cost and fee for scenario P&L; no fixture premium is inserted.
- Quote summaries show exact cost/proceeds and quantity, fee-inclusive maximum
  purchase loss (plus gas), NEAR and USD payout bounds, approximate USD breakeven,
  intrinsic comparison and offer expiry countdown. Original signed assets and
  maker terms remain expandable; signing still uses the unchanged exact intent.
- Portfolio claim buttons open review with the held amount directly. Funding is
  linked from Portfolio. Pair creation/merging is under Advanced, with eligible
  series and action-specific blockers. A single claim has no guaranteed merge
  exit; equal matching claims are required and finalized series cannot merge.
- Funds has two primary balance summaries, indicative USD equivalents, account
  setup followed by deposit, conservative Max deposit, Max available withdrawal,
  default destination locked to the connected account and explicit alternate
  destination controls. Storage accounting is under Advanced, not spendable funds.
  Pending/unknown withdrawal tickets or attempts block another withdrawal.
- Activity uses consistent human-readable statuses, quantities and validated
  explorer links. Recovery and ticket cleanup are under Advanced. A bounded loop
  verifies one unresolved attempted operation every 15 seconds while visible,
  pausing during review/signing. It invokes receipt recovery only, never handoff,
  wallet signing or transaction resubmission. Absent historical timestamps are not
  invented as relative transaction ages.

## Price source and failure policy

The fixed HTTPS endpoint is
`https://api.exchange.coinbase.com/products/NEAR-USD/ticker`, documented in
[Coinbase's ticker API](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker).
The endpoint reports the last trade, not the option settlement value or a firm
bid/ask for converting a payout. No API/payment key is needed.

`/api/spot` uses the existing loopback-origin guard. Requests cannot choose the
upstream URL. The server validates positive bounded decimal prices and source
time, rejects observations older than 120 seconds or over 5 seconds in the
future, uses a 7-second timeout, coalesces concurrent requests and caches good
observations for 15 seconds. Failed attempts have a 5-second retry cooldown.
The browser polls every 30 seconds while visible and independently checks age.
Failure/staleness removes spot/derived USD estimates; it never becomes zero or
an invented value. Scenario reference prices remain explicitly user-selected
hypotheses, not market evidence. No settlement or maker input was replaced.

## Display arithmetic

`Q=10^24`, price scale `10^12`. Scenario calculations use BigInt and the existing
coefficient rounding: `p=Q` below the strike, otherwise `floor(K*Q/X)`; `n=Q-p`;
claim payout is `floor(quantity*coefficient/Q)`. Only SVG coordinates use Number.
The zero-price scenario has P=quantity NEAR and N=0, both worth zero USD.

USD scenario value is the NEAR payout multiplied by the scenario reference.
For BUY offers, USD P&L subtracts the fee-inclusive NEAR cost valued at current
indicative spot. NEAR P&L subtracts that same native cost directly. These are
different numeraires; current-spot USD cost is not historical entry accounting
and not guaranteed liquidation proceeds. Gas is excluded from the estimate.

Approximate USD breakeven uses current-spot cost per unit: N adds it to K;
P can reach it only if it does not exceed K. Atomic rounding can shift the exact
threshold. Native and USD payout caps differ: P is capped at K USD/unit at the
reference, while N has no fixed USD cap; both are bounded by backing in NEAR.
Intrinsic comparison excludes the fee and is not a fair-value recommendation.

Max deposit subtracts the wallet storage reserve and twice the current gas price
for the SDK's existing 250 TGas budget. Missing reserve data disables this shortcut.
The backend still refreshes/revalidates balance and gas in final review; the UI
estimate cannot bypass that check.

## Evidence

- Optimized Next.js build, strict TypeScript and formatting checks pass.
- Final preview restarted with the completed build; post-build Chromium checks
  at 390px and 768px passed without horizontal overflow or page errors. Both
  screenshots were visually inspected, including header and chart labels.
- 30 deterministic amount/market/bridge/wallet-boundary checks pass, including
  2,400 scenario comparisons with the existing payoff reference, zero-price
  behavior, fee treatment, capped breakeven reachability, storage/gas reserves,
  unresolved withdrawals, stale/future/malformed spot and cache/failure behavior.
- 17 homepage/workspace browser checks pass using actual retained backend data
  and the actual Coinbase endpoint. All seven routes were checked at 375, 768
  and 1440 px. Tests cover URL selection/reload, chart controls, native dialogs,
  real source labels, unknown price failure, offline backend failure and origin
  rejection. Failure injection only aborts requests; no live success is mocked.
- A real frontend spot response was observed with price `3408600000000` and
  source time `2026-11-12T18:05:38.912473328Z` (an observation, not a current quote).
- Desktop/tablet/mobile trade renders were inspected. The layout inspector
  reported zero failures/warnings at 1440, 768 and 390 px after spacing fixes.
  Screenshots are transient under `/tmp/hv-retail-final`, not release evidence.
- User wallet connection/signing was not performed in these automated checks.
  Connected-account visual acceptance, live quote-card execution, automatic
  recovery against a new real wallet attempt and real payout flows remain pending.
  No contract/schema change was made, so Rust/Wasm/schema suites were not repeated.

## Priority 5 and execution gates

Explicit intent selection is implemented. Automatic strike selection, exposure
recommendations, automatic rolls and batched first funding are NOT activated.

Dependencies: APP-02 React acceptance; real open-series liquidity; ORC-04 matching
maker valuation, collector/indexer integration and public lifecycle acceptance;
existing exact SDK custody and receipt invariants. These dependencies remain
unfulfilled in the authoritative plan. Retained series keep their old terms.

Before a roll ships:
1. Demonstrate new-interface funding, BUY/SELL, settlement, claim and withdrawal
   with real signatures, matching finalized receipts and restart recovery.
2. Define selection criteria from executable offers, expiry and costs; do not
   treat `K < spot/2` or `spot < 1.5*K` as validated safety thresholds.
3. Extend maker/request support for a funded atomic cross-series basket if feasible.
   The contract supports basket quotes, but the current UI/worker request is a
   single-asset quote; two independent fills are not an atomic roll.
4. Display exact old/new quantities, total fee/net collateral change, offer expiry
   and scenario exposure. Require user review and a strict execution bound.
5. Verify cancellation, missing liquidity, price changes, account switch, wallet
   rejection, unknown receipts and insufficient assets. No timeout permits resend.

Funding batching similarly needs explicit multi-action intent, journal, receipt
and wallet acceptance. It is not implemented by concealing two signatures behind
one button. Current guidance explicitly describes two separate approvals.

Invariant: display/selection changes never alter payoff, custody, settlement
source, signed quantities or receipt-based success. Production and vault remain
disabled. Independent review and G9 completion are not claimed.


## Trade layout refinement — 13 November 2026

The accepted chart-and-ticket direction is now implemented in React. Exposure,
set price and actual expiry choices share a top control strip. Up to three
expiry choices use buttons; larger sets use a select. Strikes are ordered
numerically; choosing an expiry retains the strike when available, otherwise
selects an explicitly displayed registered market. No nonexistent series is
invented. The real spot, selected strike and end date remain visible together.

On desktop/tablet the outcome chart sits beside the quantity/cost panel and
review controls. On phones the order is selection, quantity/cost, chart, review.
The chart adds a restrained lime payout area. A valid selected offer immediately
supplies the chart cost and the same offer's prominent cost, maximum purchase
loss and approximate breakeven. The first unexpired returned offer is initially
selected, without a best-price claim; the user can select another offer. Expiry
removes cost estimates and blocks review. A response fingerprint prevents an
old account, amount or market's offers from appearing during selection changes.
The unchanged backend preview remains authoritative before wallet signing.

“Help me choose” is optional, keyboard accessible, closes with Escape and restores
focus. It selects exposure only, preserving the market for explicit review, and
never requests quotes or sends transactions. Its capped-value copy makes no
dollar-peg promise. Selling is entered from existing Portfolio positions; the
sale view retains the same exact fill/review flow and a switch back to buying.
Payout limits, intrinsic comparison, exact legs and maker terms are expandable.

Validation: optimized build and TypeScript pass; 18 homepage/workspace browser
checks pass against the retained real service, including help/focus/URL/mobile
order and no POST during guidance. Nine amount/market checks pass, including the
2,400 exact scenario comparisons. Desktop 1440px, tablet 768px and phone 390px
screenshots were visually reviewed. No successful API response, market, wallet,
quote or receipt was mocked. Retained markets are expired, so screenshots use
explicitly marked historical eta data and new-trade controls remain disabled.
Live selected-offer execution and connected-wallet acceptance remain pending.

Dependencies: APP-02 retail workspace and unchanged SDK/backend; live acceptance
also needs genuine open-series liquidity and the existing settlement gates.
Invariant: no payoff, custody, settlement or signed-intent change. Failure paths:
missing/stale spot removes estimates, expired/mismatched offers cannot supply
current cost, and unavailable market/health/account data prevents new trades.
Reviewer: implementation-agent self-review; independent review pending.

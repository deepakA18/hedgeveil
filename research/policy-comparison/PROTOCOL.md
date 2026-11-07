# G2 experiment protocol v1

Frozen before running results, 7 November 2026. FIN-02 depends on FIN-01; invariant:
funded execution conserves native collateral and claim supplies, while performance
is measured separately. Failure paths include rejected quotes, locked settlement,
capital exhaustion and target losses. Reviewer: independent quant/economics,
pending. No production recommendation or policy approval follows from this run.

## Experiment and selection

Use 84 daily steps, generated synthetic prices initially 2 USD/NEAR. Train seeds
101/202 and held-out seeds 1001/2002 are disjoint. Configurations: strike/entry spot
0.25, 0.40, 0.60; hold-to-settlement at 4/7/14/30/60 days; scheduled short rolls at
4/7/14 days; long rolls at 30/60 days; hybrid at 4/7/14/30/60 days. Initial wealth
100/1000/10000 USD tests finite capacity without scaling maker capital.

Select a research candidate per size using **training normal paths only**: eligible
candidates require annualized explicit friction <=2% of initial wealth and >=95%
roll-window completion, with initial acquisition successful and at least one roll.
Choose lowest mean daily target-return tracking volatility, then lowest absolute
terminal target error, then configuration ID. Hold-to-settlement is a comparator,
not eligible for a rolling-policy selection. If no candidate passes, publish none.
Evaluate all configurations on held-out seeds without retuning. These thresholds
are research screening rules, not approved product risk limits. Seed holdout from
the same generator is not historical out-of-sample market evidence.

## Pricing and units

Keep all ledger balances in integer yoctoNEAR (Q=10^24), prices at 10^12 USD/NEAR,
and redemption through the existing reference coefficients/redeem functions.
Use zero-dividend Black–Scholes call valuation as a diagnostic: N_USD=call and
P_USD=spot-call, with risk-free rate 3% and quoted volatility 80%. An independent
binomial expectation checks selected prices and rate/volatility/maturity
sensitivities. Floating point is confined to path generation, model estimates and
statistics; convert model prices to integer quote ratios before any balance move.
No model mark is a claim of an executable fair price. At/after observation, value
unresolved claims using the fixed maturity coefficient times current spot; an
unavailable observation uses an explicitly uncertain diagnostic mark only.

Paths include normal/high volatility/jumps, 30/50/80% crash, slow decline,
V recovery, prolonged source outage, 1/7/14-day finality delays, no bids, one-maker
concentration, maker withdrawal, source disagreement and permanent resolution
loss. Outages/stale references/disagreement stop quoting; actual observation
prices stay fixed even if finalization is later. Market conditions are exogenous
disclosed synthetic inputs, not estimated probabilities or real oracle records.

## Funded execution and makers

Two makers start with 1000 NEAR each, separately from user collateral. No top-ups,
borrowing, hidden external hedge or external N buyer. Makers split their own
native collateral to supply P and retain N; they may merge matched inventory and
redeem only after finality. This intentionally exposes warehouse risk and limited
demand for N rather than assuming a buyer. Each quote has a 200-NEAR gross-notional
limit, 1-day TTL, 50% equity-loss stop relative to initial NEAR capital and 25%
inventory skew factor. Half-spreads are 15/25 bps before skew and scenario stress.
Quote competition selects maximum funded P output, with deterministic maker ties.
Quotes fill within the same daily step; expiry and funding are checked, but this
does not model network latency or intraday order flow. The research engine retains
historical series beyond G3's eight lifetime slots; it is not a deployable vault.

One user portfolio holds cash and at most one P series. Keep 2% of investable
native wealth as a cash buffer. Initial acquisition and old-P/new-P exchanges are
all-or-nothing. A roll sells all old P to one maker and buys new P in one atomic
integer-ledger transition; a maker must fund new pair backing after incoming
cash and before receiving the user's old P. Refuse insufficient cash, depth,
expired quote, stale reference, unavailable maker, excessive spread or unresolved
old claims. No partial fill, implicit credit or invented receipt. Maximum quoted
half-spread is 500 bps. Rejections preserve holdings and say ROLL_DEFERRED.

Fees: 5 bps on gross old/new quote consideration, 0.0001 NEAR per attempted
acquisition/roll as simulated gas, 0.001 NEAR per created series as simulated
oracle service cost. Charge only from free user cash; no claim liquidation to pay
operations. Model fees/gas/oracle sinks remain in conservation accounting. User
pays all these costs; no operating subsidy or maker capital replenishment.
Initial maker seed capital is disclosed risk capital, not revenue. Report its
opportunity cost at 5% annually separately from native inventory P/L.
Also report the unfunded shortfall to that maker return hurdle; this is a
hypothetical support requirement, not an actual subsidy or top-up.

Hold buys once, waits for resolution, then retains native cash. Scheduled rolls
start two days before maturity. Hybrid also triggers at a 20% spot move from last
entry, rearms within 10%, and has a 3-day cooldown. A requested roll has a two-day
execution window capped at maturity; failed windows remain in the denominator.
After resolution, rolling policies can request reinvestment. Source loss cannot
force cash settlement; in-kind ownership remains available. These are research
policies, not implemented vault shares or a keeper.

## Benchmarks and outputs

All benchmarks begin at the same USD wealth: hold NEAR; ideal constant USD (only a
measurement baseline); and a separate collateralized-debt borrower account. Debt
locks initial NEAR, borrows 50% of initial USD value into external stable cash,
accrues debt interest daily at 5%/365 (compounding), liquidates at 75% LTV using a 2-day
lagged oracle, sells collateral at actual current spot with a 5% liquidation
penalty, and reports lender bad debt if proceeds cannot repay. Stable cash and
lender capital are external assumptions; no stable depeg, funding run or repeated
releveraging is modeled. Debt is not a component of Hedgeveil.

Report terminal target-relative return, daily relative-return tracking volatility
(annualized sqrt(365)), drawdown, sample frequency/severity of terminal target
shortfall, worst 5% terminal losses, unresolved exposure and duration, separate
fee/spread/gas/oracle costs, roll model-value changes, unit model-price ratios and
target-notional changes, attempt rejection reasons,
window completion and time to fill, maker concentration/P&L/capital lock-up and
opportunity cost. Shortfall frequencies describe this synthetic sample, not market
probabilities. Annual friction is a linear 365/84 extrapolation, not a forecast.

At each day probe a full-portfolio cash exit without mutating state: include
funded maker bids, depth, fees and gas; absent liquidity returns unavailable, not
zero dollars. Report unavailable-day fraction and worst available value. In-kind
exit returns exact cash/claim ownership; its reported USD value is an uncertain
mark, not guaranteed cash. Include all three trade sizes and failed bootstrap
cases, which remain native cash rather than being dropped from statistics.

Conservation checks run after every step: free cash + unredeemed series reserves
+ explicit fee/cost sinks equals initial user and maker funding; owned P/N equals
outstanding supply; cumulative payout + remaining backing never exceeds minted
collateral. Results include source/config hashes, seeds and per-run metrics, with
selected detailed paths for failure inspection. No public-chain success, market
observations, independent review or approved vault policy is inferred.

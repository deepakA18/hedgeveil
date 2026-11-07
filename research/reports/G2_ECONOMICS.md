# G2: synthetic economics and policy comparison

7 November 2026. FIN-02 local research implementation; independent quant/economics
review pending. Depends on FIN-01. **No rolling candidate passed the frozen
training gates.** No vault policy is selected or approved. Contract payoff logic
and the user's implementation plan are unchanged.

## Evidence and scope

[Full results](g2-economics.json) contain **9,180 strategy runs**, **612 benchmark
runs**, **81 analytic/binomial price checks**, source/config/fixture hashes,
per-run costs, liquidity failures, maker accounting and selected daily failure
paths. [The protocol](../policy-comparison/PROTOCOL.md) and
[parameters](../policy-comparison/config.json) were written before results.
All inputs are **synthetic research data**, not price observations, executable
market quotes, contract receipts or a historical backtest.

There are 45 configurations: four policy families across strike/entry ratios
0.25/0.40/0.60 and permitted tenors 4/7/14/30/60 days. Each runs at initial wealth
$100/$1,000/$10,000 against fixed maker capital. Seventeen scenarios, each with
two training and two held-out seeds, produce 68 paths of 84 daily intervals.
Policies and benchmarks have equal initial user wealth within each comparison.
Maker capital is additional disclosed funding, not included in user wealth.

Train seeds: 101, 202. Held-out seeds: 1001, 2002. Selection uses normal training
paths only and executes before held-out simulations. A regression test mutates a
future price/liquidity suffix and verifies prior policy actions are unchanged.
No thresholds were relaxed in response to results. A new research version with
new holdout seeds is required to revise parameters after this run.

## Selection failure

The frozen rolling-policy screen requires initial acquisition, at least one roll,
>=95% roll-window completion and <=2% annualized explicit friction. Friction
includes initial acquisition and roll spread, fees, gas and oracle costs, linearly
scaled by 365/84. That extrapolation is a screening statistic, not a forecast.

| Initial user wealth | Normal training result | Decision |
|---|---|---|
| $100 | All 60 rolling configuration/seed runs acquire P; annual friction ranges 3.44%–63.13%; some also miss completion targets | No passing candidate |
| $1,000 | All 60 initial acquisitions exceed the fixed 200-NEAR gross quote limit | No passing candidate |
| $10,000 | All 60 initial acquisitions exceed the same quote limit | No passing candidate |

Unfilled initial acquisitions remain native cash and incur actual modeled attempt
costs. They are retained in the results and cannot qualify through low fees from
doing no trading. Hold-to-settlement is a comparator and is excluded from rolling
policy selection. A low fee alone does not demonstrate USD tracking.

## Held-out outcomes

The table aggregates normal held-out runs at $100 across each family's configured
strike/tenor grid. It describes those grids, not equally weighted market forecasts
or selection of a winning configuration. “Hold” retains NEAR after settlement.

| Policy family | Mean terminal target-relative return | Worst drawdown | Mean annualized friction | Roll-window completion |
|---|---:|---:|---:|---:|
| Hold to settlement | +10.21% | 36.34% | 0.86% | Not applicable |
| Short rolling | −7.40% | 14.07% | 35.39% | 82.09% |
| Long rolling | −0.48% | 4.89% | 5.63% | 100.00% |
| Hybrid | −4.74% | 14.07% | 24.17% | 82.31% |

For a concrete fixed example, short rolling at 7 days and strike ratio 0.40,
$100 initial wealth, held-out seed 1001:

| Scenario | Terminal target-relative return | Completed / requested roll windows | Cash exit unavailable | Days with unresolved value |
|---|---:|---:|---:|---:|
| Normal | −6.21% | 15 / 18 | 0.00% | 0 |
| 80% crash | −58.76% | 15 / 19 | 0.00% | 0 |
| No bids after day 14 | −1.74% | 12 / 22 | 83.53% | 0 |
| 14-day settlement delay | +12.39% | 10 / 12 | 38.82% | 28 |
| Permanent resolution loss from day 18 | −1.63% | 3 / 4 | 78.82% | 63 |
| Makers leave | +2.76% | 6 / 24 | 4.71% | 0 |

Positive terminal marks in some failures do not establish an exit. “No bids” can
still permit redemption after maturity and a later purchase, which explains its
completed reinvestments. With resolution loss, in-kind claims remain owned and
marked, but cannot be redeemed or sold in this model. When makers disappear,
cash obtained from earlier redemptions keeps NEAR exposure. Across all $100
held-out configurations the 80% crash scenario reaches an **81.48% terminal
shortfall**. Collateral conservation does not prevent these losses.

Each run reports target-relative return, annualized volatility of daily
`(value[t] - value[t-1]) / initial_wealth`, maximum drawdown, terminal and worst-path
shortfall, and exit availability. Scenario/policy/size summaries include sample
shortfall frequency and the mean of the worst ceil(5% × sample count) terminal
losses. These small synthetic samples do not estimate market probabilities or
reliable statistical tail risk. Daily marks during outages are explicitly model
estimates; actual cash exits are separately nullable.

All sizes have per-run worst in-kind model values and worst *available* cash exit
values. Missing cash liquidity is `null`, never zero dollars or invented success.
At $100, normal seed 1001's short-7/0.40 example has worst in-kind model value
$93.76 and worst available cash exit $92.51. The larger profiles never acquire P
under the fixed depth limit, so their exit values describe residual NEAR cash.

## Benchmarks and maker economics

Mean held-out terminal return, $100 initial wealth:

| Benchmark | Normal paths | 80% crash paths |
|---|---:|---:|
| Hold NEAR | +10.77% | −77.85% |
| Ideal constant USD | 0.00% | 0.00% |
| Separate collateralized-debt borrower | +10.19% | −50.00% |

Ideal USD is a measurement baseline. The debt benchmark assumes externally
funded, non-depegging stable cash, 50% initial borrowing, 75% liquidation LTV,
5% annual debt interest, a two-day oracle lag and up to a 5% liquidation penalty
after lender repayment. Borrower equity excludes debt and is limited-liability;
lender losses are separate. Crash held-out lender bad debt is $30.81/$31.21 for
the two seeds at this size. Results do not establish superiority over a real debt
protocol, whose funding, execution and stable-asset risks are not modeled here.

Two synthetic makers each start with 1,000 NEAR. They warehouse N, fund new pairs,
buy old P, merge matching inventory and redeem only after finality. No external
N buyer, hedge, top-up, credit or hidden inventory source is assumed. Quotes have
depth, spread, freshness, activity and loss checks. Competition selects the best
fully funded output; failure preserves claims. A maker's seed funding is capital
at risk, not revenue or evidence of organic demand.

For the same normal short-7/0.40 $100 example, seed 1001 incurs $1.3482 fees,
$5.5839 spread cost, $0.0035 simulated gas and $0.0353 simulated oracle cost.
Roll changes are reported separately as model-value, unit-price and target-notional
changes; they are not added again to friction. These service prices are assumed
research inputs, not measured network charges.

Combined maker P/L relative to holding their initial NEAR is +$40.54 in seed 1001
and −$9.65 in seed 2002, valued at each terminal spot. Total USD P/L, native-relative
P/L, peak cash used, nominal inventory, fill concentration and top-ups are separate
fields. The 5% annual capital hurdle on the initial $4,000 maker funding is
$46.03 over 84 days. The resulting unfunded return-hurdle gaps are about $5.49 and
$55.68. These hypothetical support requirements are not actual paid subsidies.
Operating subsidy and maker replenishment are zero in the modeled ledger.

## Reproduce and verify

Python 3.9+ standard library only; measured here with Python 3.9.6 on macOS ARM64:

```sh
python3 -m unittest discover -s tests/economics -v
python3 research/scenarios/generate.py --check
python3 research/policy-comparison/run.py --check
```

Omit `--check` to intentionally regenerate fixtures/results and review changes.
The evidence embeds source/config/fixture/test hashes; `--check` recomputes every
strategy/benchmark run and compares serialized output byte-for-byte. Exact
floating-point diagnostics may differ across Python/libm platforms; integer
ledger rules do not depend on report statistics. Record/review platform changes
rather than silently accepting changed research results.

All **15 economics test groups** passed. Ledger invariants execute after every
simulation step: total funding equals free balances + reserves + explicit sinks;
claim ownership equals supply; minted backing reconciles to merges, payouts,
reserve and dust. Tests cover failed-fill rollback, consumed/expired quotes,
funding rechecks, depth/capital failures, fixed-maturity delayed payouts, permanent
source loss, future-data independence, debt latency/gap losses and selection rules.
The 81 independent binomial/analytic pricing checks span spot, tenor, volatility
and interest; maximum absolute call-price discrepancy is about **$0.000119**.

Existing checks also passed: five rational tests, 565-vector regeneration,
three locked Rust tests, root formatting and Clippy with warnings denied, schema
regeneration check and nine schema test groups. No contract changed in G2;
existing G1/G3 Wasm receipt evidence remains separate.

## Remaining boundaries and next work

This is a daily synthetic economic model, not the G5 RFQ implementation. Quotes
fill within a step; time-to-fill is integer days and does not measure network
latency. There is no independently running maker service, wallet, indexer, vault
share issuance or production oracle. Historical series are retained beyond G3's
eight lifetime slots. No modeled capacity is an approved contract limit.

The pricing diagnostic uses a zero-dividend European call model and the specified
P=spot−call identity; its assumptions omit jumps from pricing even when stress
paths jump. Black–Scholes is a valuation model, not observed liquidity; see
[Merton's Nobel lecture](https://www.nobelprize.org/uploads/2018/06/merton-lecture.pdf).
Independent pricing checks establish numerical agreement under model assumptions,
not whether those assumptions fit NEAR options.

Independent quant/economics review remains pending. Before G6 policy selection,
test alternative warehouse/hedging/N-demand assumptions under a new experiment
version and holdout, and compare them with real G5 funded maker execution.
Proceed next with ORC-01/02 (G4 product settlement); the failed economic selection
does not justify a premature vault policy. G9 release work is unfinished and
production remains disabled.

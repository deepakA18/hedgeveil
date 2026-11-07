# Economic evidence and remaining experiments

The implemented rational/Rust model checks collateral fractions, checked
fixed-point arithmetic and payout rounding. Its 565 shared vectors are arithmetic
fixtures, not historical data or evidence that the vault tracks USD profitably.
See [SPEC](SPEC.md), `research/reference-model/` and FIN-01/02 in [BACKLOG](BACKLOG.md).

Remaining FIN-02 deliverables:

- Seeded price/liquidity paths and explicit maker capital, costs and oracle delay.
- Four policies: hold to settlement, scheduled short-expiry rolls, longer-expiry
  rolls, and price-distance hybrid with hysteresis/cooldown.
- Equal-initial-wealth benchmarks: NEAR, ideal USD reference and a separately
  modeled debt strategy including liquidation costs, latency and gap losses.
- Normal/high-volatility/jump paths; 30–80% falls, slow declines, V recoveries,
  outages, 1–14 day delays, no bids, maker exit/concentration and source disagreement.
- Held-out evaluation with parameters/gates frozen before inspecting outcomes;
  report seeds, train/evaluation split, assumptions and negative results.

Report target-relative return, tracking-error volatility, drawdown, shortfall/tail
loss, unresolved-settlement exposure, each fee/spread/gas/oracle cost, roll completion,
in-kind/cash exit outcomes by size, and maker P/L/capital/subsidies separately.
Capacity depends on stressed executable depth. Do not assume unlimited maker
capital or treat terminal payoff at current spot as a live option price.

The plan's strike/maturity grids and friction/completion thresholds are candidate
research settings. No policy or economic acceptance threshold is approved yet.
Accounting backing does not guarantee a USD peg, profit, liquidity or low losses.

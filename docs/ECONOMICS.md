# Economic evidence

FIN-02 now has an offline synthetic scenario engine, finite maker inventory,
four policy families, equal-wealth benchmarks and a held-out comparison. **No
rolling candidate passed the frozen training gates.** This is an implemented
research experiment with a negative selection result, not an approved vault policy.

See [G2 results](../research/reports/G2_ECONOMICS.md),
[machine-readable evidence](../research/reports/g2-economics.json) and the
[frozen protocol](../research/policy-comparison/PROTOCOL.md). The rational/Rust
payoff reference and 565 vectors remain unchanged; their solvency/rounding checks
do not imply profitable USD tracking.

The run evaluates 45 configurations across 68 synthetic paths and three sizes:
9,180 strategy runs plus 612 benchmark runs. Train seeds 101/202 and held-out seeds
1001/2002 are disjoint. Candidate selection occurs before held-out execution; no
threshold is relaxed after failure. All paths are generated locally without paid
data or credentials. Results are simulation records, not transaction receipts.

The model includes quote spreads and funded all-or-nothing swaps, capacity and
loss limits, maker withdrawals, delayed/missing observations, fixed-maturity
settlement, native cash exposure, explicit user costs and maker opportunity cost.
It reports unavailable cash exits separately from in-kind model values. Seeded
scenario frequencies are not real-world probabilities.

Remaining work: independent economic review, alternative maker inventory/hedging
and N-demand models, broader parameter/data validation, and actual G5 maker
execution evidence. A new experiment version and new holdout are required before
changing assumptions or gates to reconsider policy selection. G6 policy remains
unselected. G4 settlement development can proceed independently.

Accounting backing does not guarantee a USD peg, profit, liquidity or low losses.

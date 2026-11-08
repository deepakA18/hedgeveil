# SEC-01 verification scope

The executable models in `check_models.py` use Python's standard library and
breadth-first enumeration to a fixed point. Every reachable edge is checked;
there is no depth cutoff or random sampling within these finite abstractions.
The ten unsafe model mutations must each produce a shortest counterexample.
These traces are negative controls, **not vulnerabilities discovered in Rust**.
`--check` reruns the models and compares the deterministic, source-hashed report.
Assertions must be enabled; optimized Python is rejected.

```sh
python3 verification/check_models.py --check
# After an intentional model/source change, regenerate and inspect:
python3 verification/check_models.py
```

| Model | Exact finite domain | Safety checked | Implementation relationship |
|---|---|---|---|
| Withdrawals | Two owners, one unit each, two lifetime ticket IDs; transfer success/failure, callback success/panic/malformed result, per-ticket timeout, terminal close and replay in all enabled orders | Per-owner obligation conservation; physical funds subtract successful but unacknowledged payouts; at-most-once payout/restoration; UNKNOWN never refunded or resent | Abstracts both core collateral and oracle credit ticket lifecycles; `clearinghouse/src/withdrawals.rs`, `settlement-oracle/src/withdrawals.rs` |
| Oracle | One series, two aggregate committed observation routes with distinct prices/roots; time slots 0–6; maturity 1, primary end 2, fallback end 3, arbitration end 6; challenge duration 2; proposer bond 2/challenger bond 1 | Bond conservation/single release, final observation authenticity, immutable final/delayed states; missing evidence never creates a price | `settlement-oracle/src/{lib,lifecycle,types}.rs`; full source arrays/hashes/aggregation are abstracted into route readiness |
| Resolution import | Two monotonically numbered requests; timeout replacement; all reply/callback orders; malformed, nonfinal, wrong-series and two distinct valid final prices | Only the currently matching request can set the price; final price never changes | `clearinghouse/src/series.rs`; the second distinct valid price tests rejection even if an oracle returns inconsistent final replies |
| Reserve | Scales 2, 3, 7; every integer complementary coefficient including zero/one endpoints; backing 1–8; every positive redemption fragment and both-leg ordering | Remaining aggregate rounded obligations fit reserve; paid + reserve equals original backing; payouts never exceed backing | `clearinghouse/src/claims.rs` and `payoff-math`; fixed-coefficient redemption only |

The reserve bound follows the integer floor inequality
`floor(x*c/Q) + floor(y*c/Q) <= floor((x+y)*c/Q)` for nonnegative
integers. Each redemption's rounded payout plus the remaining obligation is no
larger than the previous obligation. Complementary coefficients make initial
aggregate obligations at most the backing. This explanation and finite
enumeration are **not a mechanized proof over u128 or a symbolic execution of
Rust**. The existing shared rational/Rust vectors separately exercise actual
`Q = 10^24`, wide products and arithmetic boundaries.

`check_symbolic.py` adds a separate bounded integer SMT analysis using pinned
[Z3 4.15.4.0](https://pypi.org/project/z3-solver/4.15.4.0/). For each of eight
coefficients (0, 1, floor(Q/3), floor(2Q/3), Q-1, Q and their complements), it
searches all integer balances/amounts through the configured `100*Q` supply cap
for violations of initial backing, fragmentation safety, redemption conservation
and U256-product/u128-payout bounds. The coefficient set is closed under
complement, so both payout legs are covered at each selected settlement.

All 32 violation queries return UNSAT; their assumptions must separately return
SAT to avoid vacuous results. A rounding-up mutation must return SAT, and its
counterexample is checked with ordinary Python integers. Each query has a
10-second timeout; UNKNOWN or timeout fails the check. Generated SMT-LIB inputs
are retained under `smt/`, with hashes/results in `g8-symbolic.json`. `--check`
reconstructs every query and reruns the solver before comparing evidence.

```sh
# First run may download the pinned open-source solver; no paid service is used.
UV_CACHE_DIR=/private/tmp/hedgeveil-uv-cache uv run --with-requirements verification/requirements.txt python verification/check_symbolic.py --check
```

This is symbolic analysis of bounded **integer accounting obligations**. It is
not symbolic execution of Rust, a verified compiler/runtime refinement, an
arbitrary-coefficient theorem, or an independent solver proof certificate.
Redemption assumes a covered reserve and immutable coefficients; other models
and compiled tests address the lifecycle that must establish those assumptions.

Assumptions and exclusions:

- Contract mutations are atomic. The runtime authenticates predecessor, private
  callback and promise-result provenance. Unauthorized model operations are
  rejected self-loops; the models do not prove NEAR's authentication mechanisms.
- Callback panic consumes the delivery without changing financial state. A
  timeout can happen before or after a physical transfer. No callback or
  counterparty fairness is assumed; safety is checked, eventual payment is not.
- Closed ticket tombstones exist only in the verifier to track history. Actual
  contracts remove terminal tickets and keep monotonically increasing IDs.
  Two lifetime IDs are a model bound, not the real retained-ticket capacity.
- Storage refunds, storage staking, gas, donations, deposits after the initial
  state, account deletion, key management and integer overflow are outside the
  withdrawal abstraction. Existing compiled tests cover selected cases. Oracle
  credits and withdrawals are checked separately, not as one product automaton.
- Observation prices/roots stand for validated committed synthetic data. Source
  independence, market truth, signatures and collision resistance are assumed.
  Publication is allowed only from maturity until arbitration expiry.
- Vault/keeper state, arbitrary trade schedules, Rust serialization and dependency
  behavior are not in these models. No refinement relation to the deployed Wasm
  has been proved. Independent review stays pending.

The compiled-Wasm extension uses deterministic xorshift32 choices with seeds
20903, 65537 and 3735928559, 80 pre-final and 80 post-final steps per run. It mixes
split, transfer, merge and exact Ed25519 RFQs before settlement; finalized
transfers and fragmented redemptions follow settlement. Two independently
generated signing keys remain in memory. A separate BigInt ledger checks every
step; invalid late legs must preserve the nonce before a valid fill, and used
quotes must fail replay. Actual canonical events reconcile at the end. Each run
also retains G3's callback panic/gas failure, UNKNOWN, actual failed native
payout, storage-refund failure, donation and 16-account/8-series/64-ticket probes.

```sh
# Uses existing locked Sandbox dependencies and pinned native runtime.
python3 scripts/check-security.py
# Recompute models and validate every retained source/Wasm hash before summarizing:
python3 scripts/check-security.py --summarize
```

Run the seeds sequentially: the underlying G3 harness uses a shared temporary
event-validation file. Replaying a seed reproduces operation choices, not keys,
wall-clock timestamps, genesis hashes or transaction hashes. Node/RPC errors fail
the run; they are never retried as successful transactions. All evidence is local
and synthetic. Gas maxima include expected failures and deployment receipts;
they are observations of these runs, not upper bounds over all possible inputs.

Dependencies: FIN-01, CORE-01–04, ORC-01/02, MKT-01 and existing G3–G7 fixtures.
Invariant/failure/evidence mapping is in [the SEC-01 report](../research/reports/G8_SECURITY.md).
Security/QA review is pending; SEC-02 must review the exact release source and
Wasm, assumptions, uncovered interleavings and any resulting remediation.

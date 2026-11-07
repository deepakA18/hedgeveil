# Protocol specification v0.1

Status: implementation baseline, pending independent review. This document fixes
the arithmetic used by the initial host library. It does not establish circuit
soundness or authorize a production deployment. The implementation plan governs
the complete release scope.

## Units and numerical domains

| Symbol | Meaning | Representation |
|---|---|---|
| C / amount | Native NEAR collateral or claim quantity | u128 atomic NEAR; 1 NEAR = Q = 10^24 |
| K | USD target per one-NEAR pair | Positive u128, USD/NEAR × 10^12 |
| X_M | Historical USD per NEAR at maturity M | u128 at the same price scale as K |
| p_q, n_q | Final collateral fractions | Integers in [0, Q], summing to Q |
| M | End of immutable observation window | UTC nanoseconds, distinct from finalization |

Wire integers are canonical base-10 strings, with no sign, whitespace, decimal
point, exponent, or leading zeros except `"0"`. No floating point amounts. A
price with different units or precision must be explicitly normalized before
entry; no implicit ticker inversion. Python accepts integers only, rejecting
booleans. Rust uses u128 inputs and checked U256 intermediates. Circuit limbs and
range constraints must prove the same bounds without finite-field wraparound.
The u128 ceiling is a representation limit, not an approved custody cap.

## Payoff and settlement

For K > 0: p = 1 if X_M <= K, otherwise K/X_M; n = 1-p.
The ideal P value is C×min(X_M,K) USD; N is C×max(X_M-K,0) USD,
when C is expressed in NEAR. Holding both legs preserves NEAR exposure.

| X_M (USD/NEAR), K = 2 | P (NEAR) | N (NEAR) | P (USD) | N (USD) |
|---|---|---|---|---|
| 8 | 0.25 | 0.75 | 2 | 6 |
| 4 | 0.5 | 0.5 | 2 | 2 |
| 2 | 1 | 0 | 2 | 0 |
| 1 | 1 | 0 | 1 | 0 |

These prices are fictional. P absorbs losses below the strike. This is neither a
dollar peg nor principal protection. Before maturity, intrinsic payoff is not a
market price; executable quotes are needed for trades.

Finalization fixes p_q = Q when X_M <= K, otherwise floor(K×Q/X_M), and n_q = Q-p_q.
For either leg: amount×coefficient = payout×Q + remainder, with 0 <= remainder < Q.
Each redemption rounds down separately. Thus equal P/N quantities redeemed in
one pair leave either zero or one atomic unit of redemption dust. Fragmentation
can increase dust; it cannot increase payout. Coefficient quantization can shift
value from ideal P to N by less than amount/Q atomic units before redemption
rounding. Do not promise each leg differs from its rational ideal by only one
atomic unit for arbitrary u128 amounts.

Missing, errored, negative, or stale observations are never zero prices. The host
library rejects zero by default. `AllowExplicit` only exercises the mathematical
branch; the eventual oracle must authenticate a policy permitting genuine zero.
K=0 is always invalid. Checked division rejects zero divisors and results that
exceed u128. Required inputs round up, outputs round down.

For inverse quotes: 1/4 NEAR per USD means 4 USD per NEAR. Conversion must retain
exact rational precision until the observation policy's specified quantization.
That policy is not implemented here.

## Observation and finality

Commit immutable asset identity, units, scale, interval, sampling/aggregation,
source eligibility, missing coverage, outliers, quote conversion, zero/disruption
policy, proposal/challenge/arbitration deadlines and fallback hierarchy when
creating a series. Proposed experiments use a five-minute trailing window,
three independent sources and a 24-hour challenge, pending historical replay.
No oracle provider or production parameters are accepted by this baseline.

The oracle's authenticated finalized historical result is immutable. Delayed
resolution never substitutes the latest price. If X_M=4 and K=2, P receives
0.5 NEAR even if NEAR falls to 2.4 USD by finalization: then it is worth 1.2 USD.
Pair merges remain available before finalization, including disputes; a closed
series must retain the result and artifact support needed by outstanding notes.

## Conservation and fees

Deposit creates at most attached collateral. Split consumes c collateral and
creates c P and c N for the same open series before its immutable cutoff. Transfer
preserves quantities per asset. Merge consumes matching P/N and recreates c
collateral before finalization. Redeem consumes a finalized claim and creates the
rounded collateral amount. Withdrawal consumes collateral and creates one public
payout obligation. Verifier acceptance and nullifier/output changes are atomic.

Fees are explicit, proof-bound collateral transfers deducted from input value;
no hidden percentage or discretionary mint. The initial math fixtures have zero
fees. Gas, storage reserves and service fees are separately funded from backing.
Fees cannot consume other users' collateral. Dust stays in custody with no admin
sweep. Unsolicited funds are surplus, not automatic note issuance.

For every consistent assignment of series outcomes, available custody covers
free collateral-note obligations, unresolved claim payouts and unpaid tickets.
This is a hidden-state inductive invariant, not a public per-series balance
report. A dispatched payment needs explicit in-flight accounting: neither count
sent funds as available nor release its refund obligation without outcome proof.
See [the conservation model](../verification/assumptions.md).

## Proof and recovery boundary

Every transition must bind the deployment domain, pool, protocol/verifier version,
operation, root, nullifiers, output commitments/ciphertexts, expiry, relevant
current state and public transfers/fees. Ownership is independent of submitting
NEAR account. Reject duplicate and previously spent nullifiers. A historical
root does not authorize stale settlement/vault state.

Withdrawal lifecycle: pending → succeeded OR failed-confirmed → replacement
note once. Unknown outcomes are quarantined; timeouts never authorize a refund
or resend. Recovery cannot reset the consumed nullifier. Callback failure after
successful transfer must never enable replacement issuance.

The [schema documentation](../packages/shared-schemas/README.md) distinguishes
the semantic JSON envelope from the unselected circuit encoding. Cryptographic
primitives, output recoverability, arities and field layout require G1-ZK evidence.


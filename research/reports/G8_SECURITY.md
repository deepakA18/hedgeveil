# G8 / SEC-01: bounded adversarial verification

8 November 2026. Local synthetic evidence; Security/QA and independent SEC-02
review pending. Contract economics, production settings and archived deployments
are unchanged. G8 is not complete: these checks do not establish the absence of
critical/high issues in an unreviewed release.

## Executable scope

All three compiled-Wasm runs passed **28 named checks each**, with **480 total
stateful steps**, **75 successful signed fills**, **1,463 recorded transactions**
and **1,406 reconciled canonical events**. Expected failures are included in the
transaction count; account creation, funding and donation transfers also execute
but are not all recorded in that count. No transaction success is simulated.

| Seed / retained evidence | Checks | Transactions | Events | Signed fills |
|---|---:|---:|---:|---:|
| [20903](g8-stateful-20903.json) | 28 | 492 | 477 | 23 |
| [65537](g8-stateful-65537.json) | 28 | 478 | 455 | 27 |
| [3735928559](g8-stateful-3735928559.json) | 28 | 493 | 474 | 25 |

The [aggregate report](g8-security.json) binds all three reports by SHA-256.
Each run's 37 source/lockfile hashes and four artifact hashes match the current
files. All 225 retained quote-attempt signatures and their transaction links were
also checked. These include valid signatures on unfunded late-leg attempts and
replays, which correctly fail execution.

[Finite model evidence](g8-models.json) reaches fixed points for 1,501 withdrawal
states / 16,360 edges, 1,105 oracle states / 4,750 edges and 309 resolution-import
states / 1,195 edges. Across 120 reserve instances it explores 10,268 states /
56,182 edges. All safety assertions pass. Ten deliberately unsafe **model**
mutations produce counterexamples; these are sensitivity checks, not Rust bug
reports. Bounds, trust assumptions and source correspondence are explicit in
[verification/README](../../verification/README.md).

[Bounded symbolic evidence](g8-symbolic.json) adds 32 UNSAT counterexample
searches over integer amounts through `100*10^24`, using actual `Q=10^24` and
eight selected complementary coefficients. The obligations cover initial backing,
fragmentation, redemption conservation and wide-product/narrow-payout bounds.
Every assumption set is satisfiable; a rounding-up negative control returns SAT
and its witness is independently checked with Python integers. The pinned solver,
all 33 SMT-LIB queries, source hashes and exact scope are retained. This is
bounded symbolic accounting analysis, not symbolic execution of Rust or a
proof for every coefficient.

The extended G3 harness supports `--seed`, `--steps` and `--trades`, retaining the
original default seed and 40-step profile. Its SEC-01 profile runs three fixed
seeds with 80 pre-final and 80 post-final choices each. Before finalization it
mixes split/transfer/merge with signed P/N-for-collateral trades and exact fees.
Each trade first tries a signed, unfunded late leg, then the valid quote with the
same nonce, then a replay. An independent BigInt ledger checks balances, reserves,
supplies and payout totals after every step. After finalization it mixes claim
transfers and fragmented redemptions, drains remaining claims and releases dust.
Skipped choices with no inventory still count as model steps, not transactions.

The existing full-capacity, storage-refund, callback-fault and event-replay probes
also run for each seed. Normal Wasm excludes fault exports; fault injection runs
in a separately deployed artifact. Real finalized receipts and actual recipient
credits distinguish paid-but-unacknowledged UNKNOWN from confirmed failure.
Each report records source/lockfile/Wasm hashes, operation choices, public signing
keys/quotes, actual transaction/receipt IDs, events, custody, gas and storage.
Private keys stay in memory. No public deployment or organic market observation
is represented.

## Invariants and failure paths

| Plan §15 invariant | New SEC-01 evidence | Other retained coverage / remaining scope |
|---|---|---|
| No unbacked pairs, complementarity, bounded payouts | Mixed stateful model comparison; finite exhaustive redemption fragments; 32 bounded SMT obligations; unchanged 565 rational/Rust vectors | No symbolic execution or mechanized refinement of Rust/u128 |
| Series/custody/storage isolation | Canonical event replay, donation probe, separate storage funding, full local account/series/ticket caps | Arbitrary multi-series/vault concurrency and production load remain open |
| Trade/roll conservation and authorization | Real signed P/N trades, exact fee aliases, late-leg failure rollback and nonce reuse only after failure | [G5](G5_FUNDED_MARKET.md), [basket](G6_BASKET.md), [keeper](G6_KEEPER.md) retain separately scoped roll/permission checks |
| Single consumption | Replayed fills fail; finite withdrawal duplicate/timeout/close interleavings; real callback panic/gas faults | Runtime callback provenance is an assumption of the model, exercised by existing Sandbox unauthorized-caller tests |
| Immutable economics and finality | Oracle terminal-state and stale-request models; real final-price overwrite rejection | [G4](G4_SETTLEMENT.md) covers committed sources, equivocation, disputes and timeout; source truth/independence remains outside the model |
| Rounding/fragmentation safety | Every bounded redemption fragment/order; actual fragmented redemption after transfers | Scales 2/3/7 are finite model bounds; actual Q and wide math covered separately by shared vectors |
| Fair vault entry/exit | Existing proportional-basket tests retained | No new vault product-state model or exhaustive exit/roll interleavings |
| Arbitrary admissible oracle prices cannot create backing | All complementary coefficients in finite reserve domains, including endpoints | Existing reference/vector magnitudes and zero-payout/dust Sandbox paths; no economic peg guarantee |
| Explicit liveness | Delayed oracle never invents a price; UNKNOWN never authorizes refund/resend | [APP-01](G7_LOCAL_CLIENT.md), [indexer](G7_INDEXER.md), [browser](G7_APP.md), [restart](G7_DEMO_RESUME.md) retain receipt/recovery/no-bid checks; no fairness or eventual liquidity claim |

Existing G4–G7/browser reports are historical evidence for their recorded hashes;
this increment does not relabel them as fresh runs. Every new stateful report
includes the current source/Wasm hashes. The summary command rejects stale
source or artifact evidence before aggregating results.

## Observed local limits

Each run reached 16 registered accounts, 8 series and 64 retained terminal
withdrawal tickets. The over-cap request failed with its debit rolled back.
Final normal-contract storage was **629,965 bytes**, including deployed code;
the custody snapshot covered separately retained collateral/storage/operating
categories. This is a terminal-ticket capacity sweep, not 64 concurrent payouts.

Across all runs, the largest observed receipt burned **42.558447 Tgas** and the
largest recorded transaction/receipt chain burned **47.504299 Tgas**, including
deployments. Selected method maxima below include expected failed attempts;
transaction totals include their receipts, not only the initial function call.

| Method | Observed maximum total Tgas |
|---|---:|
| `fill_quote` | 4.894282 |
| `split` | 16.480745 |
| `redeem` | 4.646870 |
| `request_withdrawal` | 32.676963 |

These are measured samples, not proven upper bounds for every legal input or
production throughput benchmarks. The normal core remains 614,630 bytes with
SHA-256 `378f6ce6e57e073670d53580b64d6f1744b9c8ca2f54c2022e608e345fa3a007`;
the separate fault core is 620,800 bytes with SHA-256
`b9d53331a4a996eb02697f517a3d2da36f5d1616296edf5153b2d73f314fc556`.
Contract code and artifacts did not change in this increment.

## Reproduce

```sh
npm ci --prefix tests/sandbox --ignore-scripts
python3 verification/check_models.py --check
UV_CACHE_DIR=/private/tmp/hedgeveil-uv-cache uv run --with-requirements verification/requirements.txt python verification/check_symbolic.py --check
python3 scripts/check-security.py
```

The final command builds the locked core and runs seeds 20903, 65537 and
3735928559 sequentially, then writes [aggregate evidence](g8-security.json).
With retained reports and build artifacts, `python3 scripts/check-security.py
--summarize` recomputes the models, checks source/Wasm hashes and recreates the
summary without starting Sandbox. No paid service or `.env` is needed. Setup
and pinned runtime requirements are in the root README and contracts README.

Required arithmetic/vector, locked workspace tests, format, Clippy, generated
schema/check and RFQ codec/vector checks passed for this increment. All 59
historical archive checksums remain intact. No financial behavior changed, so
the specification remains unchanged.

## Remaining acceptance

The finite models and bounded SMT obligations do not provide symbolic Rust
execution or a verified refinement to NEAR receipts. All-coefficient symbolic
analysis and combined oracle-credit withdrawal,
storage-refund and vault/keeper product-state models remain outside this scope.
Three stateful seeds are bounded regression sampling, not exhaustive fuzzing or
all concurrent transaction orderings. Local cap and gas observations do not
establish sustained throughput, adversarial RPC load, public-network economics,
or gas bounds for every legal input. Browser-wallet/testnet and broader crash
drills remain APP/DEM/REL work.

Dependencies: FIN-01 and available G3–G7 implementations. Failure policy: a model
counterexample, ledger/receipt mismatch, changed evidence hash or exceeded local
capacity fails the command; unknown payouts remain unavailable. Reviewer:
Security/QA **pending**. SEC-02 must independently inspect the exact release
candidate, assess uncovered invariants and severity, and verify remediation.
Production stays disabled; no G8/G9 gate or audit sign-off is claimed.

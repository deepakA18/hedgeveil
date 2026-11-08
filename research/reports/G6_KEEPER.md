# VLT-02 one-shot keeper guard — local evidence

Recorded 8 November 2026. This implements an optional experimental Sandbox guard,
not FIN-02 economic selection, a recurring strategy or G6 release approval.
Independent quant/contracts/security review remains **pending**. Dependencies are
VLT-01 basket custody and MKT-01/02 funded execution; FIN-02's no-passing-policy
result is unchanged. [KEEPER](../../docs/KEEPER.md) and [SPEC](../../docs/SPEC.md)
define the new behavior and trust boundary.

One policy can be configured before initial shares exist. It fixes the keeper,
distinct reference-publisher account, fee receiver, old/new series, schedule,
new-maturity interval, freshness, notional, cash, fee and marked-loss limits.
The keeper can propose one full-old-P/new-P exchange. It cannot directly withdraw,
transfer arbitrary managed assets or replace a funded vault's terms. Successful
execution consumes the maker nonce and exhausts the policy in one receipt.

## Reproducible receipt evidence

| Suite against this artifact | Checks | Recorded transactions | Canonical events |
|---|---:|---:|---:|
| [Keeper guard](g6-keeper.json) | 13 | 136 | 119 |
| [Core lifecycle/fault regression](g6-keeper-core-regression.json) | 27 | 366 | 397 |
| [Ordinary market regression](g6-keeper-market-regression.json) | 29 | 97 | 61 |
| [Basket regression](g6-keeper-basket-regression.json) | 15 | 132 | 105 |

Account creation is not included in these transaction counts. The guard suite
executes one actual vault roll; the ordinary market regression records 11 signed
fills. Every result is from ephemeral local NEAR Sandbox receipts. There is no
public testnet deployment, organic volume, live market reference or independent
sign-off. All capital/storage/gas is supplied by Sandbox genesis funding.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Normal clearinghouse | 613,840 | `d68154346d1eef91e55c688826ee79c75c4af3cf45235b79701dc2813e49827d` |
| Fault-only clearinghouse | 620,010 | `fe97487b8c46cb2e8943e442da9ba981617d3fb08fd2f0bc00e9835a55da8e64` |

Rust 1.96.0 / near-sdk 5.30.1, Sandbox 2.14.0 and Node v24.8.0 on macOS ARM64.
Source/dependency/Wasm hashes and actual transaction/receipt IDs are embedded in
the JSON reports. The guard record includes 41 source hashes, signed proposals,
maker PIDs, planner PID, the fill digest and exact reference-valued outcome.
Private keys stay in memory; no `.env` or wallet file is read or printed.

```sh
npm ci --prefix tests/sandbox --ignore-scripts
node --test tests/keeper/planner.test.mjs
python3 scripts/build-core.py
node tests/sandbox/g6-keeper.mjs
node tests/sandbox/g3.mjs --report research/reports/g6-keeper-core-regression.json
node tests/sandbox/g5.mjs --report research/reports/g6-keeper-market-regression.json
node tests/sandbox/g6.mjs --report research/reports/g6-keeper-basket-regression.json
```

Also passed: three planner tests, four RFQ codec tests and encoding-vector checks,
five Python financial tests, 565 payoff vectors, three locked root Rust tests,
normal/fault contract Wasm Clippy, root Clippy/format and contract format, eleven
public-schema groups covering 29 intents, six oracle collector/schema groups and
15 economics groups. Generated public/oracle schemas reproduce through
`build_schema.py --check`. The payoff library, prior economic experiment and
historical receipt/archive records are unchanged.

## Guard and failure coverage

The invariant is execution-time authority and funding: the signed maker quote
must bind its taker to the core account, and only the immutable guard may debit
that account's managed vault holdings. Ordinary G5 fills still use the transaction
predecessor and cannot access the vault. Share supply and holder ownership do not
change during a roll. Both parties fund their outgoing assets before credits;
storage and operating allocations are not trading capital.

The suite exercises:

- Pre-bootstrap, one-time policy configuration; unauthorized callers, insufficient
  storage, keeper/publisher role overlap and invalid budget bounds rejected.
- Authenticated reference publication, monotonic sequence/timestamp, future-data
  rejection and keeper inability to publish a reference. These checks authenticate
  the configured account, not the economic truth of its data.
- Missing quotes, wrong sequence, stale reference, market pause, early/expired
  schedule and disallowed new remaining maturity producing actual deferred
  receipts, with holdings and maker nonces unchanged.
- Wrong taker, partial old position, wrong asset kind, excessive quote horizon,
  insufficient output, cash cap, fee destination, per-fill/total fee limits,
  notional, relative/absolute marked loss, maker inventory and vault cash guards.
- Forged signatures and wrong contract domains reaching authorization revert,
  including their protocol fee. The keeper has no managed withdrawal entry point.
- Latched deferral stops new inflows; fresh reference publication alone cannot
  clear it. In-kind exits remain available with stale references and no fill.
- Two independently running maker workers supply competing signatures. A separate
  planner process selects one; the contract performs the actual atomic exchange.
- A separate four-series basket retains old N while proposing new P, which would
  create a fifth held series. The contract defers and preserves the entire basket.
- After a successful roll, minting uses the actual new basket, even once the
  original seed series has matured. Repeated execution is blocked by exhaustion;
  all holders can exit, and a closed vault reports no enabled keeper.

Expected deferrals compare holdings, account balances and maker registries before
and after; only the separate one-yocto fee and deferral metadata change. Reverting
calls also compare fee/policy state. Canonical replay reconciles three test cores,
including managed cash, claims, share balances/supply, maker trades, fees and
permanent policy storage. All 119 canonical receipt events pass the generated
schema. A separate audit envelope records the successful roll's exact quantities
and reference-valued outcome; its fill digest matches the verified maker signature.

## Actual one-shot result

The primary vault starts with 2 Q old P and 0.1 NEAR cash against 2 Q shares. A
holder first exits 0.5 Q shares while the roll is deferred, leaving 1.5 Q old P
and 0.075 NEAR cash. Both makers have 80 NEAR deposited collateral and funded
old/new P/N inventory; their wallets separately fund storage/gas. Reference marks
are synthetic: old P 0.5, new P 0.45 NEAR per Q; companion N marks are 0.5/0.55.
They are unrelated to historical settlement observations and are not fair-price
or USD tracking claims.

The policy permits at most 2 NEAR reference notional, 0.1 NEAR cash input, 0.01
NEAR per-fill fee, 0.001 NEAR total fees, 200 bps marked loss and 0.01 NEAR absolute
loss. Freshness is 60 seconds; validity horizon is 30 seconds. These are disclosed
test parameters, not selected economic limits or stressed executable capacity.

The chosen maker A quote executed:

| Quantity | Actual value |
|---|---:|
| Old P debited | 1.5 Q |
| New P credited | 1.660013306719893546240851 Q |
| Native cash adjustment to maker | 0 NEAR |
| Signed fee to configured receiver | 0.00037425 NEAR |
| Input reference value, including fee | 0.75037425 NEAR |
| Output reference value | 0.747005988023952095808382 NEAR |
| Positive marked native loss | 0.003368261976047904191618 NEAR |

The recorded reference sequence is 19. Share supply and holder balances remain
unchanged by the trade. These are exact trade quantities and conservative marks;
the marked loss is not a realized USD return, a NAV estimate or an accounting
shortfall. Collateral is conserved. After later issuance and all exits, the
primary core has 160 NEAR free collateral and 160 NEAR reserves, matching 320 NEAR
tracked collateral, with all retained custody categories covered.

The planner filters supplied public snapshots and verifies candidate signatures,
then ranks net reference outputs. Snapshots can stale; the contract rechecks
authorization and every financial guard at execution. A selected proposal alone
never constitutes a fill. This is a local IPC service, not a persistent daemon,
relay, quote-availability guarantee or production latency benchmark.

## Cost and remaining boundaries

Policy configuration prepays another 4096 bytes (0.04096 NEAR at the queried local
price) plus one yocto, separate from the vault's existing storage. The combined
vault/policy storage allocation is 0.08192 NEAR and remains allocated after closure.
Reference publication and keeper calls each pay one yocto from their own wallet.
The signed trade fee is debited from managed cash only within immutable budgets.
Measured successful/deferred keeper-call gas spans 4.171–6.731 Tgas in this run;
individual transaction-plus-receipt figures are in the JSON evidence. These are
bounded local measurements, not production sizing.

The core state layout changed again; deploy fresh local state only. There is no
migration, policy replacement or upgraded old deployment. The G3/G5/basket
regressions preserve earlier semantics but are not exhaustive combined concurrent
interleavings. The guard suite uses the existing synthetic oracle fixture and a
separate direct reference publisher; it does not add production source assurance.

Pending: an independently reviewed passing economic policy, recurring allocation,
stressed-depth admission limits, authenticated independent current references,
broader fuzz/interleaving/load tests, reference/quote outage supervision,
RFQ-and-mint and cash-only exit conveniences, persistent receipt recovery,
SDK/UI/indexer and public testnet evidence. G5 quotes have no signed issue time;
the guard bounds expiry against the latest reference, not proven creation age.
Independent quant/contracts/security review stays pending. G9 completion and
G10 production remain separate gates.

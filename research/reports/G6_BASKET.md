# G6 VLT-01 — local basket accounting

7 November 2026. VLT-01 basket mechanics are implemented for Sandbox only. This
does **not** complete G6: FIN-02 still selects no passing strategy, and VLT-02
current-price guards, keeper execution and policy approval remain pending.
Contracts/economics independent review is pending. Dependencies are CORE-03,
ORC-02 and MKT-01; this increment exercises policy-independent custody mechanics.

The [specification](../../docs/VAULT.md) was written before implementation, with
the financial behavior recorded in [SPEC](../../docs/SPEC.md). One immutable
`basket-demo-v1` vault accepts an exact seeded bootstrap and later proportional
in-kind baskets. Inputs round up, exits round down, and the last holder receives
all remaining managed quantities. Shares are internal ledger balances, not a
token-standard implementation. No mark/NAV input, management fee, accrued fee
liability, keeper key or strategy trade exists in this increment.

## Evidence and reproduction

| Suite on the new core | Checks | Recorded transactions | Canonical events |
|---|---:|---:|---:|
| [G6 basket](g6-vault.json) | 15 | 132 | 105 |
| [G3 lifecycle/fault regression](g6-core-regression.json) | 27 | 366 | 397 |
| [G5 funded-market regression](g6-market-regression.json) | 29 | 97 | 61 |

G5 additionally records 11 signed fills. Account creation and the raw donation
are not included in the tabulated transaction counts. Evidence contains actual
local transaction/receipt outcomes, source/lock and Wasm hashes, canonical events,
custody and runtime metadata. All deployments are fresh ephemeral Sandbox
accounts. The account named `testnet-domain.sandbox` tests rejection under a
testnet initialization domain; it is not a public testnet deployment.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Normal clearinghouse | 556,954 | `e83e0f68b0440f2f67cb518917cfcc97d06218d0e8ab998bdeabf72c1d4f07ea` |
| Fault-only clearinghouse | 563,169 | `bc00280144e4102762eee8dec8fc44aa02d4570d229fc170f74ea562a41655f6` |

The state layout adds optional vault state; there is no migration from previous
core versions. Original G3–G5 reports remain unchanged records of their revisions.
The build uses locked Rust 1.96.0 / near-sdk 5.30.1, Sandbox 2.14.0 and Node v24.8.0
on macOS ARM64. Payoff arithmetic and its rational reference are unchanged.

```sh
npm ci --prefix tests/sandbox --ignore-scripts
python3 scripts/build-core.py
node tests/sandbox/g6.mjs
node tests/sandbox/g3.mjs --report research/reports/g6-core-regression.json
node tests/sandbox/g5.mjs --report research/reports/g6-market-regression.json
```

Also passed: five Python financial tests, 565 shared vectors, three locked Rust
tests, root and contract format/Clippy (normal and fault builds), four RFQ codec
tests and vector reproducibility, ten public-schema groups covering 26 intents,
six oracle collector/schema groups and 15 economics groups. Both generated
schemas reproduce with `build_schema.py --check`. No paid API or wallet file is
needed. Keys remain ephemeral; `.env`, historical evidence and deployment
registries are not changed.

## Invariants and exercised failures

The independent BigInt model uses ceiling/floor integer division and checks
holdings, total shares and every holder after mint/exit operations. It separately
replays canonical events against all registered account balances, claim
supplies/reserves, managed holdings, share balances/supply, storage and fees.
SUPPLY shares are mirrors, never extra native backing.

The test seed is seven atomic native units plus P/N quantities 11/13, 17/19,
23/29 and 31/37 for four series, against 100 initial atomic shares. These deliberately
small, nondivisible quantities exercise rounding; they are not an economic
allocation or recommended share scale. Seeded sequence generator `0x61b1` performs
24 varied funded mint/exit operations. It reserves enough shares for subsequent
exit tests; a separate negative case checks unowned redemption.

Coverage includes:

- Unauthorized creation, insufficient storage, cash-only/duplicate seeds and a
  fifth series rejected without state mutation. Creation is single-use and
  rejects the testnet domain.
- Exact initial share scale; absent/duplicate/mispriced input limits and an
  unfunded first depositor rejected. Maximum nine-asset basket inputs are matched
  by asset identity even when supplied in reverse order.
- Later inputs use ceilings; exits use floors. Zero-useful-output dust issuance
  and exits, excessive supply, unowned shares and unmet exit minima fail atomically.
- Raw native donations and ordinary user deposits leave the managed basket and
  share ratios unchanged. Vault storage is separate from user collateral and
  remains funded after final closure.
- Shares cannot transfer to an unregistered account or the same owner. A holder
  cannot unregister while owning shares. All 16 holder slots, including 13
  maximum-length account IDs, fit the prepaid storage bound.
- Vault mint pause, market pause and all existing deposit/series/split pauses
  preserve in-kind exits. The paused guardian cannot seize assets.
- Maturity stops new issuance while unresolved claims remain withdrawable in
  kind. Finalization also blocks issuance. Returned claims can be redeemed through
  the ordinary core, including burning a zero-payout N claim.
- The final holder receives every remaining quantity; managed assets and share
  supply reach zero together. Closure is permanent: neither new bootstrap nor
  replacement policy is accepted.
- Risk view returns POLICY_UNSELECTED, null NAV and disabled keeper authority.
  No maker or current reference is needed to recover the actual in-kind basket.

Each rejected vault action compares its pre/post vault, actor ledgers, series and
protocol fees. Full event replay covers every successful transition, including
the holder capacity test. All 105 events validate against the generated schema.

The G3 regression retains real failed collateral/storage transfers, successful
payouts followed by callback panic/gas failure, duplicate callbacks, 64 retained
tickets and UNKNOWN quarantine on the new binary. The G5 regression retains
signature/domain/nonce cancellation, funded pairs, competing makers and direct
rolls. Those regressions run with no initialized vault; they do not prove every
combined vault/market/withdrawal interleaving.

## Costs and remaining boundaries

At the queried local storage price, creation prepays 4096 bytes / 0.04096 NEAR,
plus one yocto. Existing registered accounts need no separate share registration;
the bounded holder map is covered by vault storage. Each mint, exit, share transfer
or pause pays one yocto from the caller's wallet, separately from managed assets.
Final custody reconciles three NEAR tracked collateral and fully covered retained
categories; vault cash is zero after the last exit and storage remains allocated.

Recorded gas is transaction-plus-receipt gas in the JSON evidence. The nine-asset
mint/exit cases and full holder-map transfers measure this bounded profile only;
they are not a throughput or production sizing benchmark. Every account and
operation is funded by Sandbox genesis, with no organic liquidity or performance
claim. No NAV, executable strategy return or USD tracking result is fabricated.

Still pending: independent review, broader state/interleaving/fuzz coverage,
approved economic policy and stressed-depth capacity, immutable VLT-02 policy
guards with authenticated current references, competing quote execution, roll
budgets/deferral, atomic RFQ-and-mint and cash-only exit conveniences, full token
receiver/resolver semantics, SDK/UI and public testnet evidence. The configured
100 Q share cap is a local arithmetic bound, not an approved liquidity capacity.
G7/G9 release and G10 production gates are not completed by these tests.

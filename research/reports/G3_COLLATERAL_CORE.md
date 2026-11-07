# G3: bounded public collateral core

7 November 2026. Local implementation and executable evidence; independent review
pending. This increment covers CORE-01/02/03 and the local ticket portion of
CORE-04. It uses the plan's internal-ledger fallback, not a token-standard claim.
G0 review and the remaining G1 integration gates are still open.

## Result and reproducibility

The final compiled-Wasm Sandbox run passed **27 named checks**, with **366 recorded
transactions** and **397 canonical events**. Expected failures are part of those
transactions; the runner checks their actual receipt outcomes. Account creation,
funding and the donation probe also execute locally but are not all included in
that transaction count. No public deployment or market observation is represented.

[Machine-readable evidence](g3-sandbox.json) records source and lockfile hashes,
Wasm hashes, transaction/receipt IDs and outcomes, gas, emitted events, final
custody views and runtime version. Source hashes bind the working tree beyond the
recorded base commit. All 27 source hashes and four artifact hashes were checked
against this run's files. The existing G1 source hashes and all 59 archived file
checksums remain unchanged, as does the user-authored implementation plan.

```sh
npm ci --prefix tests/sandbox --ignore-scripts
python3 scripts/build-core.py
node tests/sandbox/g3.mjs
```

Runtime: Rust 1.96.0, near-sdk 5.30.1, near-api-js 7.4.0, near-sandbox JS 0.3.5,
Sandbox node 2.14.0; this run used Node v24.8.0 on macOS ARM64. Dependencies are
locked in the separate contracts workspace and existing Sandbox package lock.
The harness starts and tears down an ephemeral local node. No API keys or wallet
files are required. See [core setup and ABI](../../contracts/README.md).

Normal clearinghouse Wasm: 394,191 bytes, SHA-256
`dbe1f4c1f47c0cd6a53835510b028d28c34a839a226ba6a5044f8533343a9c2c`.
The separate fault artifact is 400,262 bytes. Tests inspect the normal exports
and confirm that the fault methods are absent. Oracle/account fixtures are
explicit test infrastructure, not product oracle or account deployments.

## Acceptance evidence

| Ticket / dependency | Invariant and implemented behavior | Failure evidence | Reviewer |
|---|---|---|---|
| CORE-01 / G1 runtime; G0 review pending | Native free collateral, series reserves, storage, fees, operating allocation and in-flight obligations remain distinct | Underfunded storage, unregistered deposits, collateral/cap failures, excess release, donations without user credit; full custody/event reconciliation | Contracts/security — pending |
| CORE-02 / CORE-01, FIN-01, internal-ledger fallback | Immutable series and backed equal P/N creation; predecessor owns transfers/merges; supplies equal owned positions | Bad terms/oracle/units, duplicate or excessive series, unauthorized spending, cutoffs, late split and scoped pauses | Contracts/protocol — pending |
| CORE-03 / CORE-02, FIN-01; G4 oracle still pending | Shared checked coefficients and floor-rounded payouts; final price immutable; burn zero-payout claims; dust only after all claims burn | Nonfinal, zero, malformed, failed and config-mismatched oracle responses; forged callback; overwritten price, post-final merge, repeat burn and early dust rejected | Contracts/economics — pending |
| CORE-04 / CORE-01, G1 payout | Debit before dispatch; successful payout closes once; confirmed failure restores original category; unknown stays quarantined | Actual failed native transfers and storage refunds; successful transfer followed by callback panic/gas failure; duplicate callback, forged callback, unknown cleanup/resend attempts | Contracts/security — pending |

The reference comparison uses an independent BigInt ledger and integer division,
seed `0x51a7`, 40 pre-final randomized steps and **40 actual fragmented redemption
transactions**, followed by complete redemption. It checks balances, owned P/N,
reserves, minted/merged/burned amounts and payouts after each step. Separate
zero-payout and one-atomic-unit dust cases verify rounding exits.

An independent event replay consumes only successful receipt events, then compares
every live account's free/storage/P/N balances, series reserves/supplies, fees,
operating allocation and active withdrawal obligations with views. All 397 events
pass the generated shared schema. The draft schema now describes 18 client intent
shapes; it includes future RFQ/vault intents and is not a claim those methods exist.

Capacity coverage reaches 16 accounts, eight retained series and 64 terminal
withdrawal tickets, with live P/N holdings in five series and three closed series.
The next account, series and ticket are rejected without an accounting change.
This is not an exhaustive eight-active-series or simultaneous-callback stress test.
The normal end state has no pending/unknown payout; the fault instance deliberately
retains 200 atomic units as UNKNOWN even though real transfers succeeded.

## Observed local costs

Whole-transaction gas below includes recorded receipt execution. Rows select calls
with a successful terminal transaction status; a failed transfer restored by its
successful callback is included. Expected rejected calls are excluded.

| Normal-core method | Calls | Observed gas range (Tgas) |
|---|---:|---:|
| split | 100 | 4.094–16.054 |
| merge | 6 | 4.183–4.484 |
| redeem | 48 | 3.586–4.255 |
| request_withdrawal | 67 | 7.670–31.903 |
| unregister | 2 | 7.544–7.553 |
| request_resolution | 9 | 8.726–9.395 |

Normal withdrawal callbacks consumed 2.787–14.901 Tgas against a 40-Tgas allocation.
These samples show headroom in this run, not a worst-case gas proof or testnet
benchmark. Full-profile normal account storage was 409,157 bytes including code.
The queried protocol storage price was `10000000000000000000` yoctoNEAR/byte.
Each account/series prepays 4,096 bytes; a separately prefunded 20-NEAR operating
allocation covers code/operations and temporary refund storage. Sandbox account
bootstrap includes additional unallocated funds; it is not a measured deployment
budget. Both final custody snapshots cover their retained accounting categories.

## Verification and limits

Also passed: five Python reference tests, regeneration checks for 565 shared
vectors, all three locked Rust workspace tests, root format/Clippy, normal and
fault contract Wasm Clippy with warnings denied, contract formatting, schema
generation check and nine schema test groups. The payoff library is reused
unchanged. These checks do not constitute a formal proof or independent audit.

The bounded profile is intentionally small: eight **lifetime** series slots,
16 registered accounts, four retained tickets per account, 100-NEAR per-series
pair supply and 1,000-NEAR tracked collateral cap. Closed series remain allocated;
permissionless creation can exhaust the development series capacity. Public
capacity allocation, fees and larger limits require further design/review.

Storage price is pinned from runtime configuration at initialization and must be
reassessed if protocol economics change. Full-access deployment keys remain a
trust boundary even though the contract has no upgrade method. Account and series
allowances plus bootstrap storage are local-profile funding, not reviewed
production economics. UNKNOWN recovery intentionally has no privileged refund or
resend route; a reviewed authenticated recovery mechanism and CLI are still open.

The G3 admin-controlled oracle fixture only tests authenticated import. G4 must
implement committed observations, proposal/challenge/finality, bonds and failure
hierarchy; the fixture provides no source-authenticity guarantee. Token standard
conformance, wallet/indexer integration, market, vault and full application remain
unfinished. G2 liquidity/stress/policy experiments and G4 product settlement are
the next work; no policy is selected from these payoff-only checks. Production
remains disabled and G9 remains the hackathon release gate.

Relevant runtime guidance: [NEAR callback failures](https://docs.near.org/smart-contracts/security/cross-contract-calls/callback-failures)
describes the separate failure boundary exercised here;
[storage staking](https://docs.near.org/protocol/storage/storage-staking) explains
why native custody and storage funding must be reconciled separately.

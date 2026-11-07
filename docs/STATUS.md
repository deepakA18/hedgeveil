# Implementation status

Reconciled 7 November 2026 against the Open Innovation revision of
[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The plan defines the target;
this file records evidence. Documents and fixtures alone do not complete a gate.

| Gate | Current evidence | Remaining exit evidence |
|---|---|---|
| G0 specification | Public SPEC, threat model, accounting assumptions, ADRs, draft schema v0.2 | Independent review; pin wire encodings, IDs, caps and unresolved choices |
| G1 feasibility — partial | Pinned local Wasm/Sandbox harness, FT/MT resolver experiments, synthetic oracle lifecycle and real payout callback faults | Independent G0 review, complete token conformance/wallet/indexer decision and testnet measurements; production recovery/source limits remain separate |
| G2 economics | Rational model, checked Rust payoff library, 565 shared vectors | Liquidity/delay scenarios, four policies, benchmarks, held-out evaluation and failure envelope |
| G3 collateral core | Not implemented | Custody/storage, series, split/transfer/merge/redeem, withdrawals and compiled-Wasm receipt tests |
| G4 settlement | G1 synthetic proposal/challenge/finality/delay and authenticated-import experiment | Product oracle/collector, bond release/slashing, full failure hierarchy and evidence UI |
| G5 market | Draft quote schema only | Registered signing keys, funded fills, nonce/cancellation handling, two makers and direct rolls |
| G6 vault | Proportional basket/exit specification only | Shares, bounded keeper, last-holder rounding, no-bid/stale-reference exits and policy selection |
| G7 application | Not implemented | SDK, wallet/UI, indexer, recovery CLI and working local/testnet modes |
| G8 adversarial | Arithmetic/schema checks plus G1 compiled-Wasm fault cases | Product stateful properties, full Sandbox faults, models/proof scope, load tests, independent review/remediation |
| G9 hackathon release | Not started | Complete no-paid-key testnet demo, real receipts and disclosure/submission bundle |
| G10 capped pilot | Separate, optional; blocked | Independent historical oracle, reviewed unknown-payout recovery, custody/key audit, limits and incident drills |
| G11 expansion | Out of initial release | Pilot evidence and specification/review for each new trust boundary |

## Retained verification

Five Python financial tests include 2,000 seeded rational identity cases and
1,000 fragmentation cases. Two Rust unit tests and one differential test cover
565 shared vectors. Nine public-schema test groups cover 12 transaction intent
shapes, public accounting, domain/amount constraints, vault baskets and withdrawal
restoration restrictions. Offline schema validity is not authorization or
signature verification.

Commands are in [README](../README.md). The [G1 report](../research/reports/G1_PUBLIC_LEDGER.md)
and source-hashed [receipt evidence](../research/reports/g1-sandbox.json) record
the new experiments. Normal and explicit fault-injection Wasm run in ephemeral
Sandbox accounts only. No public product deployment, wallet application or
complete demo exists. The scope-reconciliation report remains a historical record
of the earlier migration, not the latest implementation status.

## Next increment

Complete G0 review and the remaining G1-TOKEN/integration decisions in
[BACKLOG](BACKLOG.md), then implement G3 in Sandbox using the measured runtime and
receipt boundaries. G2 can progress alongside
core work; do not select a final vault policy from payoff-only tests. Production
oracle sourcing and verified payout recovery remain separate from testnet.

The prior proof, verifier deployment, public AI attestation checks, completion
tooling and original specifications are preserved in
[archive/privacy-track](../archive/privacy-track/README.md). They are not active
dependencies or evidence for revised G1/G8 gates. The old account was not changed
or deleted. Local `.env` values were not changed during migration.

# Implementation status

Reconciled 7 November 2026 against the Open Innovation revision of
[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The plan defines the target;
this file records evidence. Documents and fixtures alone do not complete a gate.

| Gate | Current evidence | Remaining exit evidence |
|---|---|---|
| G0 specification | Public SPEC, threat model, accounting assumptions, ADRs, draft schema v0.2 | Independent review; pin wire encodings, IDs, caps and unresolved choices |
| G1 feasibility — partial | Pinned local Wasm/Sandbox harness, FT/MT resolver experiments, synthetic oracle lifecycle and real payout callback faults | Independent G0 review, complete token conformance/wallet/indexer decision and testnet measurements; production recovery/source limits remain separate |
| G2 economics — local experiment implemented | Rational/Rust payoff agreement; 9,180 synthetic strategy runs, four policy families, finite makers, 612 benchmark runs, held-out results and failure envelope | No rolling candidate passes frozen training gates; independent review, broader market assumptions and G5 execution validation; vault policy unselected |
| G3 collateral core — local implementation | Bounded public ledger, separate storage/refunds, immutable series/P/N, split/transfer/merge, rounded redemption/dust, scoped pauses, native tickets, canonical events and compiled-Wasm tests | Independent review, broader adversarial/load coverage, production key/recovery controls; full SDK/CLI remains G7 |
| G4 settlement | G1 synthetic lifecycle; G3 request/version/config-bound import exercised with a clearly labelled oracle fixture | Product oracle/collector, bond release/slashing, full failure hierarchy and evidence UI |
| G5 market | Draft quote schema only | Registered signing keys, funded fills, nonce/cancellation handling, two makers and direct rolls |
| G6 vault | Proportional basket/exit specification only | Shares, bounded keeper, last-holder rounding, no-bid/stale-reference exits and policy selection |
| G7 application | Not implemented | SDK, wallet/UI, indexer, recovery CLI and working local/testnet modes |
| G8 adversarial | Arithmetic/schema checks, G1 faults, G3 seeded stateful ledger comparison, event replay and capacity/receipt faults | Broader fuzz/interleavings/load coverage, models/proof scope and independent review/remediation |
| G9 hackathon release | Not started | Complete no-paid-key testnet demo, real receipts and disclosure/submission bundle |
| G10 capped pilot | Separate, optional; blocked | Independent historical oracle, reviewed unknown-payout recovery, custody/key audit, limits and incident drills |
| G11 expansion | Out of initial release | Pilot evidence and specification/review for each new trust boundary |

## Retained verification

Five Python financial tests include 2,000 seeded rational identity cases and
1,000 fragmentation cases. Two Rust unit tests and one differential test cover
565 shared vectors. Nine public-schema test groups cover 18 transaction intent
shapes, public accounting, domain/amount constraints, vault baskets and withdrawal
restoration restrictions. Offline schema validity is not authorization or
signature verification.

Fifteen G2 test groups check funded execution, failed-fill rollback, delayed
settlement, permanent resolution loss, future-data independence, depth/capital
limits, metrics and training-only selection. Eighty-one analytic/binomial pricing
cross-checks accompany the synthetic experiment. See [G2 report](../research/reports/G2_ECONOMICS.md).

Commands are in [README](../README.md). The [G1 report](../research/reports/G1_PUBLIC_LEDGER.md)
and [G3 report](../research/reports/G3_COLLATERAL_CORE.md) link source-hashed
receipt evidence. The core reuses the unchanged payoff library. Normal and
explicit fault-injection Wasm run in ephemeral
Sandbox accounts only. No public product deployment, wallet application or
complete demo exists. The scope-reconciliation report remains a historical record
of the earlier migration, not the latest implementation status.

## Next increment

The documented internal-ledger fallback is the current interface decision; no
standards conformance is claimed. G0 independent review and G1 integration gaps
remain open, so local G3 implementation does not imply those gates passed.
Next advance ORC-01/02/G4 product settlement in [BACKLOG](BACKLOG.md). FIN-02's
first synthetic experiment is reproducible but selects no passing rolling policy;
revising economic assumptions requires a new experiment/holdout and review. Production
oracle sourcing and verified payout recovery remain separate from testnet.

The prior proof, verifier deployment, public AI attestation checks, completion
tooling and original specifications are preserved in
[archive/privacy-track](../archive/privacy-track/README.md). They are not active
dependencies or evidence for revised G1/G8 gates. The old account was not changed
or deleted. Local `.env` values were not changed during migration.

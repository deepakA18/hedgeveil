# Implementation status

Reconciled 8 November 2026 against the Open Innovation revision of
[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The plan defines the target;
this file records evidence. Documents and fixtures alone do not complete a gate.

| Gate | Current evidence | Remaining exit evidence |
|---|---|---|
| G0 specification | Public SPEC, threat model, accounting assumptions, ADRs, draft schema v0.2 | Independent review; pin wire encodings, IDs, caps and unresolved choices |
| G1 feasibility — partial | Pinned local Wasm/Sandbox harness, FT/MT resolver experiments, synthetic oracle lifecycle and real payout callback faults | Independent G0 review, complete token conformance/wallet/indexer decision and testnet measurements; production recovery/source limits remain separate |
| G2 economics — local experiment implemented | Rational/Rust payoff agreement; 9,180 synthetic strategy runs, four policy families, finite makers, 612 benchmark runs, held-out results and failure envelope; G5 adds a local execution sample | No rolling candidate passes frozen training gates; independent review, broader market assumptions and testnet/load execution validation; vault policy unselected |
| G3 collateral core — local implementation | Bounded public ledger, separate storage/refunds, immutable series/P/N, split/transfer/merge, rounded redemption/dust, scoped pauses, native tickets, canonical events and compiled-Wasm tests | Independent review, broader adversarial/load coverage, production key/recovery controls; local collateral CLI now in G7; complete SDK/browser flows remain |
| G4 settlement — local demo implementation | Committed synthetic archive/replay, authenticated publishers, bonded proposals/challenges, fallback/arbitration/delay, immutable resolution import and bond-credit custody | Independent review, broader timing/load/interleaving coverage, G7 evidence UI/indexing; production historical sources and economic bond sizing remain G10 |
| G5 market — local implementation | Registered Ed25519 keys, funded exact fills/pair issuance, durable nonce/epoch cancellation, two separate maker processes, atomic direct rolls and receipt/event reconciliation | Independent review, broader capacity/interleavings, testnet maker funding/measurements; relay/wallet flows remain G7 |
| G6 vault — local basket and experimental guards | Sandbox-only basket/share mechanics plus optional immutable one-shot roll, authenticated synthetic reference, competing maker execution, fee/loss/notional limits and deferred inflows with exits | Independent review, selected recurring policy/current-source trust, broader interleavings, RFQ-and-mint/cash-only conveniences and testnet deployment |
| G7 application — local APP-01 foundation | Exact-amount SDK with TypeScript declarations, deployment pins, durable submission journal and receipt recovery CLI; real Sandbox restart/payout-fault evidence | Browser wallet/storage and UX, remaining SDK writes, indexer/UI, complete local/testnet modes and independent review |
| G8 adversarial | Arithmetic/schema checks, G1 faults, G3 seeded stateful ledger comparison, event replay and capacity/receipt faults | Broader fuzz/interleavings/load coverage, models/proof scope and independent review/remediation |
| G9 hackathon release | Not started | Complete no-paid-key testnet demo, real receipts and disclosure/submission bundle |
| G10 capped pilot | Separate, optional; blocked | Independent historical oracle, reviewed unknown-payout recovery, custody/key audit, limits and incident drills |
| G11 expansion | Out of initial release | Pilot evidence and specification/review for each new trust boundary |

## Retained verification

Five Python financial tests include 2,000 seeded rational identity cases and
1,000 fragmentation cases. Two Rust unit tests and one differential test cover
565 shared vectors. Eleven public-schema test groups cover 29 transaction intent
shapes, public accounting, domain/amount constraints, vault baskets and withdrawal
restoration restrictions. Offline schema validity is not authorization or
signature verification.

Fifteen G2 test groups check funded execution, failed-fill rollback, delayed
settlement, permanent resolution loss, future-data independence, depth/capital
limits, metrics and training-only selection. Eighty-one analytic/binomial pricing
cross-checks accompany the synthetic experiment. See [G2 report](../research/reports/G2_ECONOMICS.md).

G4 adds six collector/schema test groups and 38 compiled-Wasm checks with 174
recorded transactions and 151 validated oracle events. Its normal clearinghouse
artifact at that recorded revision is byte-identical to G3. See [G4 evidence](../research/reports/G4_SETTLEMENT.md)
for sample/capacity coverage, costs and remaining review limits.

G5 adds four signing-codec tests, two public binary vectors and 29 compiled-Wasm
checks: 97 transactions, 61 canonical ledger events and 11 signed fills (four
from the two maker processes). The new core also passes the complete G3 lifecycle,
capacity and withdrawal-fault regression. See [G5 evidence](../research/reports/G5_FUNDED_MARKET.md).
Maker marks/demand are synthetic; funding is Sandbox genesis capital. Production
price feeds, continuous maker monitoring and independent economic/security review
remain open. Original G3/G4 receipts remain historical evidence for their artifacts.

G6 VLT-01 adds 15 compiled-Wasm basket checks, with 132 recorded transactions and
105 validated events. An independent integer model and event replay cover
rounding, ownership and custody, including nine assets and all 16 holder slots.
The new binary also passes G3 lifecycle/fault and G5 market regressions, recorded
separately. See [G6 evidence](../research/reports/G6_BASKET.md). This is a Sandbox
basket profile with no approved policy, NAV or enabled keeper.

VLT-02 now adds 13 guard checks, 136 transactions and 119 canonical events across
three fresh Sandbox cores. Two funded maker processes provide competing quotes
and a separate planner proposes one actual atomic vault roll. Reference freshness,
immutable budgets, deferral/exit paths and post-roll issuance are exercised.
G3, G5 and basket regressions pass on the new artifact. See
[keeper evidence](../research/reports/G6_KEEPER.md). This one-shot profile remains
experimental; economic policy selection and independent source/review gates stay open.

APP-01 adds 13 client unit tests, TypeScript checks and 19 compiled-Wasm checks:
31 recorded transactions, 31 canonical events and 17 retained finalized RPC
responses. CLI merge, redemption and in-kind exit recover across fresh processes;
lost deposit responses cannot cause a repeat submission from the retained journal.
Callback panic/gas faults remain UNKNOWN despite successful native payouts. See
[client evidence](../research/reports/G7_LOCAL_CLIENT.md). This is a local Node
client, not a browser wallet, indexer or verified on-chain recovery mechanism.

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
MKT-01/02 and VLT-01/02 now have local implementation/evidence, with VLT-02
limited to an experimental one-shot Sandbox policy. APP-01 now has its local
SDK/journal/CLI foundation. Next is INF-01 finalized event indexing and
reconciliation, followed by the remaining APP-01 browser wallet and APP-02 UI
flows in [BACKLOG](BACKLOG.md). Economic selection, reviewed current
reference sources and independent review remain unresolved; no approved recurring
strategy or testnet vault is enabled. See [keeper evidence](../research/reports/G6_KEEPER.md).
G4's demo lifecycle and collector are local implementations; see the
[G4 report](../research/reports/G4_SETTLEMENT.md). FIN-02's
first synthetic experiment is reproducible but selects no passing rolling policy;
revising economic assumptions requires a new experiment/holdout and review. Production
oracle sourcing and verified payout recovery remain separate from testnet.

The prior proof, verifier deployment, public AI attestation checks, completion
tooling and original specifications are preserved in
[archive/privacy-track](../archive/privacy-track/README.md). They are not active
dependencies or evidence for revised G1/G8 gates. The old account was not changed
or deleted. Local `.env` values were not changed during migration.

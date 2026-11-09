# Implementation status

Reconciled 9 November 2026 against the Open Innovation revision of
[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The plan defines the target;
this file records evidence. Documents and fixtures alone do not complete a gate.

| Gate | Current evidence | Remaining exit evidence |
|---|---|---|
| G0 specification | Public SPEC, threat model, accounting assumptions, ADRs, draft schema v0.2 | Independent review; pin wire encodings, IDs, caps and unresolved choices |
| G1 feasibility — partial | Pinned local Wasm/Sandbox harness, FT/MT resolver experiments, synthetic oracle lifecycle and real payout callback faults | Independent G0 review, complete token conformance/wallet/indexer decision and testnet measurements; production recovery/source limits remain separate |
| G2 economics — local experiment implemented | Rational/Rust payoff agreement; 9,180 synthetic strategy runs, four policy families, finite makers, 612 benchmark runs, held-out results and failure envelope; G5 adds a local execution sample | No rolling candidate passes frozen training gates; independent review, broader market assumptions and testnet/load execution validation; vault policy unselected |
| G3 collateral core — local implementation | Bounded public ledger, separate storage/refunds, immutable series/P/N, split/transfer/merge, rounded redemption/dust, scoped pauses, native tickets, canonical events and compiled-Wasm tests | Independent review, broader adversarial/load coverage, production key/recovery controls; local collateral CLI now in G7; complete SDK/browser flows remain |
| G4 settlement — local demo implementation | Committed synthetic archive/replay, authenticated publishers, bonded proposals/challenges, fallback/arbitration/delay, immutable resolution import and bond-credit custody | Independent review, broader timing/load/interleaving coverage, broader browser evidence/fault coverage and public testnet indexing; production historical sources and economic bond sizing remain G10 |
| G5 market — local implementation | Registered Ed25519 keys, funded exact fills/pair issuance, durable nonce/epoch cancellation, two separate maker processes, atomic direct rolls and receipt/event reconciliation | Independent review, broader capacity/interleavings, testnet maker funding/measurements; relay/wallet flows remain G7 |
| G6 vault — local basket and experimental guards | Sandbox-only basket/share mechanics plus optional immutable one-shot roll, authenticated synthetic reference, competing maker execution, fee/loss/notional limits and deferred inflows with exits | Independent review, selected recurring policy/current-source trust, broader interleavings, RFQ-and-mint/cash-only conveniences and testnet deployment |
| G7 application — local SDK, indexer and APP-02 UI | Exact SDK/journal/CLI and PostgreSQL replay/reconciliation; six browser views with real funding, RFQs, basket entry/exit, settlement, payout recovery and maker controls; 35 browser checks | Public wallet/testnet conformance, full demo orchestration/crash drills, remaining SDK/strategy UX and browser fault coverage, operator notifications/load/accessibility checks and independent review |
| G8 adversarial — bounded local SEC-01 | Arithmetic/schema checks; finite withdrawal/oracle/import/reserve models; 32 bounded SMT obligations; multi-seed signed-trade/ledger comparison, event replay, capacity and receipt faults | General cross-module/concurrent schedules and sustained load, broader symbolic/refinement scope, independent SEC-02 review and remediation |
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
client, not a browser wallet or verified on-chain recovery mechanism. INF-01 now
supplies the separate indexer below.

INF-01 adds five replay/transport tests, a real PostgreSQL transaction/restart/API
suite and 21 compiled-Wasm acceptance checks across normal core, fault core and
real demo oracle. The worker discovers transactions from finalized block history,
retains linked outcomes and publishes only after exact custody/sequence matching.
Fresh-process restart and a fresh-schema rebuild reproduce balances; missing
events, RPC outages and mismatches preserve the prior cursor with risk disabled.
See [indexer evidence](../research/reports/G7_INDEXER.md). Production, archival/load
validation, operator notifications and independent review remain open.

APP-02 adds a neutral local browser desk, ephemeral Sandbox signing gateway and
two funded maker workers. Its 35 browser checks retain 43 real deployment/method
transactions and cover lost HTTP/signing responses without resend, quote/asset
checks, basket entry/exit, disputed settlement, actual payout failure and maker
cancellation/key controls. The SDK now has 14 builders and 14 unit groups; shared
portable amount parsing keeps browser and CLI integers aligned. See
[APP-02 evidence](../research/reports/G7_APP.md) and [application usage](APP.md).
Browser wallet/testnet acceptance and independent review remain pending.

DEM-01 adds named local create/resume with retained chain/database, generated test
keys, maker nonce reservations and SDK journal. 24 lifecycle checks preserve
identity/ownership without reseeding, keep uncertain sends unresolved and execute
a real exit after resume. Three focused state/permission tests and the existing
35 browser checks pass. See [restart evidence](../research/reports/G7_DEMO_RESUME.md).
This covers clean local stops; public wallets, testnet, full fresh-clone/demo
orchestration, broader crash/incident drills and independent review stay open.

SEC-01 adds finite models reaching fixed points for withdrawals, oracle lifecycle,
overlapping resolution imports and reserve redemptions, with ten unsafe model
mutation counterexamples. Separate bounded integer SMT checks pass 32 obligations
at eight complementary coefficients and the configured supply cap; a rounding-up
mutation produces a checked counterexample. The compiled-Wasm stateful profile
now mixes signed P/N trades, failed late-leg fills, nonce replay, finalized
transfers and fragmented redemptions, retaining real fault/capacity/event checks.
Three seeds pass 28 checks each: 480 stateful steps, 75 signed fills, 1,463
recorded transactions and 1,406 reconciled events, with observed gas/storage at
the local caps.
See [SEC-01 evidence, measurements and limits](../research/reports/G8_SECURITY.md).
These are local bounded tests, not an independent audit or Rust/runtime refinement
proof; G8 remains open for broader schedules/load and SEC-02 review.

SEC-02 now has a local review-bundle generator and offline integrity verifier,
with an exact committed candidate, normal/fault Wasm separation and current versus
historical evidence inventory. Twelve negative/roundtrip tests and a real package
verification pass. See [review handoff](SECURITY_REVIEW.md). Independent review,
finding disposition and release approval remain pending; packaging is not sign-off.

Commands are in [README](../README.md). The [G1 report](../research/reports/G1_PUBLIC_LEDGER.md)
and [G3 report](../research/reports/G3_COLLATERAL_CORE.md) link source-hashed
receipt evidence. The core reuses the unchanged payoff library. Normal and
explicit fault-injection Wasm run in ephemeral
Sandbox accounts only. A disposable local UI demo now exists; no public product deployment, external
wallet integration or complete G9 release demo exists. The scope-reconciliation report remains a historical record
of the earlier migration, not the latest implementation status.

## Next increment

The documented internal-ledger fallback is the current interface decision; no
standards conformance is claimed. G0 independent review and G1 integration gaps
remain open, so local G3 implementation does not imply those gates passed.
MKT-01/02 and VLT-01/02 now have local implementation/evidence, with VLT-02
limited to an experimental one-shot Sandbox policy. APP-01 now has its local
SDK/journal/CLI foundation, and INF-01 has local PostgreSQL indexing, reconciliation
and a read API. APP-02 now supplies the local UI and durable browser pointers.
DEM-01 now retains the local deployment across clean process stops. SEC-01 adds
the local bounded model/SMT/stateful suite. Next are SEC-02's independent review
of an exact release candidate, public wallet/testnet integration under APP-01/02 and the complete fresh-clone
DEM-01 release workflow in [BACKLOG](BACKLOG.md). Economic selection, reviewed current
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

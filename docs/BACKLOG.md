# Open Innovation backlog

Updated 8 November 2026. FIN-01/SEC-01 and the four G1 feasibility tasks have
implemented portions. CORE-01/02/03/04 now have a bounded Sandbox implementation;
FIN-02 now has a reproducible synthetic experiment with no passing rolling-policy
candidate. ORC-01/02 now have a local G4 demo oracle/collector implementation.
MKT-01/02 now have local G5 market/maker implementation and receipt evidence.
VLT-01 has Sandbox basket mechanics; VLT-02 has an experimental one-shot guard.
Economic strategy selection and independent review remain pending.
APP-01 now has a local SDK/journal/CLI foundation; browser/testnet acceptance remains pending.
INF-01 now has local PostgreSQL replay/reconciliation, API, metrics and alerts;
public testnet/load/operational acceptance remains pending. APP-02 has the local
UI and browser evidence. DEM-01 now has explicit create/resume for retained local
state; public-wallet/testnet and full release acceptance remain pending. G1
fixtures are not product implementations.
Reviewer roles must be assigned and do not constitute
sign-off. G0 independent review remains pending. The root plan is authoritative.

## Immediate feasibility (G1)

| Task | Dependencies | Invariant | Failure path / completion evidence | Reviewer |
|---|---|---|---|---|
| G1-RUNTIME | G0 units/accounting review | Tested Wasm matches pinned toolchain/source | Pin supported SDK/Sandbox/client; execute deposit/transfer/callback smoke, record gas/storage/hashes; fail incompatible toolchain | Contracts/infrastructure |
| G1-TOKEN | G1-RUNTIME | P/N/share supply, balance and registration namespaces separate | Combined NEP-245 and NEP-141/145/148, wallet/indexer checks; receiver burns/partial returns/failures and storage/unregister tests; document internal-ledger fallback | Contracts/integrations/security |
| G1-ORACLE | G0 observation definition, G1-RUNTIME | Only bound authenticated final record sets price | Synthetic evidence restart replay, proposal/challenge/deadline/delayed paths and wrong request/config/window callbacks; production source limits recorded separately | Oracle/contracts |
| G1-PAYOUT | G0 custody model, G1-RUNTIME | One payout or one restoration, never both | Success, failure, duplicate callback, callback gas exhaustion and success then callback failure; UNKNOWN persists without timeout resend/refund; production recovery gap documented | Contracts/security |

Local evidence now lives in [G1_PUBLIC_LEDGER](../research/reports/G1_PUBLIC_LEDGER.md).
G1-RUNTIME has pinned compiled-Wasm receipt evidence on macOS ARM64, with no
testnet/cross-platform measurement yet. G1-TOKEN has namespace and adversarial
resolver evidence, but full MT conformance and wallet/indexer compatibility are
pending; use the internal-ledger product path meanwhile. G1-ORACLE demonstrates
the synthetic lifecycle and immutable authenticated bindings, with product bond
flows/collector left to G4. G1-PAYOUT demonstrates success, restoration and UNKNOWN
quarantine, including callback panic/gas exhaustion; production verified recovery
remains unimplemented. Independent G0 review is still pending.

The internal-ledger fallback is now implemented in G3; this does not close the
independent-review or wallet/indexer gates. See [G3 evidence](../research/reports/G3_COLLATERAL_CORE.md).
G2's first comparison is in [G2 evidence](../research/reports/G2_ECONOMICS.md).
No candidate passes its frozen training gates; G6 policy selection stays open.
G4's local settlement evidence is in [G4 results](../research/reports/G4_SETTLEMENT.md).
G5's local funded execution is in [G5 results](../research/reports/G5_FUNDED_MARKET.md).
G6 VLT-01 evidence is in [G6 results](../research/reports/G6_BASKET.md).
VLT-02 local guard evidence is in [keeper results](../research/reports/G6_KEEPER.md).
APP-01 local receipt evidence is in [client results](../research/reports/G7_LOCAL_CLIENT.md).
INF-01 local execution is in [indexer results](../research/reports/G7_INDEXER.md).
APP-02 local execution is in [browser results](../research/reports/G7_APP.md).
DEM-01 clean restart evidence is in [retained-demo results](../research/reports/G7_DEMO_RESUME.md).
SEC-01 bounded models, SMT obligations and seeded contract evidence are in
[security results](../research/reports/G8_SECURITY.md); independent review and
broader load/interleaving acceptance remain pending. Next are SEC-02 candidate
review, public wallet/testnet integration and the full release walkthrough;
further economic experiments require a new holdout. Actual local fills
do not resolve FIN-02's failed policy selection.

## Implementation epics

| Epic / gate | Dependencies | Invariant | Failure path / completion artifact | Reviewer |
|---|---|---|---|---|
| FIN-01 / G0–G2 — partial | G0 | Complementarity, bounded payouts, explicit units | Retained rational/Rust code and 565 vectors; independent dimensional/fee/rounding review and limits; reject bad strike/units/overflow | Economics/protocol |
| FIN-02 / G2 — local experiment implemented; selection failed | FIN-01; independent G0/economics review pending | Funded simulation conserves collateral; executable outcomes distinct from marks/solvency | 9,180 strategy runs, 612 benchmarks, four policy families, frozen train/holdout seeds and published crash/no-bid/delay/maker-exit/disagreement losses; no passing candidate; G5 adds a local execution sample, while testnet/load validation and broader reviewed assumptions remain | Quant/economics — pending |
| CORE-01 / G3 — locally implemented | G0 review pending, G1-RUNTIME | Collateral/storage/operations/fees/in-flight categories isolated | Bounded custody/storage ledger, excess release and registration refund, donation/cap failures and full event replay; independent review/production limits pending | Contracts/security |
| CORE-02 / G3 — locally implemented | CORE-01, internal-ledger fallback, FIN-01 | Exact backed pairs, immutable terms, series isolation | Public series/P/N split/transfer/merge, caps/cutoffs/permissions and seeded stateful comparison; no token callback/standards surface | Contracts/protocol |
| CORE-03 / G3–G4 — local core implemented | CORE-02, FIN-01; ORC-02 for product oracle | Rounded payouts bounded by reserves; claims burn once | Fixture-backed authenticated import, zero-payout burns, fragmentation, late-merge/dust-sweep rejection; G4 must replace the oracle fixture | Contracts/economics |
| CORE-04 / G3, G10 — local tickets implemented | CORE-01, G1-PAYOUT | Debit first, confirmed restoration once | Collateral/storage-refund tickets, private callbacks, quarantine and cleanup; success-then-callback-failure and duplicate results; local collateral receipt CLI in APP-01; storage/oracle-credit CLI and reviewed production recovery pending | Contracts/security |
| ORC-01 / G4 local demo implemented, G10 sources pending | G0 review pending, G1-ORACLE | Historical M, fixed units/window | Committed synthetic source objects, content-addressed archive and separate-process replay; missing/corrupt/inverse/stale/zero rejection; no production collector/vendor or independent source claim | Oracle/data — pending |
| ORC-02 / G4 local demo implemented | ORC-01, CORE-02 | One-way finality, immutable request binding and bond conservation | Publisher authentication; bonded proposal/challenge; historical fallback/adjudication/delay; real core callback import; credits, slashing/refunds and failed/unknown native transfers. G7 browser evidence UI/public testnet indexing and independent review remain | Oracle/contracts/security — pending |
| MKT-01 / G5 — locally implemented | CORE-01/02, FIN-02 experiment; independent reviews pending | Funded exact legs/fees atomic, nonce used once | Registered keys, distinct trade/pair encodings, 256 nonce slots/epoch, revocation and unregister persistence; 29 Sandbox checks reject invalid/replayed/stale/unfunded fills and exercise both cancellation orderings. Broader concurrency/capacity and independent review pending | Market/contracts/security — pending |
| MKT-02 / G5 — locally implemented | MKT-01, FIN-02 experiment; policy selection remains open | Maker escrow ownership, atomic direct rolls | Two separate processes, four actual maker fills, integer spreads, TTL/inventory/position/loss guards and receipt-backed epoch cancellation; synthetic marks, P/L, subsidy and no-maker outcomes published. Testnet, relay, continuous monitoring and broader depth/load evidence pending | Market/quant — pending |
| VLT-01 / G6 — local basket mechanics | CORE-03, ORC-02, MKT-01; FIN-02 policy/review unresolved | Basket entry/exit does not dilute holders | Immutable seed, ceil mint/floor exit, internal share transfer, last-holder allocation and closure; compiled-Wasm model/event reconciliation, donations, dust/minima, maturity/pauses and holder-capacity checks. No receiver callbacks/token interface, selected policy or testnet vault; review and RFQ convenience flows pending | Contracts/economics — pending |
| VLT-02 / G6 — experimental local guard | VLT-01, MKT-02; FIN-02 selection/review pending | Keeper policy-bound with no managed withdrawal authority | Pre-bootstrap immutable one-shot Sandbox terms; authenticated synthetic reference, signed full-old/new roll, four-series/maturity/fee/loss/notional guards, persistent deferral and exits. Actual competing maker fill and regressions; recurring economic policy, source independence, broader interleavings and testnet remain pending | Quant/contracts/security — pending |
| APP-01 / G7 — local foundation | CORE-02/03/04, MKT-01, VLT-01; independent review pending | SDK/contract units, deployment domain and finalized receipt states agree; retained local operation submits at most once | 14 exact-amount builders with TypeScript declarations, durable journal and local CLI; 14 unit tests and 19 real Sandbox checks cover restart, lost response, wrong deployment, repeat prevention and withdrawal callback faults. APP-02 adds durable browser pointers and local signing UX; public browser wallet, remaining methods, testnet and independent review pending | Product/contracts/security — pending |
| APP-02 / G7 — local UI implemented | APP-01, VLT-02, INF-01; wallet/policy/reviews remain partial | Actual ownership and finalized receipts; no duplicate send or invented NAV/exit | Six views, same-block exact previews, durable browser pointers, receipt/evidence recovery and maker authorization controls; 35 actual browser checks / 43 recorded transactions. Public wallet/testnet, persistent demo, wider browser/fault/accessibility coverage and independent review pending; see G7_APP report | Product/QA/security — pending |
| INF-01 / G7 — local implementation | CORE-01 events; ORC-02/MKT-01/VLT-01/02; APP-01 units/domain | Finalized replay and same-block views reconcile; gaps/failures never advance accepted cursor or resend funds | PostgreSQL atomic cursor/projections, receipt/log dedup, parent-hash backfill, read API/metrics and withdrawal/oracle/keeper notices; 21 actual Sandbox checks plus PostgreSQL rollback/restart/concurrent-writer tests. Quote depth explicitly unobserved; testnet, archival/load validation, notifications and independent review pending | Infrastructure/contracts/security — pending |
| DEM-01 / G7–G9 — retained local lifecycle | G1, FIN-02, APP-01/02, INF-01; public wallet/policy/reviews partial | Resume retains chain, journal and nonce history without reseeding or repeat sends | Named create/resume, private generated-key/node/database retention, stable browser origin and fail-closed guards; clean fresh-process restart and actual per-action local costs. Full orchestration/fresh-clone acceptance, testnet funding/costs and independent review pending | Release/QA/security — pending |
| SEC-01 / G8 — bounded local suite implemented | FIN-01 and available G3–G7 implementations; public integration/reviews partial | Plan §15 invariants survive the documented bounded adversarial scope | Finite withdrawal/oracle/import/reserve fixed points, ten unsafe model controls; 32 SMT obligations plus rounding counterexample; multi-seed signed trades and ledger/fault/capacity replay with real receipts and measured gas/storage. Existing differential/schema/browser evidence retained. General concurrency/load and broader symbolic/refinement scope remain open; see G8_SECURITY | Security/QA — pending |
| SEC-02 / G8, G10 | SEC-01, exact candidate source/Wasm | Review claims match shipped artifacts/scope | Independent review, symbolic/formal coverage limits, critical/high fixes and regressions; no unsupported audit claim | Independent security reviewer |
| REL-01 / G9 | G7–G8 testnet gates, DEM-01, SEC-02 testnet scope | Every demo/README claim reproducible | Testnet record, two makers, 12-step demo, reconciliation/recovery, submission bundle and fresh-clone/failed-frontend drill | Release owner |
| REL-02 / G10 — optional | G9, production ORC-01/02, CORE-04 recovery, SEC-02 | Trust/custody/caps explicitly accepted | Independent historical sources, audited authority, recovery/incident drills, liquidity stress, monitoring and capped release runbooks | Security/operations |

G9 completes the hackathon product. G10 production and G11 expansions do not
block that definition, but remain mandatory for their own deployments. No
G1-AI/G1-ZK, PRIV or encrypted-RFQ tasks remain active. Source attribution is
required; preparing submission text does not authorize posting it.

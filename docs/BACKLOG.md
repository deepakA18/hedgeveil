# Open Innovation backlog

Updated 7 November 2026. FIN-01/SEC-01 and the four G1 feasibility tasks have
implemented portions. Product epics remain pending; G1 fixtures are not product
implementations. Reviewer roles must be assigned and do not constitute
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

Finish those gate decisions, then implement G3 in Sandbox. G2 can
proceed alongside core work; final vault policy depends on its results.

## Implementation epics

| Epic / gate | Dependencies | Invariant | Failure path / completion artifact | Reviewer |
|---|---|---|---|---|
| FIN-01 / G0–G2 — partial | G0 | Complementarity, bounded payouts, explicit units | Retained rational/Rust code and 565 vectors; independent dimensional/fee/rounding review and limits; reject bad strike/units/overflow | Economics/protocol |
| FIN-02 / G2 | FIN-01 | Executable economics distinct from solvency | Seeded liquidity/capital model and four-policy held-out comparison; crash/no bids/delay/maker exit/disagreement and losing cases published | Quant/economics |
| CORE-01 / G3 | G0, G1-RUNTIME | Collateral/storage/operations/fees/in-flight categories isolated | Custody/storage ledger and reconciliation; registration, spam, wrong asset, donations and insufficient storage tests | Contracts/security |
| CORE-02 / G3 | CORE-01, G1-TOKEN, FIN-01 | Exact backed pairs, immutable terms, series isolation | Public series/P/N, split/transfer/merge; caps, duplicate IDs, cutoff by block time, unauthorized debits and partial batch rollback | Contracts/protocol |
| CORE-03 / G3–G4 | CORE-02, FIN-01; ORC-02 for live imports | Rounded payouts bounded by reserves; claims burn once | Mock settlement initially; finalized payout accounting, zero-payout burns, fragmented redemption, late merge and premature dust-sweep rejection | Contracts/economics |
| CORE-04 / G3, G10 recovery | CORE-01, G1-PAYOUT | Debit first, confirmed restoration once | Tickets/private callbacks/quarantine and recovery CLI; success then callback failure and duplicate results; reviewed production recovery separately | Contracts/security |
| ORC-01 / G4, G10 sources | G0, G1-ORACLE | Historical M, fixed units/window | Synthetic collector/evidence hashes/restart replay; missing/inverse/stale/zero failures; independent production sources/retention later | Oracle/data |
| ORC-02 / G4 | ORC-01, CORE-02 | One-way finality, immutable request binding | Versioned proposal/challenge/finality; equivocation, wrong-series/forged callbacks and arbitrator timeout; delay on total failure | Oracle/contracts/security |
| MKT-01 / G5 | FIN-02, CORE-01/02 | Funded exact legs/fees atomic, nonce used once | Registered keys, domain-separated encoding, fills/cancellation; replay/revocation/stale/reused inventory/cancellation races rejected | Market/contracts/security |
| MKT-02 / G5 | MKT-01, FIN-02 | Maker escrow ownership, atomic direct rolls | Two separately running funded makers, TTL/inventory/loss limits; spreads/depth/fill/subsidy evidence; no bids or inventory means no fill | Market/quant |
| VLT-01 / G6 | FIN-02, CORE-03, ORC-02, MKT-01 | Basket entry/exit does not dilute holders | Shares/proportional mint/in-kind exit/last-holder dust; first depositor, donation, stale marks, receiver burns and useless mint tests | Contracts/economics |
| VLT-02 / G6 | VLT-01, MKT-02, FIN-02 | Keeper policy-bound with no withdrawal authority | Four-series/fee/notional/freshness guards; no bid/stale reference yields ROLL_DEFERRED with exits; policy changes create new vault version | Quant/contracts |
| APP-01 / G7 | CORE-02/03/04, MKT-01, VLT-01 | SDK/contract units, domain and receipt states agree | Typed SDK/wallet/recovery CLI; disconnect, ambiguous send, wrong network and repeated actions recover from chain state | Product/contracts |
| APP-02 / G7 | APP-01, VLT-02, INF-01 | Display actual ownership/executable outcomes | User/maker UI, evidence viewer and browser lifecycle; uncertain NAV, illiquidity, unresolved settlement, synthetic prices, subsidies and keys visible | Product/QA |
| INF-01 / G7 | CORE-01 events; ORC-02/MKT-01/VLT-01 coverage | Finalized event replay reconciles to chain | Local PostgreSQL indexer/API/metrics; restart/backfill/dedup, missed events/RPC outage; custody/quote/oracle/ticket alerts | Infrastructure/contracts |
| DEM-01 / G7–G9 | G1, FIN-02, APP-01/02, INF-01 | Fresh clone needs no paid service or invented receipts | Local bundle, funded testnet lifecycle/cost report; faucet outage retains Sandbox; visible demo labels | Release/QA |
| SEC-01 / G8 — partial | Arithmetic now; G3–G7 as available | Plan §15 invariants survive adversarial interleavings | Differential/schema checks retained; add stateful/compiled-Wasm/fault/model/browser suites, assumptions/counterexamples/gas limits | Security/QA |
| SEC-02 / G8, G10 | SEC-01, exact candidate source/Wasm | Review claims match shipped artifacts/scope | Independent review, symbolic/formal coverage limits, critical/high fixes and regressions; no unsupported audit claim | Independent security reviewer |
| REL-01 / G9 | G7–G8 testnet gates, DEM-01, SEC-02 testnet scope | Every demo/README claim reproducible | Testnet record, two makers, 12-step demo, reconciliation/recovery, submission bundle and fresh-clone/failed-frontend drill | Release owner |
| REL-02 / G10 — optional | G9, production ORC-01/02, CORE-04 recovery, SEC-02 | Trust/custody/caps explicitly accepted | Independent historical sources, audited authority, recovery/incident drills, liquidity stress, monitoring and capped release runbooks | Security/operations |

G9 completes the hackathon product. G10 production and G11 expansions do not
block that definition, but remain mandatory for their own deployments. No
G1-AI/G1-ZK, PRIV or encrypted-RFQ tasks remain active. Source attribution is
required; preparing submission text does not authorize posting it.

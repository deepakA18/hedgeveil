# Implementation status

Baseline started 7 November 2026. This file records implemented evidence;
`IMPLEMENTATION_PLAN.md` retains the full target and acceptance gates.

| Stage | Current evidence | Still required |
|---|---|---|
| G0 | SPEC, PRIVACY, THREAT_MODEL, ADR 0001, draft public-input schema | Independent review; circuit wire layout/resource budgets; remaining transition schemas |
| G1-AI | Live gateway/model DCAP + NVIDIA JWT checks; real nonce/quote negatives; E2EE and signature unit tests; fail-closed local completion CLI | Local API key, reviewed measurement/provenance allowlist, actual encrypted completion + response binding, retention checks |
| G1-ZK | Real depth-20 1→1 spend proof, deployed testnet host verifier, 15 live checks, native timing/RAM, public fixture + setup manifest | Malicious ciphertext prevention, largest planned transitions, browser benchmarks, cryptographic/setup review; no custody approval |
| G1-OPS | Withdrawal/oracle requirements documented | Historical replay and authenticated payout-outcome prototypes |
| G2 | Exact Python/Rust arithmetic, 565 shared vectors, conservation argument | Circuit differential tests, stateful solvency model, liquidity/price-path scenarios, policy comparisons |
| G3–G10 | Not started | Wallet, contracts, RFQs, vault, UI, audits, demo and separately gated pilot |

No gate is declared complete solely because documents or fixtures exist.

Baseline validation: five Python financial tests (including 2,000 seeded rational
identity cases and 1,000 fragmentation cases), two Rust unit tests, one Rust
differential test covering all 565 vectors, and six schema test groups pass.
Fixture regeneration is byte-identical. Rust formatting and Clippy with warnings
denied pass. Checks ran locally with Rust 1.91.0; no deployed Wasm was tested.

## Next work items

| Ticket | Dependency | Invariant / disclosure | Failure path / evidence | Review responsibility |
|---|---|---|---|---|
| PRIV-01 review | Baseline | Private amounts absent from public schema | Reject unrecognized fields; review semantic bindings | Protocol/security |
| ZK-01 feasibility | G0 review | Ownership and encrypted output recovery | Real valid/invalid proof + measured limits; revise design if infeasible | Crypto/contracts |
| AI-01 encrypted evidence | G0 review + local credentials | No secret in relay/logs; fail closed | Actual completion and tampered-evidence failures; no fixture substitution | AI/security |
| ORC-01 historical prototype | G0 review | Immutable observation at M | Replay old window after downtime; delayed result on missing evidence | Oracle/contracts |
| CORE-02 outcome prototype | G0 review | Success and replacement mutually exclusive | Success then callback failure; authenticated recovery of unknown | Contracts/security |
| FIN-02 research | Arithmetic baseline | No overpayment, executable economics | Scenario seeds, no bids, delays, costs, held-out policies | Quant/protocol |

G1 work may advance independently, but UI and confidentiality claims remain
blocked on its complete evidence. The first baseline made no network requests.
The G1 increment queried public AI evidence and deployed a noncustodial verifier
to a dedicated faucet-funded testnet account. No inference completion, mainnet
action, real deposit or public submission was made. See
[the measured results](../research/reports/G1_FEASIBILITY.md).

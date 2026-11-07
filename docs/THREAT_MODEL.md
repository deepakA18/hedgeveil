# Public-ledger threat model v0.2

Assets: collateral backing, correctly isolated reserves/storage/bonds/fees, claim
and share ownership, authentic quote execution, immutable settlement and safe
withdrawals. Public financial state is intentional. Trust boundaries: wallet and
frontend, NEAR receipts/runtime, clearinghouse, versioned oracle, registered maker
keys, vault policy, indexer/RPC and deployment governance.

| Failure/adversary | Required control | Evidence / gate |
|---|---|---|
| Unauthorized caller debits user or vault | Predecessor checks; separate vault namespace; narrowly scoped roles | CORE-01/02, permission tests |
| Overflow/fragmentation extracts collateral | Checked wide math, canonical amounts, isolated reserves, explicit rounding/dust | FIN-01, CORE-03, differential/stateful tests |
| Replayed/forged/expired quote; fill/cancel race | Registered key/domain/nonce/epoch; exact all-or-nothing atomic fills | MKT-01 signature and race tests |
| Maker promises unavailable inventory | Recheck all legs/fees at fill; explicit locks only for resting offers | MKT-02 competing funded makers; no-fill outcomes |
| Wrong oracle/series/window or mutable final result | Authenticated request-bound callback; immutable terms and one-way finalization | ORC-01/02, bad result/import tests |
| Oracle equivocation/outage/arbitration failure | Precommitted evidence/fallback deadlines; delayed resolution; capped shared exposure | G4 demo faults; production independence remains G10 |
| Successful transfer loses callback | Debit before dispatch; private bounded callback; UNKNOWN quarantine | CORE-04 success-then-callback-failure tests |
| Duplicate failure callback or recovery | Restore original owner's balance once only; verify actual outcome | G1/G3 fault injection; G10 reviewed unknown-outcome recovery |
| Token receiver spends/burns before refund | Full receiver/resolver semantics; cap return by remaining balance/supply | G1 token compatibility, G3/G6 conformance |
| Storage spam or forced unregister drains backing | Paid storage records/caps; restricted unregister/refunds and isolated funds | CORE-01, token storage tests |
| Donation/stale NAV dilutes shares | Managed basket only; proportional mint/exit; final-share remainder; seeded bootstrap | VLT-01 donation/rounding tests |
| Keeper colludes with makers or disappears | Contract-enforced price freshness, limits/fees/minima; no withdrawal/upgrade power | VLT-02, stale-price/no-bid/deferred-roll tests |
| Indexer/RPC duplicates or invents success | Finalized receipts, transactional cursors, replay/reconcile, no blind money retries | INF-01 and APP-01 restart/failover tests |
| Frontend/key compromise or unsafe upgrade | Dependency/security review, visible network, narrow keys and scoped pauses | SEC-02 exact Wasm/key review; testnet upgrades disclosed |

The demo oracle has disclosed centralized test control and synthetic prices.
Multiple local processes are not independent production sources. Solvency does
not establish truthful prices, liquidity, stable USD returns or safe regulation.
Production remains gated by historical source integrity, recovery, independent
review, cost ownership, monitoring and capped risk acceptance. Testnet supplies
functional evidence only. No risk is resolved by simply displaying a success UI.

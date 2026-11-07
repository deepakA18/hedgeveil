# Recovery and operations requirements

Status: operational runbook acceptance requirements; no recovery CLI exists yet.
G3 implements local collateral/storage-refund tickets and their callback/quarantine
paths; use these cases to extend CORE-04, INF-01, DEM-01 and REL-02.

| Incident | Required behavior | Evidence before closing |
|---|---|---|
| Ambiguous transaction submission | Query authoritative operation/ticket state; no blind repeat of money movement | Final receipt correlation or visible unresolved state |
| Confirmed payout failure | Restore original owner's free balance once via authenticated outcome | Ticket/receipt, one restoration event and custody reconciliation |
| Confirmed storage-refund failure | Restore original storage funding, clear closing flag and retain failed ticket for owner cleanup | Storage remains outside collateral; recreate a deleted account only under its legitimate account authority |
| Unknown payout / failed callback | Quarantine; no timeout refund/resend; display and alert | Reviewed authenticated recovery result; unresolved remains locked |
| Lost collector/source | Replay committed demo history; apply fixed fallback then delayed resolution | Same historical window/config/hash, never substituted spot |
| Dispute/arbitrator outage | Follow precommitted deadline/fallback; retain delayed status if unresolved | Public evidence and finality record, or explicit outstanding risk |
| No bids/stale reference | ROLL_DEFERRED, preserve holdings and valid in-kind exits | Rejection reason, policy limits and unchanged custody |
| Indexer/UI outage | Rebuild finalized events and reconcile views; use chain/CLI | Deduplicated backfill and matching state, no fabricated success |
| Testnet upgrade | Reject while operations unsettled; record authority and hashes | Receipt, new artifact and completed regression/reconciliation |

Guardians may pause only documented scopes. They cannot seize collateral, choose
prices or rewrite economics. Keep valid merges/redemptions/in-kind exits available
unless a specifically identified exploit makes that route unsafe. Oracle powers
are separate from guardian powers. G10 must assign on-call ownership, monitoring,
incident communication, key procedures, verified recovery and staged exposure caps.

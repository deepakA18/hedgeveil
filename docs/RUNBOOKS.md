# Recovery and operations requirements

Status: operational runbook acceptance requirements; no recovery CLI exists yet.
G3 implements local collateral/storage-refund tickets and their callback/quarantine
paths; use these cases to extend CORE-04, INF-01, DEM-01 and REL-02.
G4 adds content-addressed observation replay and oracle bond-credit tickets.
Use the [collector commands](../services/observation-collector/README.md) to replay
the exact manifest; a missing file must not be replaced with a current quote.

| Incident | Required behavior | Evidence before closing |
|---|---|---|
| Ambiguous transaction submission | Query authoritative operation/ticket state; no blind repeat of money movement | Final receipt correlation or visible unresolved state |
| Confirmed payout failure | Restore original owner's free balance once via authenticated outcome | Ticket/receipt, one restoration event and custody reconciliation |
| Confirmed oracle credit payout failure | Restore the original owner's oracle credit once | Private callback receipt and oracle custody reconciliation; never credit clearinghouse collateral |
| Confirmed storage-refund failure | Restore original storage funding, clear closing flag and retain failed ticket for owner cleanup | Storage remains outside collateral; recreate a deleted account only under its legitimate account authority |
| Unknown payout / failed callback | Quarantine; no timeout refund/resend; display and alert | Reviewed authenticated recovery result; unresolved remains locked |
| Lost collector/source | Replay committed demo history; apply fixed fallback then delayed resolution | Same historical window/config/hash, never substituted spot |
| Dispute/arbitrator outage | Follow precommitted deadline/fallback; retain delayed status if unresolved | Public evidence and finality record, or explicit outstanding risk |
| Maker retirement/stale reference | Stop new signatures; advance own cancellation epoch and inspect actual receipt; guardian may pause fills | Current registry epoch, receipt and custody; signatures persist until cancellation or expiry if the process dies |
| Compromised RFQ key | Revoke the exact key ID through the owning NEAR account; never reuse its ID | Registry revocation and real receipt; account-key compromise requires separate authority response |
| No bids/stale reference | ROLL_DEFERRED, preserve holdings and valid in-kind exits | Rejection reason, policy limits and unchanged custody |
| Indexer/UI outage | Rebuild finalized events and reconcile views; use chain/CLI | Deduplicated backfill and matching state, no fabricated success |
| Testnet upgrade | Reject while operations unsettled; record authority and hashes | Receipt, new artifact and completed regression/reconciliation |

Guardians may pause only documented scopes. They cannot seize collateral, choose
prices or rewrite economics. Keep valid merges/redemptions/in-kind exits available
unless a specifically identified exploit makes that route unsafe. Oracle powers
are separate from guardian powers. G10 must assign on-call ownership, monitoring,
incident communication, key procedures, verified recovery and staged exposure caps.

The [local maker](../services/maker/README.md) supports explicit retirement and
request-time automatic epoch cancellation on bad reference data or marked loss.
It does not monitor a continuous feed. A no-quote response is not a successful
cancel transaction; inspect its outcomes and the registry. The future G6
ROLL_DEFERRED/in-kind-exit flow is still an acceptance requirement, not a G5 API.

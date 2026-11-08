# Recovery and operations requirements

Status: operational acceptance requirements plus a [local APP-01 CLI](CLIENT.md).
The CLI reads finalized collateral transaction/ticket receipts and supports explicit
merge, redemption and in-kind exit. Browser/testnet, storage-refund/oracle-credit
CLI flows and reviewed on-chain UNKNOWN resolution remain pending.
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
cancel transaction; inspect its outcomes and the registry. G6 now supplies the
experimental ROLL_DEFERRED/in-kind-exit flow described below; it remains separate
from maker cancellation and is not an approved recurring strategy.

G6 VLT-01 now exposes `vault_redeem_in_kind` for the experimental Sandbox basket,
even when vault mints/markets/deposits are paused or claims are matured pending.
It returns actual unresolved claims without promising cash. `vault_risk` explicitly
reports POLICY_UNSELECTED without an optional guard; the one-shot guard below
has its own experimental status and explicit keeper authority. Last exit closes the vault permanently.
There is no automatic rebootstrap, policy replacement or admin asset withdrawal.

The optional [VLT-02 profile](KEEPER.md) adds `get_vault_roll` and
`execute_vault_roll`. Inspect the returned state and actual receipt: a successful
transaction can record ROLL_DEFERRED without executing any trade. Record its reason,
current reference sequence, maker nonce and unchanged holdings. Refreshing data
alone cannot clear a latched deferral; a valid funded roll must succeed. Never
treat a selected off-chain proposal as a fill or send a compensating payout.
In-kind exits remain available during reference/maker outages and after policy
exhaustion. If the publisher or keeper is compromised, pause market fills and
new vault mints; do not seize holdings or change a funded policy. Policy replacement
and production authority recovery are not implemented.


## Local CLI interruption drill

Retain the public deployment config and the complete operation journal. Use
`inspect --id` without RPC to see the retained intent, attempt marker, known hash
and last result. Use `recover --id` against the same pinned live Sandbox to obtain
matching FINAL execution and complete receipt links. If the hash was lost, obtain
the actual attempt's hash from the signer before supplying `--hash`; an older
identical transaction is not valid correlation. Commands and adapter contract are
in [CLIENT](CLIENT.md). No `.env` or private key is read by the CLI.

A failed native transfer followed by a successful restoration callback is
WITHDRAWAL_FAILED_CONFIRMED. A successful transfer followed by a failed callback
is WITHDRAWAL_UNKNOWN, even when its on-chain ticket is still PENDING. Missing
terminal evidence, RPC failure and timeouts do not authorize cleanup, refund or
resend. A callback confirmed in the original receipt tree remains evidence after
the owner explicitly closes its terminal ticket. Never infer a completed send
from balances alone. The CLI does not mark UNKNOWN or restore funds on-chain.

A retained operation cannot be submitted again, including after cancellation or
confirmed failure. A new operation ID is separate authorization and may move
money again. Review the previous receipt and current actual assets first. The
[Sandbox evidence](../research/reports/G7_LOCAL_CLIENT.md) exercises recovery in
fresh CLI processes; production incident ownership and independent review remain
unassigned/pending.

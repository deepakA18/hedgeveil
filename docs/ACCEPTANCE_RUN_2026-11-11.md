# Native options acceptance — 11 November 2026

This is an in-progress real testnet run, not a release sign-off. Hosting is
explicitly deferred by the user until backend and end-to-end testing finishes.
The owner signs through Meteor; services can sign only for provisioned project
accounts. Vault and production remain disabled. P/N use the internal ledger.

## Confirmed so far

- Owner storage registration and 0.1 test NEAR collateral deposit have actual
  FINAL receipts in `research/reports/native-public-wallet-funding.json`.
- Eta has actual oracle/core registration and two maker inventory receipts in
  `research/reports/native-public-eta-setup.json`.
- Both makers issue funded quotes using archived actual Coinbase inputs;
  `research/reports/native-public-eta-clock-quote.json` records provenance.
- The owner bought 0.05 P: transaction
  `Gj8gUSzX8bRTdQqSQ5f86XiCosr9r7qhrUDKWXz7xsZK`.
  `native-public-owner-eta-progress.json` distinguishes it from an unsigned N
  review blocked while the indexer caught up.
- Project-account BUY P, BUY N, SELL P and merge all have actual receipts in
  `research/reports/native-public-eta-service-trade.json`. These are subsidized
  project accounts, not independent market participants or owner-wallet tests.
- All three real external reports were accepted and their callback-block source
  evidence verified in `native-public-eta-source-slot-{0,1,2}.json`. The resolver
  finalized and core imported `3716050000000` (scale `1000000000000`), the exact
  floor average of `3718450000000`, `3715800000000`, and `3713900000000`.
  No report was backfilled.
- Project-account redemption of 0.05 of each leg and a 0.02 test NEAR withdrawal
  succeeded. `native-public-eta-service-redeem.json` checks exact integer payouts
  and the matching terminal SUCCEEDED ticket, with no balance restoration.
- `native-public-eta-post-settlement-indexer.json` independently replays 71 actual
  FINAL transactions, 303 outcomes and 63 protocol events against a single
  reconciled checkpoint (core sequence 48, resolver sequence 15).
- The owner's browser-signed 0.05 P redemption and 0.02 test NEAR withdrawal
  passed independent receipt/ticket checks in `native-public-owner-eta-exit.json`.
  Redemption credited `49545888779752694393240` atomic units; withdrawal ticket
  1 is SUCCEEDED with no balance restoration. The pre-restart checkpoint now
  reconciles 73 transactions, 313 outcomes and 66 events (core sequence 51).
- The post-settlement restart comparison passed in
  `native-public-eta-owner-restart-check.json`: all 73 receipt trees, 66 events,
  positions, tickets and resolver state are unchanged. Fresh reconciliation is
  restored. SIGTERM retained an ownership lock; it was removed only after checking
  that its owner PID was dead. This is operator-assisted recovery evidence.
- The indexer now reconciles while retaining the unresolved epsilon/zeta hashes.
  No absence or timeout is treated as failure, success, refund or resend authority.

## Remaining live steps

1. Owner N purchase remains unconfirmed. Eta has matured; it cannot be retried.
   A later immutable series is required for this remaining wallet test.
2. Resolve sustained indexer freshness before release. The concurrent snapshot
   change improves read scheduling but does not establish continuous availability.
   Managed replacement evaluation is tracked in [HOSTED_INDEXER](HOSTED_INDEXER.md).

Eta's immutable observation slots are 03:13:04.230–03:19:04.230,
03:19:04.230–03:25:04.230 and 03:25:04.230–03:31:04.230 UTC.
Finalization is eligible from 03:32:04.230 UTC (09:02:04.230 IST), provided
all samples are valid and the guardian has not paused. This is an eligibility
time, not a guarantee of completion.

## Checks and limits

The current increment passed 24 focused indexer/setup tests, 19 compiled
unknown-hint/reconciliation checks, 18 market pricing/expiry checks, eight
actual-market Sandbox maker checks and 35 local browser checks. Rational vectors,
locked root Rust tests, root format/Clippy, schema generation and 14 schema checks
also pass. Local source fixtures and fault injection remain labelled local tests;
they are not public-market or public-wallet acceptance.

The first unknown-hint regression failed because FINAL status lookup waited on
an absent hash; the corrected non-waiting lookup still requires complete FINAL
receipts for projection. The first sandboxed HTTP test hit a Node native
assertion; it passed with loopback permissions. The maker test previously ignored
`--report`; it now accepts the option. The clock-alignment run was copied to its
own report after that old writer had replaced its prior latest-report path.

Dependencies: APP-01/02, INF-01, MKT-03, ORC-03, REL-01. Invariants: exact units,
separate operating/storage/collateral balances, authenticated observations,
complete receipts, and no repeat submission. Missing samples delay settlement;
unreconciled state blocks new risk. Independent security, markets, oracle and
release reviewer sign-off remains pending.

## Follow-up evidence and limitations

The concurrent snapshot change passed 19 compiled Sandbox checks in
`indexer-parallel-snapshot-budget-sandbox.json` and 20 focused transport/discovery
tests. The live runtime was restarted with it and retained its database/journals.
`native-public-parallel-snapshot-health.json` records six unhealthy reads during
new settlement/redemption receipt ingestion; it is failure evidence, not a
performance pass. Subsequent full reconciliation passed as recorded above.
The first post-settlement audit correctly refused an unreconciled checkpoint.

The first payout acceptance check compared a JSON-encoded callback string without
decoding JSON. The confirmed receipt and terminal ticket were already successful;
correcting the checker and recovering the same three hashes passed. No transaction
was resent. A fresh setup budget preflight initially rejected the approved setup
at a 1 NEAR floor; the corrected 0.5 NEAR floor passes the retained 48 NEAR setup
test while rejecting the previously observed insufficient 0.34 NEAR balance.

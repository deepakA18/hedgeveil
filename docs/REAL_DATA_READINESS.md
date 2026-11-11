# Real-data release readiness

11 November 2026. This is the current native testnet options demo checklist;
older feasibility and synthetic Sandbox reports retain their original scope.
Public prices, transactions and receipts must be real. Deterministic fixtures
remain test-only. Test NEAR is faucet-issued currency, not mainnet collateral.

| Area | Implemented / observed | Still required for hackathon backend acceptance |
|---|---|---|
| Deployment | Owner's 48-test-NEAR transfer and 18 setup operations finalized; native clearinghouse, external resolver and two funded makers deployed | Preserve pins and verify every subsequent operation; no new deployment inferred from a passing test |
| External source | Actual Outlayer refresh verified publicly, including source identity and callback state; sampled ingestion-time policy accepted by user | Three valid external samples for a fresh series, actual resolver finalization and clearinghouse settlement receipts |
| Collector | Bounded real request/sample workflow; alpha/beta/gamma missed slot 0; delta accepted one sample then hit the 300-second source cache; no fake backfill or repeated refresh spending | Successful fresh-series run; missing/old samples must delay settlement; archive all actual observations |
| Maker pricing | Coinbase market inputs and documented valuation model; actual-data Sandbox RFQ fills passed | Actual funded testnet BUY/SELL fills; retain model inputs, signed quotes and complete receipts |
| Liquidity | Two project-operated makers funded; alpha/beta/gamma/delta intact pairs normally merged back to free collateral | Disclose project-operated liquidity; do not claim independent market depth |
| Indexer | Canonical finalized receipt blocks, complete FINAL trees, contiguous events and exact same-block state reconciliation; bounded journal discovery tested against full scan with omission/restart checks | Public reconciliation and restart achieved: same 20 transactions / 68 outcomes / 15 events and balances. Keep this healthy during the pending user-signed lifecycle |
| Wallet lifecycle | Meteor connection, actual setup funding, user storage registration (0.04096) and deposit (0.1 test NEAR) verified | User-signed trade, redemption and withdrawal with receipt-backed balances; refresh/restart must not repeat operations |
| Recovery | Compiled Sandbox rejection, callbacks, unknown-payout quarantine and missing-data checks | Public interrupted-read/restart evidence; unknown attempts remain quarantined, never resent |
| Vault | Disabled by explicit agreed demo scope; no economic strategy passed selection | Excluded from this options release; make no yield/performance claim |
| Claims | Internal P/N ledger with tested transfers | Disclose internal ledger; full standard wallet-token conformance is outside this release |
| Review/release | Prior local suites and rehearsal exist | Updated source/evidence checks, walkthrough and independent reviewer sign-off; do not label unreviewed work audited |

The hackathon **backend/on-chain demo is complete** when a fresh real testnet
run has recorded every step: storage registration → collateral deposit → funded
RFQ purchase/sale (and split/merge/transfer coverage) → external-source settlement
→ redemption → wallet withdrawal. Every monetary step needs complete finalized
receipts, conserved balances and indexer agreement. Restart must preserve the
same events and assets. A deployment, connected wallet, transaction hash or
passing Sandbox test alone does not establish this acceptance.

UI implementation can start once API/state/transaction interfaces are stable;
visual polish can proceed while the remaining real wallet acceptance is being
performed. The UI must display actual source, liquidity, pending/unknown/failed
states and disabled vault behavior. A three-day deadline does not relax receipt,
price, conservation or disclosure requirements. Prioritize the options lifecycle
and release walkthrough over vault, standard-token expansion and production work.

Dependencies: INF-01, APP-02, DEM-01, ORC-03, MKT-03, REL-01/02. Independent
infrastructure/security, oracle, markets and release reviews remain pending.
Absent or unverifiable inputs mean no quote/delayed settlement/blocked risk;
they never authorize fabricated data, success or refunds. Production stays disabled.

Evidence: [public deployment](../research/reports/ORC03_PUBLIC_DEPLOYMENT.md),
[public recovery](../research/reports/orc03-public-native-recovery.json),
[compiled setup/discovery](../research/reports/orc03-transfer-setup-sandbox.json),
[public restart](../research/reports/native-public-indexer-restart-check.json),
[actual-data Sandbox RFQs](../research/reports/mkt03-live-market-sandbox.json).

Actual user funding: [verified receipts](../research/reports/native-public-wallet-funding.json).
Beta setup: [four actual operations and immutable terms](../research/reports/native-public-beta-setup.json).

Beta could not sample its refreshed report within the freshness allowance.
Its actual delay and normal pair recovery are retained; no owner trade was
submitted. The latency fix passes local contract tests and a 3.9-second public
read-only observation, but still requires a successful fresh public run.

The callback handoff now has actual public freshness evidence (1.049 seconds
old, 354 ms proof reads); delta is the next bounded run. A real maker-to-maker
internal P-claim round trip also passed. Successful delta settlement and owner
trades/redemption/withdrawal still require actual receipts.

The source-cache mismatch is established by actual callback-block evidence.
The corrected collector waits for cached reports to expire; new series use
three six-minute slots. Epsilon registration is unresolved and its window elapsed; it remains quarantined. Zeta also recorded an insufficient-balance rejection and remains unresolved. Operating funds were rebalanced without touching collateral; eta setup is confirmed and both makers issue real quotes. Eta sampling and owner fills remain in progress.
Historical delayed series are retained and do not count as successful settlement.

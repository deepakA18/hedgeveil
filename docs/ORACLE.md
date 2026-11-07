# Settlement and demo oracle

Status: a [bounded G4 demo oracle](../contracts/settlement-oracle/README.md) and
[synthetic archive/replay collector](../services/observation-collector/README.md)
are implemented locally. The lifecycle includes committed publishers, bonded
proposals/challenges, fallback/adjudication, immutable finality, delayed resolution
and credit withdrawals. See [G4 evidence](../research/reports/G4_SETTLEMENT.md),
plan §8 and ORC-01/02 in [BACKLOG](BACKLOG.md). Independent review, production
historical sources and G7's evidence UI remain pending. The old G1/G3 oracle
fixtures remain distinct historical/failure-testing artifacts.

Settlement resolves the historical observation at M. A separate current-price
pipeline supports execution guards and reporting; it cannot overwrite settlement.
Commit asset/quote units, scale, window/sampling/aggregation, source count,
timestamps/missing coverage, outliers, conversion, zero/disruption/correction
policy, bond/challenge/adjudication rules and fallback hierarchy at series creation.
The USD/NEAR scale is 10^12. Missing observations never mean zero. A USDT quote
cannot silently become USD.

Demo data must be committed synthetic observations with scenario ID, timestamps,
source-file SHA-256 and oracle-config hash. Disclose test signer/adjudicator
authority. Use the same proposal, challenge, deadline, finalization and import
interfaces as the planned product. Display **DEMO ORACLE — SYNTHETIC PRICES**.
Sandbox can advance time; testnet uses real chain time and actual receipts.

The oracle accepts bonded proposals, challenges during the fixed window and
precommitted adjudication. Undisputed finalization waits for its deadline;
finality is one-way. On total evidence/adjudicator failure, record
RESOLUTION_DELAYED. Never replace missing history with today's spot or an admin
price. Eligible pair merges and in-kind exits remain available.

The clearinghouse requests the approved oracle's finalized record and imports it
only through a private callback bound to request/series, oracle version/config,
window, units and bounds. Pasted JSON is not authentication. Imports retry
idempotently without creating another finalization.

G4 evidence: committed observation reproduced after collector outage/restart;
proposal/challenge/finality and timeout tests; wrong-series/config, forged callback,
stale/inverse/missing observations rejected; evidence retrievable by the UI/CLI.

G10 separately requires independent historical-source coverage/retention,
adjudicator independence, aggregate shared-oracle exposure caps and economic
security review. No vendor is selected. The plan's candidate five-minute window,
three sources and 24-hour challenge are research parameters, not approved defaults.

G4 pins `demo-v1`: twelve uniform 10-second samples per source in the committed
fixture, three publisher accounts per primary/fallback group, integer source mean
then median, and strict missing/zero/correction rejection. All six accounts and
the adjudicator are test roles under one operator. Per-series hashes commit source
records, units/window, publishers, bonds and deadlines before the window starts.
The SDK's JSON order preservation is handled with explicit recursive key sorting
so the independent Python collector and Rust agree on commitment bytes.

No observed market price, current-price pipeline or production source is supplied
by this tool. Arbitrators can choose only a verified committed group; they cannot
type a replacement settlement price. This profile makes RESOLUTION_DELAYED
terminal after all deadlines; it does not silently reopen a case. In that outcome,
both parties recover their own posted bonds as credits while single-leg core
claims remain unresolved. Unknown native credit withdrawals remain quarantined.

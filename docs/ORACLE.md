# Settlement and demo oracle

Status: product specification. A [G1 synthetic oracle experiment](../research/g1/README.md)
and deterministic observation replay are implemented; the product oracle/collector
and bond distribution are not. See plan §8 and ORC-01/02 in [BACKLOG](BACKLOG.md).

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

# Synthetic historical observation collector

This local Python 3.9+ tool has no network, wallet or API-key access. It materializes
[committed synthetic prices](../../fixtures/synthetic-prices/g4-demo.json) at an
explicit absolute observation window and archives immutable source objects.

A request JSON file supplies `series_id`, `start_ns` (decimal UTC nanoseconds),
`oracle`, six `publishers` account IDs, and `arbitrator`. The source template has
12 samples per source at 10-second spacing; maturity is start + 120 seconds.
The file's raw SHA-256 and each materialized evidence hash enter the immutable
observation specification. A registrar must commit before the window begins.
These predetermined future prices are for a labelled synthetic demo only.

```sh
python3 services/observation-collector/collector.py materialize --request target/request.json --archive target/observations
python3 services/observation-collector/collector.py replay target/observations/CONTENT_HASH.manifest.json
```

`materialize` prints the registration, six source records, computed route results
and manifest path. `replay` runs in a separate process using only the manifest and
content-addressed objects; it does not read today's spot or require the template.
Missing/corrupt records fail; conflicting existing paths are never overwritten.
The command prints public evidence only. It does not submit a transaction.

The Sandbox harness creates request files, restarts/replays the collector and
signs the returned records with actual ephemeral publisher accounts. File
commitments prove which data was chosen, not that the chosen prices are true.
All source/adjudicator roles in this demo share one operator. Production needs
independent historical data, durable storage/backups and reviewed correction,
source-loss and economic-security policies.

Bounded on-chain `get_case` exposes accepted samples and final evidence hashes;
a G7 evidence browser and real data collection service remain future work.

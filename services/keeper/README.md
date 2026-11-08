# Experimental keeper proposal service

`planner.mjs` chooses one candidate from public chain snapshots. `worker.mjs`
runs it in a separate Node IPC process with no wallet key, RPC connection or
withdrawal capability. The Sandbox harness requests competing quotes from two
separate funded G5 makers, passes the snapshots to the planner, then submits its
proposal using a dedicated keeper account. There is no unattended daemon or
public relay yet. All price data is disclosed synthetic current reference data.

```sh
npm ci --prefix tests/sandbox --ignore-scripts
python3 scripts/build-core.py
node --test tests/keeper/planner.test.mjs
node tests/sandbox/g6-keeper.mjs
```

IPC input: `{id, input: {policy, reference, now_ns, core, holdings, candidates}}`.
Each candidate contains `quote`, maker `registry` and `available_new_p` from chain
views. Reply: `{id, result, pid}` or `{id, error}`. Amounts/timestamps are decimal
strings. No `.env` or local key file is read. The only service configuration is
this explicit public snapshot, supplied by the harness.

The planner verifies signatures, key/nonce availability, domain/taker, quantities,
inventory and configured native-value limits before ranking eligible outputs net
of cash and fee. It returns null when reference data is stale or no acceptable
quote exists. These snapshots can change before submission: the contract rechecks
every required guard against execution-time state. A proposal is never transaction
success. The harness records actual final receipt outcomes and reconciles custody.

`roll-demo-v1` is an optional one-shot guard fixture, not an economically approved
policy. The configured publisher is trusted for reference truth and is separate
from the keeper; all test roles may share one operator. Production references,
strategy selection, recurring allocation, persistent recovery/indexing and a
service supervisor remain future work. See [policy specification](../../docs/KEEPER.md)
and [execution evidence](../../research/reports/G6_KEEPER.md).

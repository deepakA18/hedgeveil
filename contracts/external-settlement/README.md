# Native sampled settlement candidate

`native-sampled-v1` is an isolated resolver candidate. It is built and exercised
against a source fault fixture in Sandbox. **The user accepted its testnet settlement design on 10 November 2026; it is
not deployed and public source/release acceptance remains outstanding.** The source definition differs from a venue-timestamp historical
oracle: it settles the average of three external **on-chain report observations**.
See the authoritative [SPEC](../../docs/SPEC.md).

Each series commits a source account/reporter, asset, price bounds, observation
window and finalization policy before trading. The window has three equal slots
of 30–3600 seconds. `sample` calls the source's `get_asset`; only the matching
private callback can record a sample. A report must belong to that slot, be no
newer than the request and at most 30 seconds old. Callbacks expire after ten
seconds or the slot boundary. Failed/missing/malformed/stale results leave the
slot empty. Five-second retries invalidate the old request ID; accepted samples
cannot be replaced.

After maturity and a 60-second review delay, anyone can finalize the floor mean
of all three samples. Missing slots remain delayed indefinitely; there is no
operator price override or historical data fabrication. The guardian can pause
sampling/finalization, but cannot rewrite finalized prices. It is a liveness veto,
not independent arbitration or a bonded challenge mechanism.

Testnet restricts the external source account to `price-oracle.testnet`. That
account's code, governance and upstream data quality remain trust dependencies;
this contract does not verify its code hash or venue timestamps. Deployment must
pin and inspect the actual source, record the selected reporter and demonstrate
fresh updates across all slots. Samples retain report/request/acceptance times and
the response hash. Preserve full source receipts for replay.

No collateral, bonds or payouts exist here. Initialization requires at least
5 NEAR of separately funded testnet/Sandbox operational balance. Each of at most
16 registrations pays exactly 0.1 NEAR as a nonrefundable storage fee. Operations
check storage coverage plus a one-NEAR operating reserve. These are candidate
limits, not an accepted revised deployment budget.

```sh
python3 scripts/build-external-oracle.py
node tests/sandbox/external-settlement.mjs
```

The harness uses explicit synthetic data **only inside the automated fault test**,
checks actual compiled-Wasm callbacks, imports the result into the clearinghouse,
redeems both legs and completes a native withdrawal. This proves integration
mechanics, not live Outlayer availability. Original synthetic resolver artifacts
and reports remain separate. Independent oracle/contracts/security review,
source verification and public indexer acceptance remain pending. The accepted
testnet scope uses pause-only authority; independent historical/dispute controls
remain production work.

Every transition emits a sequence and canonical state hash. The indexer verifies
that commitment against a same-block snapshot including registrar, guardian,
request counter and cases. The harness also runs a real PostgreSQL replay,
missing-sample alerts, tamper rejection and restart without duplicate events.

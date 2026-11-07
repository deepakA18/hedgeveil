# Versioned demo settlement oracle

G4 / ORC-01 and ORC-02 implementation profile, written before code. Dependencies:
G1 authenticated callbacks and G3 immutable series import. Invariant: finality
uses only historical evidence committed before observation; accounting never
creates bond funds. Failure paths: invalid sources, disputed proposals, missed
stages, unavailable adjudicator and failed/unknown credit withdrawals. Reviewers:
oracle/data/contracts/security; independent review pending.

This is **DEMO ORACLE — SYNTHETIC PRICES**. The registrar, six publisher accounts
and adjudicator are disclosed test roles under one operator. Distinct accounts
are not independent data providers. There is no market-data vendor or paid API.
Production is disabled; constructor permits only sandbox/testnet labels.

## Immutable evidence and deadlines

The registrar registers at most eight series before the observation window starts.
Terms match the clearinghouse's complete SeriesConfig. Its oracle_config_hash
commits an ObservationSpec; finalization_policy_hash commits a Policy. Both use
SHA-256 of UTF-8 JSON with recursively sorted object keys, compact separators,
ASCII keys, UTF-8 string values and canonical decimal strings for amounts/timestamps.

ObservationSpec fixes NEAR/USD, scale 10^12, source dataset hash, window, uniform
sample step, positive min/max price and two ordered source groups: three PRIMARY
and three FALLBACK. Each source fixes ID, NEAR publisher account and hash of its
complete Evidence record. IDs/accounts must be distinct across the six sources.
Evidence binds series, dataset, source ID, asset/quote/scale and samples. Sample
count is 2..12; timestamps are exactly start+i*step, with the final sample covering
through window end. Missing, duplicate, inverse, future, out-of-bounds or corrected
samples fail. A source may publish once after M. Equal-width sample TWAP is integer
floor(mean); group result is the median of all three source TWAPs. No outliers or
missing sources are silently discarded. The committed fallback has identical
window/units. Retain full accepted evidence on chain and in the local archive.

Policy fixes primary/fallback/arbitration durations after M, challenge duration,
proposer/challenger native bonds, and arbitrator. Bonds are 0.01..1 NEAR; durations
are 1 second..7 days, challenge fits each proposal stage. These are bounds for a
local demo, not approved production settings. Registrar cannot amend terms.

Anyone registered can propose during PRIMARY, or during FALLBACK after primary
expiry, with that route's complete published evidence root and exact bond.
Proposed price is bounded but deliberately challengeable. Undisputed finalization
requires the challenge deadline and independently recomputes the selected group's
median and root; a false price never finalizes merely because nobody challenged.
Only one proposal and one challenge per series are retained.

Any other registered account can challenge before the fixed deadline with a
conflicting price/evidence hash and exact bond. The precommitted adjudicator may
choose only a complete PRIMARY or FALLBACK group, not an arbitrary price. It may
resolve a dispute immediately; without a dispute it may act after fallback expiry
only if there is no valid finalizable proposal. It must act before arbitration
expiry. Winning evidence must match both the selected price and evidence root.
The winner receives both bonds as internal credits; if neither matches, bonds go
to the immutable treasury. An undisputed valid proposal returns its own bond.

After arbitration expiry, unresolved invalid/disputed/no-evidence cases become
RESOLUTION_DELAYED. Refund each posted bond to its original owner's credit: no
outcome was adjudicated. This profile does not reopen a delayed case or extend
its deadlines. Single-leg claims remain locked; equal-pair core merges remain
available. A valid undisputed proposal whose challenge elapsed can still finalize
late; mark_delayed cannot override it. FINALIZED is immutable and idempotent.

## Separate bond custody

Initialization requires 20 NEAR separately prefunded operating allocation and a
queried storage price. Accounts prepay 4096 bytes; series prepay 32768 bytes.
These allocations are retained for immutable audit records; storage withdrawal
and unregister are not implemented. No token/storage standard is claimed. At most
16 bond accounts and 32 retained credit-withdrawal tickets exist. Terminal tickets
may be closed by their owner; IDs are never reused. Bounds include historical cases.

Attached bonds increase locked obligations; resolution transfers them to credits.
Withdrawal debits credits before a native transfer. A private versioned callback
closes success once or restores confirmed failure once. Pending tickets may be
marked UNKNOWN after five seconds; timeout never refunds/resends. Receiver is
fixed by the credit owner when requesting. Unknown recovery remains a G10 gate.
One-yocto authorization payments accrue as separate fees. Treasury credits are
bond allocations, not collateral or storage. There is no treasury sweep/upgrade
method. Full-access deployment keys remain a separate trust boundary.

Every mutation checks received bonds = paid + locked + credits + pending/unknown,
plus bounded record/storage accounting. Events expose operation sequence, state
hash and category totals. Read APIs expose complete cases, observations and
credits; the future G7 indexer/UI must consume receipt-finalized state. Fault
callbacks exist only in a separately built fault-injection artifact.

## Local collector and acceptance

The standard-library collector materializes committed relative-time synthetic
fixtures against a series' absolute window, builds source files/config hashes,
archives by content hash without overwriting conflicts, and replays from those
files after process restart. It cannot replace a missing old observation with a
current spot. It emits JSON arguments; the Sandbox runner signs real publisher,
proposer/challenger/adjudicator transactions using ephemeral local accounts.

Compiled-Wasm tests must cover authentication, hash/units/window/coverage errors,
duplicate publication, primary/fallback/dispute/arbitration/delay, bond accounting,
withdrawal failures, immutable finality and actual G3 import/redemption. Product
historical-source independence and economic bond sizing remain G10; G7 evidence
UI and public testnet deployment remain separate tasks.

## Run locally

Use the existing pinned Sandbox dependencies (`npm ci --prefix tests/sandbox
--ignore-scripts`), Rust 1.96.0 and Node 22.22.2+:

```sh
python3 scripts/build-oracle.py
node tests/sandbox/g4.mjs
UV_CACHE_DIR=/private/tmp/hedgeveil-uv-cache uv run --offline --with jsonschema==4.23.0 python -m unittest discover -s tests/oracle -v
python3 packages/shared-schemas/build_schema.py --check
cargo +1.96.0 fmt --manifest-path contracts/Cargo.toml --all -- --check
cargo +1.96.0 clippy --manifest-path contracts/Cargo.toml --workspace --target wasm32-unknown-unknown --locked -- -D warnings
cargo +1.96.0 clippy --manifest-path contracts/Cargo.toml -p hedgeveil-settlement-oracle --features fault-injection --target wasm32-unknown-unknown --locked -- -D warnings
```

The `--offline` Python command needs the same cached jsonschema used by existing
schema tests; omit `--offline` for first installation. Build outputs are ignored
under `target/oracle-artifacts`. The harness creates ephemeral accounts, queries
runtime storage cost and tears down Sandbox. Evidence is written only on success
to `research/reports/g4-sandbox.json`; failures go to ignored `target/g4-failed.json`.

| Interface | Authorization / effect |
|---|---|
| `register_account()` | Caller prepays exact account storage |
| `register_series(config, observation, policy)` | Registrar, future window, exact series storage |
| `publish(evidence)` | Committed publisher, one yocto; complete immutable source record |
| `propose(series_id, route, price, evidence_hash)` | Registered proposer, exact bond, correct stage |
| `challenge(series_id, price, evidence_hash)` | Registered other account, exact bond, open challenge window |
| `finalize(series_id)` | Anyone, elapsed challenge and verified undisputed proposal |
| `adjudicate(series_id, route)` | Committed arbitrator, one yocto, fixed arbitration window and evidence |
| `mark_delayed(series_id)` | Anyone after total timeout; cannot suppress valid undisputed finality |
| `withdraw_credit(amount, receiver)` | Credit owner, one yocto; debit before dispatch |
| `mark_unknown(ticket_id)` | Anyone after pending timeout; no financial release |
| `close_ticket(ticket_id)` | Ticket owner, one yocto, confirmed terminal outcome |
| `on_credit_result(ticket_id, version, fault)` | Private callback only; no client authority |

Views: `get_resolution(series_id)` implements the unchanged G3 import interface;
`get_case(series_id)` includes full accepted evidence and bond allocation inputs;
`get_observation(series_id, route)` independently computes the group result;
`get_account(account_id)`, `get_ticket(ticket_id)`, `custody`, `storage_quote` and
bounded `list_series/list_accounts/list_tickets` expose accounting. Before M, the
resolution state is OPEN; after M it is MATURED_PENDING until a lifecycle transition.
Routes are PRIMARY/FALLBACK. All amounts and nanoseconds are decimal strings.

Observation/finalization algorithms are fixed by `demo-v1`: no quote conversion,
zero/missing-sample substitution, outlier removal or post-commit correction exists.
The observation and policy hashes commit their inputs; publishers authenticate
with actual NEAR predecessor accounts, not unauthenticated pasted signatures.

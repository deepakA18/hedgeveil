# G4: committed synthetic settlement and bond custody

7 November 2026. ORC-01/02 local demo implementation; independent oracle/data/
contracts/security review pending. Dependencies: G1 authenticated receipt behavior,
G3 immutable series import and the documented G4 profile. No public deployment or
production source independence is claimed.

**38 named Sandbox checks passed**, covering **174 recorded transactions** and
**151 validated oracle events**. Expected rejected transactions and induced receipt
failures are included in those counts. Account creation/bootstrap transactions
also execute locally but are not all included in the recorded count.

[Machine-readable evidence](g4-sandbox.json) records actual transaction and receipt
IDs/statuses, gas, events, materialized evidence bundles, custody snapshots,
source/lock/Wasm hashes and runtime. No mocked transaction success is used.
The [oracle profile and ABI](../../contracts/settlement-oracle/README.md) and
[collector documentation](../../services/observation-collector/README.md) describe
the implementation and its boundaries.

## Implemented acceptance evidence

| Task / invariant | Executed evidence | Failure boundary / remaining review |
|---|---|---|
| ORC-01: historical window and fixed units | Content-addressed source objects and manifests; independent Python aggregation; separate-process restart/replay; matching Rust results | Missing/corrupt/conflicting archives fail; inverse units, stale/duplicate timestamps, incomplete coverage, zero and changed prices reject; production data collection remains separate |
| ORC-02: authenticated immutable sources | Future series registration binds complete terms, publishers, source/dataset hashes, window, bounds, bonds and deadlines | Unauthorized registrar/publisher, incorrect config hash, early and duplicate publication reject; six test roles are not independent sources |
| ORC-02: one-way finality | Primary proposal, challenge deadline, challenger/proposer wins, historical fallback and precommitted arbitration | False unchallenged prices cannot finalize; adjudicator cannot supply an arbitrary price; finalized records cannot be replaced |
| ORC-02: explicit liveness failure | No-evidence and arbitrator-outage cases reach RESOLUTION_DELAYED | Posted bonds return to original credits once; no invented price; single-leg claims remain unresolved |
| CORE-03 integration | Actual private clearinghouse callback imports final primary/fallback records; P/N redeem the backed pair | Proposed/disputed/delayed results leave core price unset; pair merge remains available without an oracle result |
| Bond conservation and payouts | Exact attached bonds, internal award/refund credits, actual native transfer and confirmed-failure restoration | Successful transfer followed by callback panic/gas failure remains quarantined; duplicate outcome cannot restore twice; forged callbacks/unknown cleanup/resend attempts reject |

The immutable fixture has **12 samples per source**, each covering ten seconds,
over a two-minute window. Three source means produce a median for each of PRIMARY
and FALLBACK. The fixture deliberately disagrees: primary resolves to 4 USD/NEAR,
fallback to 2.4 USD/NEAR. These are synthetic test prices. All six publisher
accounts and the adjudicator belong to the same local test operator.

Each source object is committed before the window starts. This predetermined-data
profile is suitable for the labelled demo; collecting previously unknown market
prices requires a separately reviewed source-authentication design. Hashes prove
which bytes were committed, not that prices are truthful.

The first run exposed a canonicalization mismatch: near-sdk enables JSON order
preservation. Rust now explicitly sorts every nested object before hashing, matching
Python's sorted UTF-8 encoding. The passing run checks those cross-language
commitments at registration and compares independently computed evidence roots and
prices on chain. The failed run was retained only in ignored local diagnostic output.

## Bond and storage accounting

The normal instance received **0.9 NEAR** in posted bonds. At completion:

- Confirmed native payouts: 132 atomic units (small intentional receipt probes).
- Remaining credits: `899999999999999999999868` atomic units.
- Locked bonds, pending transfers and unknown transfers: zero.
- Separate retained storage allocation: 3.2768 NEAR.
- Separate operating allocation: 20 NEAR; authorization fees: 64 atomic units.

The fault instance received 0.1 NEAR and deliberately ends with **200 atomic units
UNKNOWN** after actual successful transfers followed by failed callbacks. Its
confirmed-paid field remains zero, and those obligations are excluded from
available credits. No timeout refund or resend exists.

Every mutation checks received bonds = confirmed paid + locked bonds + credits +
pending/unknown obligations. The harness independently sums account, case and
ticket views, reconciles those categories and verifies retained native custody
coverage. Storage and operating allocations never become bond credit.

The normal run reaches the configured bounds of **eight series, 16 registered
bond accounts and 32 retained withdrawal tickets**. A ticket-cap rejection rolls
back the attempted credit debit. All accepted source records use the maximum
12-sample length; 24 source records are populated across the eight cases, rather
than the possible 48. This is bounded capacity evidence, not exhaustive worst-case
load, maximum-length-account or concurrent-callback proof.

## Local artifacts and costs

Pinned runtime: Rust 1.96.0, near-sdk 5.30.1, Sandbox 2.14.0; this run used Node
v24.8.0 on macOS ARM64. Existing near-api-js/Sandbox package locks are reused.

Normal oracle Wasm: **383,467 bytes**, SHA-256
`ed12be66c8467df8b3e9be1551888bd76e72ef615650ebe1aba3f1f136a9028d`.
Fault artifact: 390,818 bytes. The harness checks that normal exports contain no
fault methods. Full source/lock/artifact hashes are in the JSON record; all 33
recorded source hashes match this working tree.

The clearinghouse Wasm remains exactly the G3 artifact:
`dbe1f4c1f47c0cd6a53835510b028d28c34a839a226ba6a5044f8533343a9c2c`.
The contracts lockfile adds only the oracle package; dependency versions and core
source are unchanged. Original G3 manifests remain evidence for that earlier
workspace revision. G1/G2 source evidence and all 59 archived checksums remain
unchanged. The user-authored implementation plan is unchanged.

Whole-transaction gas below includes recorded receipts and selects calls with a
successful terminal status. Confirmed transfer failure followed by a successful
restoration callback is included; expected rejected calls are excluded. Idempotent
finalize/delay calls are included.

| Normal oracle method | Calls | Observed gas range (Tgas) |
|---|---:|---:|
| register_series | 8 | 3.227–5.234 |
| publish | 24 | 5.167–7.662 |
| propose | 6 | 5.067–7.013 |
| challenge | 3 | 5.560–6.568 |
| adjudicate | 4 | 5.711–7.329 |
| finalize | 3 | 4.896–7.014 |
| mark_delayed | 3 | 5.109–7.196 |
| withdraw_credit | 34 | 15.192–16.498 |

Normal credit callbacks consumed **6.674–7.330 Tgas** against a 60-Tgas allocation.
Final normal storage usage was **409,253 bytes**, including code. The node's queried
storage price was pinned at initialization. These measurements are local samples,
not testnet costs, a production budget or a maximum-gas proof. The 0.1-NEAR demo
bonds do not establish adequate economic security for real exposure.

## Reproduction and checks

After installing the existing pinned Rust/Node dependencies:

```sh
python3 scripts/build-oracle.py
node tests/sandbox/g4.mjs
UV_CACHE_DIR=/private/tmp/hedgeveil-uv-cache uv run --with jsonschema==4.23.0 python -m unittest discover -s tests/oracle -v
python3 packages/shared-schemas/build_schema.py --check
```

The harness uses only loopback Sandbox, ephemeral test accounts and committed
synthetic data, then tears down the node. `.env` and wallet secrets are not used.
The collector can independently replay a manifest using only its stored objects;
it neither fetches a latest price nor submits a transaction.

Also passed: **six collector/schema test groups**, five rational reference tests,
565-vector regeneration, three locked Rust workspace tests, 15 G2 regression test
groups, nine public-schema groups, both generated-schema checks, root/contract
formatting and Clippy with warnings denied, including the fault oracle build.

## Remaining limits and next increment

Independent review and broader timing/interleaving/load coverage remain pending.
The demo's fixed deadlines and RESOLUTION_DELAYED state do not reopen; missing
single-leg settlement may remain locked. Storage allocations are retained for
audit state; no oracle storage unregister/refund interface exists. UNKNOWN native
payout recovery remains a production gate. Full-access deployment keys remain
outside contract-level immutability claims.

G4 events carry aggregate bond categories and state hashes. G7 still needs
account-level event indexing/reconciliation, complete receipt correlation and an
evidence UI; this is not a full per-account event-replay indexer. The current-price
pipeline for trading guards is also not implemented. No public testnet deployment
or persistent service is recorded.

Actual callback failures are separate receipt failures, so successful earlier
transfers cannot be assumed reverted; this is the boundary covered by the fault
tests. [NEAR callback guidance](https://docs.near.org/smart-contracts/security/cross-contract-calls/callback-failures)
documents that execution model.

Next implement **G5 funded RFQs and maker execution**. G2's frozen economic screen
still selects no passing rolling policy; G6 policy approval remains open. G9's
complete hackathon demo is unfinished, and production stays disabled.

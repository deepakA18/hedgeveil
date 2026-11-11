# Sampled-price policy and collector — 10 November 2026

The user accepted `native-sampled-v1` for testnet: three fresh external on-chain
report samples, floor-average settlement after the fixed review delay and a
guardian with pause-only authority. Source timestamps describe ingestion time.
Missing observations delay settlement without a substitute price. This decision
supersedes historical venue-time and bonded-dispute requirements for this testnet
profile only. It does not constitute independent review or source acceptance.

## Implemented

`services/outlayer/sampler.mjs` checks chain/genesis/code pins, immutable terms,
source/reporter identity, exact units, bounds, slot and report freshness. It
prepares stable journal operations for one refresh and one sample per slot,
finalization and core import. Source refresh attaches exactly 0.02 test NEAR with
200 Tgas maximum, at most three times per series (0.06 test NEAR plus gas).
There is no automatic paid retry. A successful refresh transaction alone does
not establish a valid sample; subsequent finalized contract state must confirm it.

Every attempted operation is recovered before later work. Unknown or confirmed
failed execution halts progression. Restart cannot change the operation ID to
repeat a deposit. Source unavailability after a confirmed refresh waits; missing
slots become delayed. The one-tick `sample` CLI rejects held/legacy deployments
before loading their dedicated service keys. The original synthetic `settle`
command now also enforces the deployment hold.

One journal lock protects a tick across processes. A crash leaves that lock for
explicit operator inspection. Clearing it is not a resend authorization: retained
attempts/hashes still govern recovery. This trades unattended liveness for
bounded spending and unambiguous operation ownership.

## Evidence

- Seven coordinator unit groups cover windows, missing slots, freshness, exact
  units, held/legacy profiles, restart, unknown transactions, code changes and
  simultaneous collector instances. Twenty-five combined oracle/admin/coordinator
  test groups pass.
- `orc03-sampler-sandbox.json` records seven compiled-Wasm checks. The coordinator
  is recreated before every tick; three refreshes and three samples execute as
  actual transactions, followed by finalization, core import, both redemptions
  and a successful native withdrawal. The source is an explicit local fault
  fixture, not public Outlayer data.
- Locked contract workspace checks, Wasm-target Clippy and formatting pass.
  All 565 shared vectors and generated schemas remain reproducible; 14 schema
  groups pass. The resolver Wasm remains unchanged by this collector increment;
  only the separate Sandbox source fixture gained its bounded refresh method.

Full transaction evidence stays in the generated Sandbox admin journal. The report
retains operation hashes and final on-chain state. Earlier resolver/indexer and
market reports retain their original source/artifact hashes; they are historical
runs and are not silently relabeled as testing changed fixture/service files.

## Dependencies and remaining acceptance

Depends on ORC-03 resolver, the existing durable admin transaction journal and the
accepted SPEC profile. Invariant: no successful transaction is invented, uncertain
execution cannot authorize later spending, and no missing observation is filled
with a fixture or administrator value. Failure paths are explicit wait, halt or
delayed settlement. Reviewer: oracle/contracts/security — independent review
pending.

The owner wallet's external-source request is still unsubmitted at the recorded
local check. Public source refresh, native deployment preparation/funding, source
pin/authority verification, continuous operational collection and the complete
public wallet lifecycle remain outstanding. The 48-test-NEAR budget remains a
non-executable draft under a source/deployment-preflight hold. No public protocol
deployment or paid API call was made in this increment. Production and the vault
remain disabled.

# DEM-01 retained Sandbox lifecycle

Recorded 8 November 2026. [Machine evidence](g7-demo-resume.json) records the
24 passing lifecycle checks, source hashes, four finalized method
transactions and their gas/tokens-burned inventory. The script starts named
services through the real supervisor, stops with SIGINT/IPC and starts a fresh
process. The browser reloads the same origin. No transaction success is mocked.

Dependencies, invariant, failure paths and local custody boundaries are in
[LOCAL_DEMO](../../docs/LOCAL_DEMO.md). Reviewer: Release/QA and independent
security reviewer — **pending**. This is a DEM-01 local increment, not completed
G7, DEM-01 or G9 acceptance.

Verified:

- Existing names and concurrent owners cannot overwrite/reseed a deployment.
- The original chain ID, genesis, code pins, accounts, storage, claims, vault,
  maker registry, custody operation sequence and journal survive restart.
- Resume produces no new setup/funding/registration events. A retained confirmed
  deposit recovers without resend; another submission of its ID is rejected.
- A durable attempted action with no hash remains uncertain. New-ID deposits of
  the same method are blocked; browser reload displays that uncertainty.
- Off-chain signed but unfilled nonce reservations persist across maker process
  restarts. Registered public keys remain the same.
- The resumed visitor executes a real merge using its retained signing key.
- Unsafe credential permissions, unauthorized retained keys, tampered metadata, occupied ports and
  incomplete setup fail closed. After repairing only the test-injected metadata
  or permissions, resume still uses the original genesis.
- Loss of the supervisor triggers orderly cleanup by the surviving runner through
  IPC disconnect, followed by another successful resume. This does not test
  forcibly killing the runner or native database/node.
- Browser custody disclosure identifies privately retained generated keys.
  Public process output contains no private-key encoding.

Three focused Node test groups cover atomic private-file writes, permissions and
symlinks, process-owner validation, maker key/retirement persistence and refusal
to regenerate missing/corrupt state. The existing 35-check APP-02 Chromium suite
was rerun against the disposable path, including real withdrawal/settlement and
lost-response cases. SDK/model/indexer unit groups, TypeScript declarations,
reference/vector checks, locked Rust tests, formatting/Clippy and schema
regeneration/validation passed. No financial behavior, contract or schema changed.

Normal contract artifacts remain pinned to the existing build manifests. Native
runtime and dependency versions remain the repository's locked versions. Retained
node/database/key directories are ignored and excluded from this report. Receipt
hashes, exact amounts and measured costs are public evidence; private credentials
are never included.

Limits: tested on the current macOS ARM64 environment. Clean shutdown is covered;
SIGKILL/power-loss/native-service recovery, backups, multi-host concurrency,
long-term history retention and independent custody/security review remain open.
A stale PID may block safely. This does not recover an incomplete initialization
or replace missing credentials. No public wallet, testnet deployment, testnet cost
measurement, full fresh-clone acceptance or approved recurring policy is claimed.

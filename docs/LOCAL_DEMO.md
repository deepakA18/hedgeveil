# Retained local demo (DEM-01)

This increment retains the local Sandbox deployment across clean process stops.
It does not enable testnet, public wallets, production, or a selected recurring
strategy. The existing `npm start --prefix apps/web` remains disposable.

After the dependency and Wasm build steps in [README](../README.md):

```sh
node scripts/demo.mjs create my-demo
# Open the printed URL. Ctrl-C stops the services gracefully.
node scripts/demo.mjs resume my-demo
node scripts/demo.mjs inspect my-demo
```

Names contain lowercase letters, digits and hyphens, begin with a letter and have
at most 32 characters. `create` requires a new name. `resume` requires completed
initialization and uses the original chain/database, accounts, contract hashes,
ports, SDK journal and maker state. It never replays registration, funding,
deployment or vault initialization. `inspect` prints only public deployment
metadata and does not start services. There is deliberately no reset, overwrite,
implicit migration or automatic deletion command.

All state lives in ignored `target/demos/<name>/`. The workspace directory is
0700; retained manifest/state and credential files are 0600. Native runtime files
and the public client binding also stay inside that protected parent. Generated
Sandbox account keys, RFQ signing keys and database credentials are retained locally; they are not encrypted at rest.
This is a trusted, single-user development machine profile, not public custody or
an authenticated multi-user server. Never commit, publish or copy this directory
into release artifacts. No existing wallet, `.env` or `.local` credentials are
loaded. Browser disclosure identifies retained keys when this mode is used.

The supervisor sends shutdown through IPC, letting HTTP/signing work finish
before closing the indexer, makers, node and database. The same UI origin and
RPC endpoint are retained. Reloading the page lists the original journal. An
attempted operation with no known hash remains SUBMISSION_UNKNOWN and cannot be
resubmitted; another deposit of that method stays blocked until evidence resolves
it. Stopping a process does not prove that a transaction failed. UNKNOWN native
payouts retain the existing quarantine rules.

Each maker persists its RFQ key, issued nonce reservations, observed cancellation
epoch and retirement state before returning a signature. Restart does not reuse
an unfilled quote nonce or silently rotate/re-register a key. Explicit on-chain
epoch advancement is still the mechanism for invalidating old authorization.
Expired quotes stay expired; restarting does not extend their TTL.

## What resume checks

- Completed initialization marker and matching public deployment manifest.
- Private credential permissions and preserved generated signer files; each
  retained transaction key must still have its expected on-chain full-access authority.
- Exclusive live owner and recorded service processes; occupied ports are rejected.
- Pinned Sandbox binary, original genesis/chain, contract code and stored domain.
- Existing PostgreSQL data and its deployment-bound indexer cursor.
- Matching registered maker public keys and valid retained maker state.

The native node restarts its original database. A state dump imported as new
genesis would break receipt/journal identity and is not used. The pinned
[near-sandbox implementation](https://github.com/near/near-sandbox-js) provides
initialization; retained runs use the same binary's `--home ... run` interface.
Tests verify actual identity and receipt continuity rather than relying on that
interface alone. Storage costs still come from the running protocol configuration.

## Failures and recovery limits

A failed/interrupted initial create leaves an incomplete workspace. Resume refuses
it; use a new name for another isolated deployment. It does not guess which seed
transactions ran. Modified metadata, missing keys, changed binaries or code,
unsafe file permissions, missing history and unreconciled balances also fail
closed. Never erase the journal to bypass an ambiguous attempt.

A dead supervisor lock can be reclaimed only when its recorded owner is absent.
If a recorded node/database process is still alive, resume refuses instead of
killing it or attaching to it. Investigate the specific owned process and its
shutdown before trying again. PID reuse may conservatively block resume. This
increment tests clean Ctrl-C/IPC shutdown and loss of the supervisor (the surviving
runner shuts down through IPC disconnect). Killing native services or the runner, power
loss, disk corruption, multi-host storage and backup/restore are not certified.
The file writes are atomic and fsynced, but that is not a complete crash-recovery
claim for every native service or filesystem.

Maturity and challenge deadlines are immutable. A long stop may leave the series
matured, offers expired or settlement delayed; resume never rewinds time or edits
terms. This demo still uses a future synthetic observation window. Oracle
publication/adjudication helpers are test-only, not browser administration routes.
The complete release walkthrough and persistent oracle/keeper orchestration
remain DEM-01 work. G2 still selects no approved rolling policy.

## Acceptance record

Dependencies: G1 pinned runtime, APP-01 receipt/journal semantics, APP-02 local
signer UI, INF-01 persisted PostgreSQL reconciliation and MKT-02 maker state.
Invariant: one retained deployment and authorization history; restarting never
creates a new balance, repeats an attempted action or reuses a reserved RFQ nonce.
Failure paths and evidence: [restart report](../research/reports/G7_DEMO_RESUME.md).
Reviewer: Release/QA and independent security reviewer — **pending**.

The report includes actual gas and tokens burned for the four sampled lifecycle
actions. Those are local measurements, not testnet costs, a full operating budget
or benchmark. Public wallet/testnet, fresh-clone release acceptance, full demo
orchestration and broader incident/custody review remain open.

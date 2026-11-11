# REL-01 local release rehearsal

This workflow prepares a local Sandbox submission candidate. The current release
is options-first; the vault stays disabled and strategy selection is deferred.
Actual public wallet lifecycle acceptance, independent review and a walkthrough
video remain required before G9 is complete. See [current readiness](REAL_DATA_READINESS.md). No release
approval, deployment or external submission is performed by this command.

The [9 November retained run](../research/reports/rel01-local.md) passed 109 runtime
checks from a fresh local clone and verified the designated archive. It records
the exact inputs, commands, limits and digest; use a new name for another run.

```sh
python3 scripts/rehearse-release.py run local-release-01
```

Use a new lowercase name. Existing rehearsal directories and packages are never
overwritten. Newly added active source must be tracked by Git before rehearsal;
the runner rejects unaccounted untracked inputs. Python 3.9+, Git, Node 22.22.2+, npm, uv and the repository's pinned
Rust toolchains/wasm target and TypeScript 5.9.2 are prerequisites. First use needs network access for
public locked packages, runtime binaries and Chromium. No paid API key, `.env`,
external wallet or public funds are needed.

The runner snapshots selected current working-tree source into a **temporary Git
repository**, creates an explicitly labelled temporary commit, and makes a real
fresh local clone without hardlinks. It records the original project base commit,
temporary snapshot commit and every source hash. This tests the current working
tree without committing it to the user's repository; it is not a claim that an
already published project release commit has passed a remote fresh clone.

The fresh clone starts without project dependencies, build products, wallet keys,
journals or databases. Host download caches, Rust toolchains, cached Chromium and
the pinned Sandbox binary may be reused and are disclosed. The runner installs
locked dependencies, builds normal/fault Wasm, runs required math/Rust/schema and
model checks, reruns the frozen economics experiment and executes:

- `tests/release/walkthrough.mjs`: same-deployment funding, N sale from competing
  quotes, basket entry, maker removal, in-kind exit, real disputed synthetic
  settlement, both-leg redemption, failed withdrawal and reconciled CLI payout
  after the frontend HTTP listener has actually closed.
- The actual Chromium browser suite, using its separate deployment.
- The experimental keeper suite, including a one-shot bounded roll and deferral.
- The SDK/CLI payout-fault suite, including paid-but-unacknowledged UNKNOWN.
- The retained-demo restart suite, including UI/indexer/journal continuity.
- The browser wallet-boundary suite with the official v10 action factory and
  test-wallet transport; installed-wallet/public-testnet acceptance stays pending.
  SDK/wallet unit and declaration checks also run.

These additions apply to future rehearsals. The retained 109-check REL-01 archive
predates the wallet increment and has not been rerun or relabelled.

The twelve requirements are mapped in the generated `evidence/acceptance.json`.
They are deliberately not all labelled one continuous public-wallet flow. The
keeper is a separate experimental fixture; the crash/loss demonstration is a
synthetic offline stress simulation. No rolling candidate passes the frozen G2
selection gates, and the testnet vault remains disabled.

## Outputs and verification

`target/releases/<name>/` is a private 0700 workspace. Its clone may contain
generated **test** keys and native node/database state. **Never publish this
directory, the clone or its logs.** A failed run leaves diagnostics there and
does not produce a successful release result. Use a new name after fixing it;
there is no blind transaction retry or automatic deployment reset.

The designated public artifact is only
`target/releases/<name>/hedgeveil-local-rehearsal.tar.gz`. It contains selected
source, normal/fixture Wasm in separate directories, public receipt evidence,
source provenance, acceptance limits and draft submission text. Environment
files, local state, `.git`, dependency/build caches and the historical privacy
archive are excluded. The archive has a content manifest; preserve the printed
archive digest separately and verify without extracting:

```sh
python3 scripts/rehearse-release.py verify target/releases/local-release-01/hedgeveil-local-rehearsal.tar.gz --sha256 THE_PRINTED_SHA256
python3 -m unittest discover -s tests/release -v
```

Verification rejects changed bytes, missing/extra files, unsafe paths, duplicate
members, links and public-release approval claims. Hashes establish integrity
relative to the trusted digest, not independent correctness or sender identity.
The limited private-key-content guard is not a comprehensive secret audit.

## Public release dependencies

Before completing REL-01, implement and test the public-wallet/testnet paths under
APP-01/02; obtain the applicable SEC-02 review and resolve critical/high findings;
record actual faucet-funded deployments, normal Wasm hashes, access-key/upgrade
authority, storage/operating funding, maker subsidy and full lifecycle receipts.
Record any required policy decision through FIN-02/VLT rather than silently
enabling the Sandbox-only experimental vault on testnet. Add a walkthrough video
and actual repository/deployment links to the submission draft. Production
remains a separate G10 gate.

Dependencies: DEM-01, available G7–G8 local implementations and pinned build/runtime
tools. Invariant: every local acceptance claim links to actual receipts or clearly
labelled synthetic simulation evidence; local checks never authorize public
release. Failure paths: failed phase, changed source, lost response, no liquidity,
unknown payout or invalid package leaves the corresponding acceptance unmet.
Reviewer: Release/QA and independent security reviewer — pending.

The NEAR Connect increment adds a required `near_connect` rehearsal phase and
integrity-checked wallet asset preparation. Its controlled browser/HTTP fixtures
and Sandbox receipts do not satisfy installed Meteor/Intear or public testnet
acceptance. A fresh complete rehearsal for this candidate remains pending; see
[wallet desk scope](NEAR_CONNECT.md).

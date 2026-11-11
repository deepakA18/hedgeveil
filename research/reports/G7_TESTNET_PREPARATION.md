# Options testnet preparation — 9 November 2026

Scope: local integration evidence and an unexecuted public deployment plan.
Public testnet deployment, vendor-wallet transaction acceptance and independent
review are not complete. The user confirmed Meteor connection and selected an
options-first release with the vault disabled.

- [11 compiled-Wasm checks](g7-testnet-integration-sandbox.json) exercise durable
  account/deployment actions, exact deposit recovery without resend, testnet-domain
  core/oracle replay, the complete dedicated-account setup, funded maker inventory,
  six actual publisher transactions, proposal/challenge/arbitration and resolution
  import. The transport is explicitly local Sandbox; only the indexer fixture's
  status chain label is adapted. Contract execution and receipts are real.
- [35 browser regression checks](g7-testnet-preparation-browser.json) pass on the
  local Sandbox desk, including two maker quotes/fill, lost-response recovery,
  failed payout restoration, indexer risk blocking, settlement/redemption and
  viewport checks. This does not test vendor-wallet signing against public testnet.
- Five setup unit groups reject mismatched actions, alternate Wasm hashes,
  uncertain-operation resends and non-absence account errors; an HTTP 500 test
  confirms the administrative RPC provider makes only one transport attempt.
- Four testnet indexer groups cover HTTPS/network restrictions, event-domain
  separation, chain/genesis rejection and wallet/indexer deployment binding.
  Existing PostgreSQL, maker persistence and origin-guard suites pass (44 tests
  including HTTP subcases and Chromium navigation).
- Reference tests and 565 vectors, 11 schema groups, locked root/contract workspace
  tests, formatting and Clippy pass. All 59 archived privacy-track checksums match.

Commands:

```sh
node --test tests/demo/testnet.test.mjs tests/indexer/testnet.test.mjs
node --test tests/indexer/store.test.mjs tests/demo/maker.test.mjs tests/e2e/origin.test.mjs
node tests/sandbox/testnet-integration.mjs
node tests/e2e/browser.mjs --report research/reports/g7-testnet-preparation-browser.json
```

The first full setup test identified a missing administrator storage registration
and an insufficient publisher gas reserve. The corrected plan funds each of six
publishers with 0.5 test NEAR within the unchanged 80 test NEAR total. Administrative
transport retries are disabled; even a rejected or lost response remains unresolved
until matching finalized receipts are available. Deployment ActionView code is
verified against the SHA-256 digest of the exact Wasm artifact.

The funding page on loopback port 8791 was checked for public-plan rendering,
cross-origin rejection and insufficient funding rejection without consuming a
wallet handoff. Keys are private and ignored; the public plan contains only
accounts, public keys, budgets and artifact hashes. No owner wallet secrets were
loaded and no public transaction was sent.

Dependencies: APP-01/02, INF-01, MKT-02, ORC-02 and DEM-01. Invariants: domain-bound
finalized accounting, separate storage/operating reserves, durable nonce history
and no automatic resubmission of ambiguous operations. Failure path: stale or
mismatched indexing blocks new risk; uncertain administrative sends and payouts
remain retained/quarantined. Reviewers: infrastructure/contracts/security and
release QA — independent review pending.

The public maker runtime and full vendor-wallet lifecycle still require testnet
load/restart acceptance. Repeated series scheduling, remaining UI flow acceptance,
independent review, a fresh release rehearsal, publication reproduction and video
remain open. See [runbook](../../docs/TESTNET_SETUP.md).

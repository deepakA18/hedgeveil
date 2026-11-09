# APP-01/02 NEAR Connect UI evidence

Recorded 9 November 2026. Implementation is local and bounded; G7/G9 remain
incomplete. No deployment, external message, public release or independent
approval was produced.

The separate loopback testnet desk uses NEAR Connect 0.12.0, pinned Meteor/Intear
executor metadata and SHA-256-verified local assets, with an explicit account
picker and durable handoff/recovery. The neutral vanilla app and Sandbox signer
flow remain. [Usage and limits](../../docs/NEAR_CONNECT.md).

Dependencies: SDK exact intents and FileJournal, APP-02 finalized previews,
vendor connector, and deployment/indexer acceptance for actual testnet funding.
Invariant: the attempt is persisted before the wallet is called; a response/hash
alone is never success. Failure paths: concurrent handoff, changed wallet/account/
network, absent deployment, unhealthy indexer, lost response, RPC outage,
unmatched hashes and failed executor integrity. Reviewer: Product/QA/contracts/
security and independent review — **pending**.

## Results

| Evidence | Result | Actual scope |
| --- | --- | --- |
| [Connector/gateway](g7-near-connect-browser.json) | 25 checks passed | Chromium, real NEAR Connect library and iframe protocol; controlled account/signing executor; explicit HTTP/RPC fault fixtures; two actual Sandbox wallet-transport sends, 19 recorded Sandbox transactions including setup |
| [Existing app regression](g7-near-connect-app-regression.json) | 35 checks passed | Actual compiled contracts, PostgreSQL and Chromium; 43 recorded Sandbox transactions |
| SDK, wallet boundaries and UI model | 34 unit groups passed | Includes exact one-yocto precision, selected account/network, injected wallet replacement rejection, unsafe outcome handling and gateway profile guards |
| Declarations | Passed | Strict SDK checks; vendor Wallet Selector/NEAR Connect compatibility with bundler resolution and vendor declaration checking skipped |
| Root/contracts workspaces | Passed | Locked tests, formatting, root all-target Clippy and contracts Wasm-target Clippy |
| Reference and schemas | Passed | 5 reference tests, 565 shared vectors, regenerated schemas + `--check`, 11 schema tests |
| Release/review packaging | Passed | 9 release and 12 review-package tests; full release rehearsal not rerun |
| Historical archive | Preserved | All 59 checksum entries match |

The actual Sandbox deposit was broadcast once through the connector iframe;
the fixture then deliberately lost its response. Recovery stayed
`SUBMISSION_UNKNOWN` until the exact matching hash was supplied. It then
confirmed finalized receipts without another wallet call. This establishes the
connector serialization and SDK recovery path, not Meteor/Intear behavior.

The HTTP gateway fixture separately verifies the unhealthy-indexer gate,
available exit preview, one winner for concurrent handoffs, forbidden server
submission, persisted untrusted hashes, and no cancellation/resend of an
attempted operation during an RPC outage. Its responses are not deployment or
transaction evidence.

Production wallet choices were rendered at 375/768/1280 pixels and inspected
visually. Controlled iframe checks cover multiple-account selection, restored
connection after reload, disconnect even when vendor sign-out fails, Escape/focus return and CSP. Local screenshots
are in `target/near-connect-wallets-*.png`; they are not installed-wallet evidence.

One preliminary contracts Clippy command used the unsupported host target and
failed near-sdk's target guard; the required Wasm-target command passed. Schema
validation initially could not resolve PyPI in the network sandbox; the same
pinned dependency check passed with network access. Neither failure was waived. The new disconnect/reload check also initially exposed
a timing race: local selection was removed only after awaiting vendor sign-out.
The fix removes it before that await; the final 25-check run passes.

## Remaining acceptance

- Actual installed Meteor/Intear testnet connect/sign/redirect/reject behavior,
  wallet account changes, mobile/popups and accessibility beyond this fixture.
- Verified public testnet deployment/authority records and real receipts.
- INF-01 testnet reconciliation: launcher deliberately exposes
  `TESTNET_INDEXER_PENDING`, blocking new funding/trading. It must not be replaced
  with an assumed healthy snapshot to make a demo pass.
- Hosted multiuser authentication and per-account authorization if a public
  service is later requested. The current API is local-owner only.
- Independent review, approved policy scope and fresh complete release rehearsal.
  The release script now includes the connector phase and asset preparation;
  previous release archives are historical, not evidence for this increment.

Pinned executor sources can change or disappear upstream. Startup verifies
cached bytes; a fresh asset download fails closed if bytes differ. There is no
silent upgrade, blanket vendor security approval, or production readiness claim.

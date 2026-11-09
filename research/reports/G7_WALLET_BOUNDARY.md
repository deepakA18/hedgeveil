# APP-01 wallet boundary — 9 November 2026

**Implemented and locally tested; connected external-wallet/public-testnet
acceptance remains pending.** Production and experimental testnet vault methods
remain disabled. No public deployment or independent approval occurred.

The SDK now accepts an explicit HTTPS testnet profile and binds intents to its
network, chain/genesis, contract and code identity. A durable `handoff` claims an
operation before returning its exact transaction request. The browser-portable
adapter checks selected wallet/account/network and uses the official Wallet
Selector 10.1.4 action factory, preserving gas/deposit as integers and encoding
arguments as UTF-8 bytes. Chromium exposed the factory's Buffer-dependent object
overload; the final byte-argument path runs without a Node Buffer global.

Wallet responses and redirects supply recovery hints, not success. Candidate
hashes survive restart without poisoning immutable validated bindings. Receipt
recovery checks the actual transaction and linked finalized outcomes. Atomic
hash ownership also prevents one receipt from confirming two identical retained
operations, including concurrent recoveries and legacy journals. These are local
journal guarantees, not on-chain idempotency or proof of which browser prompt
caused an otherwise identical transaction. See [usage and limits](../../docs/WALLET.md).

## Recorded checks

| Suite | Checks | Execution evidence |
|---|---:|---|
| New Chromium signing boundary | 14 | 24 real local transactions; [report](g7-wallet-boundary.json) |
| Existing SDK/CLI and payout-fault regression | 19 | 31 real local transactions; [report](g7-wallet-client-regression.json) |
| Existing application browser regression | 35 | 43 real local transactions; [report](g7-wallet-app-regression.json) |

All 68 runtime checks passed on the final executable inputs. The new suite uses
the actual vendor action factory in Chromium but a **test wallet transport** with
generated keys in the Node test process. It covers storage funding, a large exact
deposit plus one yocto, split/merge, a refused foreign redirect, response loss,
browser reload, a fresh CLI recovery, failed native payout restoration, successful
withdrawal and indexer reconciliation. It does not exercise an installed wallet
extension, public redirect service or public testnet deployment.

Fourteen existing SDK unit groups and twelve new wallet/profile groups pass.
New transport fixtures cover HTTPS/domain guards, quote-domain separation,
disabled testnet vault methods, deployment changes before handoff, concurrent
attempts, selected-account races, action format/precision, sanitized errors,
offline hash hints, duplicate-hash ownership and redirect ambiguity. Those fixture
responses are not represented as chain receipts. The real Sandbox regression
keeps successful transfers with failed callbacks quarantined as UNKNOWN.

Both Rust workspaces pass locked tests, format and Clippy. The reference model,
565 shared vectors, schema regeneration/check and 11 schema groups pass. Nine
release-package and twelve review-package tests pass. All 59 historical archive
checksums remain unchanged. No contract or financial behavior was changed.

SDK declarations pass strict NodeNext checking. The actual vendor interface call
site and a negative action-type case pass in bundler mode with `skipLibCheck`:
upstream declaration imports prevent a clean full NodeNext library check, so no
complete vendor declaration validation is claimed. Exact commands and dependency
versions are in [WALLET](../../docs/WALLET.md); source/report hashes and scope flags
are retained in [the summary](g7-wallet-summary.json).

## Release boundary

The existing desk remains a local Sandbox application. Wallet connection UI,
authenticated intent/hint transport, installed-wallet redirect/extension tests,
actual faucet-funded testnet receipts and authority inventory remain open. No
active deployment registry entry, credentials or archived evidence was changed.
Independent review, policy selection and remaining G9 requirements still apply.

The release runner now includes wallet dependencies, unit/type checks and the new
browser phase on subsequent runs. Its prior 109-check archive is preserved and
does not cover this increment. A fresh full release rehearsal and review package
are required for the next release candidate. Dependencies: APP-01, normal core,
G7 local services and the pinned vendor interface. Invariant: claims derive from
actual matching execution within the recorded scope. Failure paths remain
unresolved without evidence and never trigger automatic resend or restoration.
Reviewer: product/contracts/security and independent reviewer — pending.

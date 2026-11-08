# G7 / APP-02 local browser evidence

Recorded 8 November 2026. [Machine evidence](g7-app.json) contains 35 passing
checks, 16 submitted browser operation records, 25 retained journal operations,
43 actual deployment/method transactions with full finalized RPC outcomes,
22 source hashes and final PostgreSQL-reconciled snapshots. Transactions from
maker worker retirement are separately checked against their real receipts;
not every account-creation or service transaction is in the 43-entry list.
No public deployment, wallet-provider certification or independent sign-off is
implied. Product/QA and independent security review remain **pending**.

Dependencies: APP-01 exact SDK/journal/receipt classifier; INF-01 indexer; the
normal G3/G4/G5/G6 Wasm and VLT-02 risk states. Invariant: browser displays and
submitted integers agree with actual ownership, finalized events and callback
results. Synthetic reference marks never imply executable liquidity or NAV.
Failures stay explicit and never cause automatic resend, refund or success.

The browser run uses Node 24.8.0, Playwright 1.62.1, Chromium 151.0.7922.34,
Sandbox 2.14.0 and real local PostgreSQL. The normal clearinghouse and real
synthetic settlement oracle are loaded from verified build manifests. Two maker
processes own independent Ed25519 RFQ keys. Full-access transaction keys stay in
memory in the local demo process; no browser wallet or `.env` is involved.

Verified through the actual UI:

- A new internal-ledger account sees storage/gas and custody disclosures, registers
  storage, deposits an exact fractional NEAR amount, splits and merges pairs.
- Two workers return signed funded offers; a browser fill consumes its actual nonce.
- Exact basket preview, mint and in-kind redemption match share/holding changes.
- Cancelled signing creates no transaction and cannot reuse its operation ID.
- A dropped HTTP response after finalization leaves exactly one deposit credit.
  Reload reads the journal, and submitting the same ID again is rejected.
- A lost signer response without a retained hash stays SUBMISSION_UNKNOWN.
  A new-ID deposit is blocked; the actual signing hash recovers the original send.
- Native payout success and a real missing-recipient failure are classified from
  finalized receipts. Confirmed failure restores free collateral; ticket cleanup
  is a separate reviewed action.
- Indexer failure blocks new risk but leaves verified merge previews available.
  Missing storage, insufficient wallet funds/gas, expired quotes and cancelled
  epochs prevent sending. Maker retirement displays a no-quote response.
- Committed synthetic observations enter a real disputed case. Unresolved
  redemption is blocked; adjudication/import enables actual browser redemption.
- Evidence pages return stored receipt IDs and block provenance. Maker views show
  actual inventory/registry; nonce cancellation, epoch advance and key revocation
  execute through the same SDK journal and receipt checks.
- Cross-origin signing and arbitrary-file requests fail. Unavailable browser
  storage prevents preparation. No uncaught page exceptions were observed.
- No document overflow at 375/768/1280 px. Light/mobile and dark/reduced-motion
  screenshots were captured under ignored `target/app02-*.png` and visually
  inspected. Keyboard focus reached real interactive controls. This is a limited
  Chromium check, not a comprehensive accessibility or cross-browser assessment.

Additional checks passed: 14 SDK unit groups, four browser-model groups, five
indexer-model groups, TypeScript declarations, five rational payoff tests and
565 reproducible vectors, root locked workspace tests/format/Clippy, contract
workspace locked tests/format and Wasm-target Clippy, schema regeneration/check
and 11 schema tests. The first host-target contract Clippy invocation was rejected
by near-sdk's target guard; the correct Wasm-target invocation passed. No Rust
financial behavior or schemas changed.

Reproduce with [README commands](../../README.md) and
[application behavior/recovery notes](../../docs/APP.md). The test deliberately
uses direct in-process oracle administration to create the disputed/finalized
scenario; those admin helpers are not browser endpoints. Ordinary demo startup
uses a future immutable synthetic observation window and does not automatically
settle it. Tests can advance Sandbox time; the UI cannot.

Limits: this is a disposable local signing bridge. Public wallet/testnet
integration, persistent deployment restart, full release/fresh-clone walkthrough,
all browser callback-fault/delayed-oracle presentations, recurring strategy/roll
UX and economic selection, load/hostile-client testing, broader browser and
accessibility testing and independent review remain. The SDK's existing callback
fault tests still cover UNKNOWN classification; this browser run adds actual
successful and confirmed-failed payouts, not a new callback-fault deployment.
G7 and G9 remain incomplete; production is disabled.

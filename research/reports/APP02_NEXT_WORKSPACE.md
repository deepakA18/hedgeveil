# APP-02 React workspace — 12 November 2026

## Implemented scope

The Next.js frontend now includes Markets, Trade, Portfolio, Funds, Activity,
Liquidity and an unavailable-vault page, using the approved paper/lime/forest
palette. Homepage app links open `/markets`. This supersedes the earlier
homepage-only migration scope; the legacy runtime and journal remain intact.

The app uses the existing SDK's exact amount parsing and wallet boundary,
NEAR Connect 0.12.0 and the existing locked Meteor/Intear executors. Actual API
responses populate markets, funded quotes, finalized holdings, storage, maker
inventory and retained operations. Normalized payoff illustrations are labeled
and never used as prices or transaction amounts. Upside corresponds to N and
capped value to P; technical terms remain available in expanded details.

The same-origin Next route exposes a small explicit API allowlist to the fixed
loopback backend. It checks Host/Origin/Fetch Metadata, rejects arbitrary paths,
limits JSON bodies, strips unrelated query fields and never retries a mutation.
Server-side signing is not exposed. Wallet executor content is independently
SHA-256 verified. Workspace responses use nonce-based CSP; external wallet image,
stylesheet and font resources, Meteor bridge WebSocket and Intear wallet frame
are narrowly allowed, without external scripts.

Signing requires durable backend handoff and browser storage before the existing
SDK opens a wallet. Uncertain outcomes remain unresolved and recover via receipts.
Account changes invalidate reviews and old asynchronous reads. Withdrawal review
shows the destination and exact amount. Vault subscriptions stay disabled.

## Dependencies, invariant and failure path

Dependencies: APP-01 SDK and durable wallet lifecycle; APP-02 approved homepage;
INF-01 actual indexed state; DEM-01 retained wallet runtime; existing funded
maker and oracle deployments. No contracts, payout math or settlement policies
changed. No root credential file is copied into the frontend.

Invariant: frontend styling never manufactures a balance, offer, receipt or
successful payout; the backend remains authoritative for intent validation,
chain checks and recovery. Missing service data disables affected actions and
shows unavailable state; stale indexer checks block new trades. Wallet exceptions
and unknown responses never authorize a resend. Public deployment remains separate
because the bridge deliberately accepts only loopback origins.

## Verification

- Optimized Next.js build and strict TypeScript passed.
- Prettier and `git diff --check` passed.
- 21 deterministic bridge and existing SDK wallet-boundary checks passed. The
  controlled test transports verify denial/failure behavior; they are not live
  chain evidence.
- 15 homepage/workspace browser checks passed against the retained real backend.
  Seven workspace routes were checked at 375, 768 and 1440 px, including no
  horizontal page overflow, hydration errors or console errors. Tests cover
  navigation, deep links, synchronized position/payoff controls, disabled
  disconnected trading, wallet picker focus/Escape, offline-service failure,
  nonce rotation, deployed API denial paths and both executor content hashes.
- Both actual pinned wallet executors loaded with HTTP 200 and initialized
  without CSP violations or page errors in Chromium. Wallet windows were not
  approved; this establishes loader compatibility only, not signing acceptance.
- Homepage coverage includes native FAQs without JavaScript and 762 illustrated
  payoff points checked against the shared exact arithmetic.
- Desktop Trade/Markets/Liquidity and mobile Trade screenshots were captured
  under `/tmp` for local visual inspection; these are not release artifacts.

Actual retained data at verification contained five series and no open series.
Eta was settled; the other retained series were past expiry. No new series,
quotes, balances or successful transactions were fabricated to populate screens.
Public account view shape was checked for `0xdeepak18.testnet`; this read-only
check is not proof of a wallet connection or new transaction.

## Remaining acceptance

Fresh connection and signing through the new React UI require the user's wallet.
This turn sent no transactions. Existing legacy-wallet receipts do not prove the
new interface's signing acceptance. A fresh open series is required for live RFQ
acceptance; historical series must retain their original settlement terms.

Independent product, accessibility, QA and security review remain pending.
Connected-account visual acceptance, full new-interface end-to-end wallet checks,
public hosting and G9 release completion are not claimed by this increment.

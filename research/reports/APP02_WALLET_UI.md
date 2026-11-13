# APP-02 wallet UI — 13 November 2026

Implemented around the existing pinned NEAR Connect 0.12.0 integration.

- Compact, light-theme wallet picker with locally served official Meteor and Intear logos.
- Header connection progress; failed connections return to the picker with retry guidance.
  The native picker closes before the connector handoff so wallet-owned overlays remain usable.
- Connected account button opens a compact account dialog: full account, account switching
  when multiple accounts are returned, clipboard result, explorer, funds, activity and disconnect.
- Empty account responses cannot produce a connected state. Public wallet identity is cleared
  on disconnect, sign-out and connection failure.
- Existing native-dialog focus trapping, Escape and trigger-focus restoration are retained.
  No new packages, remote image permissions, wallet executors, access keys or signing changes.

Dependencies: APP-02 frontend/provider, pinned wallet manifest/executors and SDK boundary.
Invariant: only validated wallet accounts become active; connecting never sends a transaction.
Financial intent, receipt recovery and UNKNOWN handling are unchanged.
Failure paths: retry on connection failure; clipboard failure offers manual copying;
unknown wallet/empty accounts are rejected; unavailable service disables connection.

## Evidence

- Next production build, TypeScript and formatting checks passed.
- 16 wallet/NEAR Connect boundary tests passed (`tests/wallet/near-connect.test.mjs`,
  `tests/wallet/boundary.test.mjs`).
- Three targeted browser tests passed: trade deep links/picker, bridge/executor boundaries,
  and picker at 375/768/1440px. Real retained backend; no successful responses mocked.
  Picker test checks local logo loading, overflow, keyboard order, Escape, focus return and
  zero POST requests. Screenshots visually reviewed at all three widths.
- Preview refreshed at http://127.0.0.1:3000.

Reviewer: implementation-agent self-review. Independent review pending.
Live wallet connection/rejection, multi-account switching, clipboard and disconnect acceptance
for the new account menu remain pending in the user's wallet. No signature or connected-wallet
acceptance is claimed by the unauthenticated browser checks. Existing backend release gates remain.

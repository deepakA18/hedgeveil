# APP-02 frontend self-review — 12 November 2026

Scope: the Next.js homepage and seven workspace routes, using the retained real
backend. Reviewer: implementation agent, requested by the user. This is a
self-review, not independent QA, accessibility certification or release sign-off.

Applied skills: Frontend Design Guidelines, Design Taste, Design Taste Frontend,
Web Design Guidelines, Product Review, Number Formatting and Page Load Animations.
Existing brand direction takes precedence over generic style recommendations.
No new design system, decorative animation library or mock live data was added.
Craft guidance: https://emilkowal.ski and https://github.com/emilkowalski/skill.
Web checklist: https://github.com/vercel-labs/web-interface-guidelines.

## Findings and changes

| Finding | Before | After | Evidence |
| --- | --- | --- | --- |
| Medium: mobile navigation | Links clipped off the viewport | Named menu dialog, all routes visible, Escape closes and restores focus | Browser test at 375 px |
| Medium: financial summaries | Long exact decimals dominated balances | Four-decimal display with explicit approximation or tiny-value marker; expand/copy exact value | u128/unit tests and real maker-balance browser check |
| Medium: unavailable trade | Disabled action lacked a nearby reason | Expired series, disconnected wallet, missing data and stale checks have explicit guidance | Actual expired-series browser check; other branches inspected |
| Medium: offer transport failure | Could appear as no available liquidity | Separate error alert; obsolete requests cannot replace newer selection results | Code review; fresh connected quote acceptance remains pending |
| Medium: dialog usability | Background could scroll | Scroll lock, native modal keyboard handling and restored focus | Menu and wallet-picker browser checks |
| Low: app hierarchy | Landing-page-sized headings and numbered navigation | Compact page titles, clearer table alignment and less empty panel space | Desktop/tablet/mobile screenshot review |
| Low: text and controls | Small labels and mobile form text | Larger supporting text, 16 px mobile inputs, readable chart labels and tabular figures | Layout inspector and screenshots |
| Low: state clarity | Health label could read like a permanent guarantee | Last successful fetch timestamp and last-check wording | Code and browser inspection |
| Low: keyboard/form details | Table scrolling and inline errors harder to reach | Focusable named table regions, scoped column headers, input names and focused form errors | Code review and keyboard browser checks |

The approved homepage composition, colors and CTA treatment remain intact.
Amount formatting is display-only: SDK math, signing quantities, transaction
reviews and on-chain financial behavior are unchanged. The display does not
invent a USD conversion. Missing/invalid quantities are unavailable, never zero.

## Verification

- Optimized Next.js build, TypeScript and Prettier checks pass.
- 23 amount, bridge and existing wallet-boundary tests pass.
- 16 homepage/workspace browser checks pass against the actual retained backend.
  Seven routes were checked at 375, 768 and 1440 px; no page overflow, hydration
  or console errors. Failure injection aborts requests only; it does not supply
  fabricated balances, quotes or successful receipts.
- Browser checks cover mobile menu navigation, modal Escape/focus/scroll restore,
  exact-amount copying, expired-market disabled guidance, offline service states,
  deep links, payoff selection, API restrictions and pinned executor hashes.
- Homepage checks retain 762 exact payoff-vector comparisons and no-JavaScript FAQs.
- Trade layout inspector improved from 2 failures / 5 warnings to no findings
  across 1440, 768 and 390 px. Its automated result is not a substitute for
  visual review: screenshots were inspected, including tablet chart-label and
  maker-balance typography corrections the detector did not catch.
- Local screenshots/reports are under `/tmp/hv-review-before`,
  `/tmp/hv-review-final` and `/tmp/hedgeveil-*-desktop.png`; these are transient
  inspection artifacts, not chain evidence or committed release artifacts.

No contract, schema or settlement behavior changed, so compiled-Wasm, Rust and
schema regeneration were not repeated for these frontend-only edits.

## Product assessment

Scores are subjective self-assessments against the Product Review rubric, not
measured user studies or production performance benchmarks.

| Dimension | Score / 10 | Reason and remaining gap |
| --- | --- | --- |
| Onboarding | 7 | Markets/payoff visible before connection; expired inventory prevents first trade today |
| Core experience | 5 | Real service wiring and exact review boundary; new React signing acceptance pending |
| Error handling | 7 | Clear unavailable states and no fabricated fallback; connected quote failures need live acceptance |
| Information architecture | 8 | Flat named routes and usable mobile navigation; trade selections are not persisted when changed |
| Visual design | 8 | Shared approved palette, compact workspace and responsive layout; connected forms need visual acceptance |
| Performance | 6 | Optimized build and visible loading; local checks do not establish field performance or indexer uptime |
| Accessibility | 7 | Native dialogs, labels, focus and readable controls; no full screen-reader or WCAG audit |
| Feature completeness | 5 | Core screens present; fresh end-to-end execution, public hosting and release gates remain |

Overall: 6.6/10. Visual consistency is ahead of live-flow acceptance. The next
priority is a real open market and wallet testing, not more decorative styling.

## Remaining acceptance and invariants

Dependencies: APP-02 React workspace, existing SDK, local API/indexer and makers.
Invariant: no mock market success, changed payoff terms, automatic signing,
collateral reclassification or optimistic receipt confirmation. Missing data
blocks the affected action; UNKNOWN outcomes remain recoverable without resend.

All five retained series were past expiry; no new market was fabricated. Backend
health reported new-risk checks pending during this review. A successful frontend
inspection does not establish a healthy indexer or authorize trading.

Next: restore fresh/reconciled backend state and create/verify an appropriately
configured real series; then accept connect, fund, quote/fill, settlement,
redemption and withdrawal through this React UI with actual wallet signatures
and receipts. Also inspect connected positions, review/receipt dialogs and
account-switch/reload recovery. Historical receipts from the old desk do not
prove acceptance of the new interface. Public deployment and independent
product/QA/security review remain pending. Vault and production stay disabled.

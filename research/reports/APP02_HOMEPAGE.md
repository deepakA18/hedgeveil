# Retail homepage — 11 November 2026

Implemented a first homepage following the user's white/black/NEAR-inspired
lime direction: architectural hero, three interactive introductory steps,
native FAQ disclosures, testnet labeling and links into the existing wallet desk.
No financial behavior, transaction signing, wallet state or live prices changed.

Dependencies: APP-02, existing wallet desk. Invariant: no fabricated activity or
transaction success; the page sends no transactions. Failure path: links require
the existing desk to be running; the homepage makes no availability guarantee.
Independent product/accessibility/security review and user design acceptance remain pending.

Run `node apps/web/homepage.mjs` for the isolated read-only preview on
http://127.0.0.1:8795 (optional `HOMEPAGE_PORT`). Its app links target the existing
desk on port 8794. The wallet server also serves `/home` after its next restart;
there links target `/#trade` on the same origin. Existing root wallet routing is retained.

Evidence: Chromium checks at 390, 768, 1024 and 1440 px verify no horizontal
overflow, loaded artwork, all three step selections, FAQ pointer/keyboard
operation, correct app links and no script errors. Desktop/mobile screenshots
were inspected locally. The preview rejects unknown paths (404) and writes (405).
`node --test tests/e2e/origin.test.mjs`: 45 passing checks, including external
homepage navigation and continued rejection of foreign API/write requests.
Node syntax checks pass. Contract suites were not rerun for this presentation-only change.

Artwork is AI-generated decorative imagery, stored locally with no external
font or image dependency. No hosted deployment is claimed. Other product pages
remain in the previous interface and need their own redesign and acceptance.

User-requested cleanup: removed all decorative arrow glyphs, the introductory
NEAR eyebrow, the hero test-token note, two specified FAQs and the FAQ eyebrow.
Chromium recheck at 390/1440 px confirms the removed content is absent, three
remaining FAQs, functioning step selection and no horizontal overflow.

## Problem, actions and comparison sections

User-requested content expansion replaces the generic introduction and steps
with the problem (margin-triggered exits), supported actions (upside,
capped-value exposure, early sale/redemption), and a concrete comparison against
Deribit inverse options. The comparison explicitly preserves shared limited-loss
features and explains native NEAR, contract balances, funded all-or-nothing fills,
claim/withdrawal steps and external-price dependence. P is not presented as a put,
a dollar guarantee or a live vault. No fabricated prices or performance graph.

Sources verified 11 November 2026:
- X public oEmbed for https://x.com/VitalikButerin/status/2061469961416032653
  returned author vitalik.eth / @VitalikButerin, date June 1 2026 and the quoted
  10-word title. Direct web fetch was forbidden; official oEmbed succeeded.
  The preview uses a short static excerpt, an initials avatar (not an invented
  photo), original-post link and explicit non-endorsement label. No X scripts.
- https://support.deribit.com/hc/en-us/articles/31424939096093-Inverse-Options
  supports base-currency settlement, upfront premiums, exchange trading and
  fully paid standard-margin long-option treatment. Linked on the page.
- https://support.deribit.com/hc/en-us/articles/25944769313309-Liquidations
  supports the margin-triggered liquidation explanation.
- docs/SPEC.md payoff, reserve, RFQ, oracle and withdrawal rules support the
  Hedgeveil column and position explanations.

Validation: Chromium at 375/768/1280/1440 px; all sections present, three action
choices selectable with Enter, no script errors or page overflow. The mobile
comparison scrolls horizontally within a named keyboard-focusable region.
Desktop/mobile screenshots inspected. Prior arrow and FAQ removals retained.
Dependencies/invariant/failure path remain as above; no backend changes.
User design acceptance and independent review remain pending.

## Additional comparison: Derive

Added Derive as the second external options venue. Verified its current v3
primary documentation rather than reusing older Derive Chain descriptions:
- https://docs.derive.xyz/supported-products — options, USDC and eligible collateral.
- https://docs.derive.xyz/getting-started/introduction — protocol subaccounts/batched Ethereum verification and withdrawal limits.
- https://docs.derive.xyz/standard-margin — no isolated margin requirement for long options; account-level risks remain.
- https://docs.derive.xyz/trading/order-types and https://docs.derive.xyz/trading/rfq — orderbook and quote-based execution.

Sources linked under the comparison. Limited loss is scoped to fully paid
standalone purchases; borrowing and other positions are not treated as risk-free.
Chromium checks at 375/768/1440 px passed: four columns, six complete rows, no
page overflow and horizontal mobile table scrolling. Desktop table screenshot
inspected. No transaction changes. Independent review remains pending.

Comparison presentation simplified at user request: eight rows containing only
Yes/No or short labels (cost + fees and payout currencies). Existing primary
sources support the entries; no new platform capabilities claimed. Purchase
scope and currency/platform-risk qualifications moved below the table. Hedgeveil
is correctly marked as lacking puts and automatic wallet payouts. Chromium
checks at 375/1440 px confirm 24 concise cells and no page overflow.

## Comparison focused on meaningful trade-offs

Replaced shared-benefit rows with mandatory full-payout reserves, possible seller
liquidation, portfolio margin, order-book availability, settlement location,
payout currency, puts and release availability. All cells remain short. Scope now
compares venue mechanics, not just standalone purchases. Notes distinguish
margined sellers from fully paid buyers and acknowledge Hedgeveil's capital
requirements, absent tools and testnet status. Full backing is not a safety guarantee.

Basis: SPEC Split/Fill reserve invariants; Deribit inverse-option short-margin
requirements and portfolio-margin documentation; Derive standard/portfolio margin
and orderbook docs verified earlier in this session. Deribit portfolio-margin
source added below the table. Repeat Derive web fetches failed this turn; retained
facts from the successful primary-source reads earlier, with no new Derive claim.
Chromium checks at 375/768/1440 px: eight rows, short cells, no horizontal page
overflow. No financial behavior changes. Independent review pending.

User requested removal of homepage testnet wording. Removed the heading badge,
availability row, footer label, CTA qualifier and test-token copy/metadata.
No mainnet availability claim was substituted. Operational docs and the wallet
desk still record the actual testnet network; no configuration or guard changed.

Removed the visible comparison notes and source-link block at user request.
Removed footnote markers and clarified the first row as “Full payout backing
required”. Source evidence remains in this report. Existing loss and early-exit
FAQs remain. Verified block/markers absent and comparison retains seven rows.

## Design questions FAQ

Replaced introductory FAQs with seven substantive questions: perps, spot limit
orders, liquidity fragmentation, maker availability, oracle outages, pricing and
remaining risks despite full backing. Reused native details/summary elements in
full-width bordered rows, preserving the approved light palette and no arrows.
All begin collapsed, following the supplied reference.

Answers grounded in SPEC's reserve/oracle rules, the current valuation.mjs
market model and recorded maker ownership/acceptance. Missing source observations
can leave a series unresolved after recovery; no automatic refund was promised.
No independent liquidity, guaranteed fills, fair prices or production status claimed.
Perp context checked against Deribit's official Inverse Perpetual / Funding
Specifications documentation (https://support.deribit.com/hc/en-us/articles/31424954847133-Inverse-Perpetual).

Chromium at 375/768/1440 px: all seven disclosures open and close with Enter,
answers present, no page overflow. Desktop screenshot inspected. No transaction
or contract modifications. Independent product/accessibility review remains pending.

FAQ correction following user feedback: the reference was for presentation,
not topics. Replaced the previous seven questions with Hedgeveil-specific
paired-position mechanics, capped downside exposure, NEAR payout units,
locked reserves, quote expiry/atomic fills, fixed series observation rules and
claim/withdrawal separation. Content follows SPEC payoff/accounting/oracle rules;
no reference-venue comparison or new financial behavior. Existing disclosure
layout retained. Chromium checks at 375/1440 px passed for seven accessible
answers, keyboard toggling and no overflow. Independent review pending.

## Centered dark hero redesign

User requested the supplied dark fintech hero composition. Replaced the split
architectural hero with centered two-tone typography, rounded working links and
two dark panels for the payoff and contract backing. Header follows the dark
palette; remaining homepage sections keep the light palette. No arrows, status
pills, invented prices, wallet balances, revenue or fake activity introduced.

A generated visual reference guided the composition; implementation uses native
HTML/CSS and inline SVG rather than placing a screenshot on the page. The old
sculpture asset remains preserved but is no longer loaded by the homepage.

The two selectable SVG curves use the SPEC complementary payoff equations,
normalized to one unit of backing and a strike ratio of one. 381 points per
curve, covering final price/strike ratios 0.2–4, were checked against the existing
public/model.mjs payoff function to 0.006 SVG units. This is a payoff illustration
before cost/fees, explicitly not a live quote, estimate of profit or time series.
Capped-value text distinguishes the NEAR amount from its dollar value.

Chromium checks at 375/768/1440 px passed: no horizontal overflow, keyboard
selection changes visibility and accessible descriptions, no script errors.
Desktop/mobile screenshots inspected; mobile line-break spacing and chart label
size refined. No backend, network configuration or financial behavior changed.
Independent review and user visual acceptance remain pending.

Hero palette correction: user intended reference composition only. Restored
original paper/ink/olive/lime tokens, flat buttons and light panels; removed
dark section styling and glow. Centered layout and payoff behavior preserved.
Brand guidance now explicitly separates reference composition from palette.
Chromium checks at 375/1440 px confirm original header/hero background, centered
copy, working payoff switches and no overflow. Desktop screenshot inspected.

## Approved homepage integrated into the wallet app

User accepted the light, centered homepage on 11 November 2026. The main wallet
runtime now serves it at `/` and `/home`; all app CTAs target `/app#trade`. The
standalone preview remains available via `npm --prefix apps/web run home`.
The desk wordmark returns to `/home`. Older root desk hashes redirect while
preserving query parameters; old wallet-return queries still serve the desk,
and new connector returns target `/app`. Sandbox `/` remains the desk.
This supersedes the initial preview routing described above.

Dependencies: existing APP-02 wallet server, connector and homepage assets.
Invariant: the homepage submits no transactions; origin checks, wallet recovery,
network settings and financial behavior remain intact. Failure paths: unknown
routes still return 404, cross-site fetches are rejected, and wallet-return data
is preserved for receipt recovery. Independent reviewer: pending; user visual
acceptance is complete for the homepage only.

Evidence: `node --test tests/e2e/origin.test.mjs tests/e2e/model.test.mjs`
passed all 53 checks. Syntax and whitespace checks passed. Restarted the retained
local runtime without resetting its database or journal. Chromium on port 8794
confirmed the approved heading, no horizontal overflow at 1440 px, CTA navigation
to `/app#trade`, the wallet-connect control, and `/#portfolio` redirect to
`/app#portfolio`, with no page errors. No wallet transactions were submitted.
Public hosting and the remaining trading UI redesign are outside this increment.

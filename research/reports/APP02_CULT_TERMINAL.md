# APP-02 — Cult UI trading terminal

13 November 2026. Implemented locally; independent review and fresh live execution acceptance pending.

## Scope and dependencies

The Next.js desk now uses Cult UI's MIT-licensed Halo Tabs, Halo Button and Family Drawer source components, with Base UI, Vaul and Motion dependencies pinned in the frontend lockfile. Source URLs and the license are retained in `apps/frontend/components/ui/`. The paper, forest and lime theme remains; gradients, glow and decorative button motion are removed. Tailwind utilities are scoped to the imported primitives and no preflight reset is introduced.

Dependencies: APP-02's existing NEAR Connect provider and SDK bridge, INF-01 retained snapshots, authenticated settlement evidence, the public Coinbase spot reader and the existing receipt journal. No contract, settlement terms, wallet authority or transaction payload semantics changed. Domain-specific price/position displays remain application code: Cult supplies interaction primitives, not financial calculations.

## Implemented surfaces

- Three desktop regions: persistent real series list, payoff/settlement/scenarios, trade ticket. Each region can scroll without moving the surrounding controls. Mobile uses a horizontal series list and Cult drawer for the ticket. Cult keyboard tabs expose Positions, submitted Orders and Activity in a collapsible account dock.
- Global spot, source and age; degraded-data strip; service details with reconciled block and discovery lag; unresolved-operation and withdrawal counts linking to recovery. Discovery lag is not misrepresented as complete reconciliation lag.
- Series grouping by expiry, local and UTC timestamps, moneyness, actual lifecycle, request-scoped signed offer price/quantity. Detail mode adds intrinsic split, outstanding claims and reserve. Closed series are history, not made tradable.
- Quote totals include fees, price per unit, cost/backing percentage, max purchase loss, currency-specific breakeven, move from spot, signed size, responding maker count and expiry. There is no fabricated order book or standing two-sided feed. A signed size is not a reservation or guaranteed execution; backend preflight and receipts remain authoritative.
- Exact bigint payout and P&L calculations, USD/NEAR chart, labelled strike/spot/breakeven and five spot-relative price scenarios. Without a quote, the chart is payoff-only and cost fields are unavailable. The Trade page no longer presents model marks as executable prices.
- Profile-bound settlement evidence: three actual samples for native-sampled-v1, report times, ages, source, window status and review timing. Existing series use their own immutable windows; no assumed universal 360-second slot length. Missing samples show indefinite delay rather than an invented ETA. Other profiles do not inherit sampled-profile assumptions.
- Position actions use exact actual holdings: sell request, matched-pair merge and finalized claim. Finalized NEAR payout and indicative current USD conversion are separate. The detail exposure is labelled **intrinsic payoff slope, not model delta**.
- Separate free collateral, paid storage, required storage, wallet balance and pending withdrawals. RFQs reserve no funds, so the quote-reserve cell says so rather than inventing a balance. Funds no longer duplicates the wallet/free summary cards.
- UNKNOWN retains a distinct quarantined state and recovery path. Activity is not cleared when a history refresh fails. Completion still requires finalized receipts. Existing wallet picker and exact-action approval remain in place.

## Data and failure behavior

Spot is requested every five seconds while visible, with a five-second backend coalescing cache. Both observed and fetched timestamps must pass the **30-second** hard display limit; failure removes spot-derived estimates, never substitutes zero or fixtures. Explicit hypothetical reference-price calculations remain illustrations, not live USD valuations.

Countdowns use `/api/clock` plus monotonic elapsed time, resynchronized every 30 seconds. A failed clock fetch clears the clock; an unsynchronized clock older than 90 seconds also becomes unavailable. Chain timestamps and backend quote validation remain authoritative. The clock is a display/early-gating aid, not settlement evidence.

Finalized account state refreshes every 30 seconds. The current bridge performs multiple RPC reads at one finalized block; a three-second refresh would amplify that workload, so no unsupported websocket or high-frequency indexer transport is claimed. New-trade UI gates also reject an account snapshot not refreshed within 60 seconds. Exact preflight checks still run before signing. Quote response version/fingerprint checks reject late responses after account, quantity or market selection changes.

Expiry does **not** lock a payout by itself. Only a finalized clearinghouse coefficient produces the fixed-payout display; an oracle finalized before its core callback remains pending. Delayed positions explain this and show elapsed time since expiry. After finalization, the fixed NEAR amount still changes in current USD value.

NEAR-basis purchase breakeven uses `K/(1-c)` for N and `K/c` for P, where `c` includes fee per unit. USD-basis breakeven uses entry cost converted at current fresh spot, with future payoff valued at the hypothetical reference price. These are different cost bases; charts and quote summaries identify their basis and exclude gas. Degenerate/unreachable thresholds are not shown as finite prices.

## Validation

- `npm --prefix apps/frontend run build`, `typecheck`, `format:check`.
- 17 deterministic amount, market-display, mark/planner and terminal-data tests, including 2,400 exact scenario/reference comparisons in the existing market suite.
- 19 browser-suite checks passed against the retained real backend, with failure injection only for unavailable services. No successful balances, quotes, wallet sessions or receipts are mocked.
- 16 existing wallet/NEAR Connect boundary tests passed. No Rust/contracts changed; the Rust/Sandbox suite was not rerun for this UI-only change.
- Desktop/tablet/mobile review at 375, 768, 1280 and 1600 pixels; no page overflow or browser errors. Keyboard focus, drawer dismissal, quote gates, URL persistence, sample evidence and wallet executor boundaries checked. Vaul overscroll decoration is suppressed to avoid empty drawer scrolling; disabled requests reference their blocking message for assistive technology.

## Remaining acceptance and limits

The actual retained deployment currently has five closed series. Fresh funded RFQs, connected-account controls and transaction signing through this updated composition require real open markets and wallet acceptance. This task creates no new series and signs no transactions. Historical eta evidence is real; it is not proof of a new market lifecycle.

The ten-market daily/weekly ladder remains blocked by the current eight lifetime series-slot capacity and the ORC-04/MKT-04 new-profile acceptance work. Auto-listing, auto-roll, public hosting and G9 completion are not claimed. No atomic storage-plus-deposit workflow is introduced; existing separate approvals remain.

A true model delta, aggregated live bid/ask depth across all markets, and guaranteed sell availability are not supplied by the present backend. The UI exposes exact intrinsic slope and request-specific quotes instead. The oracle can still delay settlement indefinitely when required evidence is missing.

Reviewer: implementation-agent self-review. Independent review pending.


## Settled-series corrections — 13 November 2026

The UI now distinguishes actual finalized results from hypothetical payoffs.
Eta's retained clearinghouse result is `X_M = 3.71605`,
`p = 990917775595053887864802 / 10^24`,
`n = 9082224404946112135198 / 10^24`. The sample prices are 3.71845,
3.7158 and 3.7139. Display-rounded reports must never be averaged to recover
the final price. The UI reads the stored result, shows approximately 0.9909 P
and 0.0091 N NEAR per unit, and exposes the unrounded source prices.

Finalized charts pin to that result and cannot scrub; their line is final price,
not current spot, and the five hypothetical scenarios are hidden. The Y axis
now fits the actual curve endpoint, labels three ticks, and states quantity.
Default quantity is one, while explicit URL quantities remain unchanged.
Historical moneyness uses K/final price only; pending rows say final price pending.
Samples show their slot bounds, report offset from slot start and age at acceptance,
not an unhelpful age relative to today. Missing slot numbers appear in delayed rows.

Reserve and outstanding P/N are visible without detail mode. The selected-series
ticket exposes actual holdings, matched pairs and a merge review for pre-finalized
series. Merge requires both sides and a successful transaction; it is not a
guaranteed market sale. Existing SDK preflight and exact-action signing remain.
Disconnected or unavailable account data is not rendered as a zero balance.

The disabled request button carries its blocker (e.g. Market closed); unavailable
quote fields use the same gate enum and concise labels. Closed rows drop their
redundant bid/ask/Closed line.

Validation: production build/TypeScript/format and 15 deterministic checks passed.
All 19 existing browser checks passed across the full run and targeted reruns
after correcting an SVG text assertion; mobile/default quantity and finalized
axis checks were repeated against the final build. The browser suite was adapted
to actual finalized/unfinished series, including read-only final point, no current
spot marker, plot bounds/units, exact source data, missing slots and mobile defaults.
No contract changes or on-chain actions. Independent review and connected-wallet
merge/signing acceptance remain pending.

**Open root issue: MKT-05 activation.** Reinspection confirms `MAX_SERIES = 8`,
fixed `[Position; MAX_SERIES]` account encoding, five retained registered series,
and a constructor-bound oracle profile checked on registration. The requested
ten-market daily/weekly TWAP ladder cannot be enabled on this deployment by a UI
change or by raising a constant in place. It requires a compatible versioned core
with scalable positions, the accepted TWAP runtime/valuation path, real funded
maker inventory, collector/indexer integration and new public receipts. Existing
claims and exits must remain available. No sampled-profile replacement markets
were silently issued. Ladder activation is still not implemented.


## Exit and supply follow-up — 13 November 2026

Delayed series expose the merge panel at the top of the ticket. Disconnected users
can open the existing NEAR Connect picker from "Connect wallet to merge"; connected
users review the exact minimum of their P/N holdings using the existing SDK. No
merge or receipt success is inferred from clicking connect. Missing balances,
zero pairs and a busy/unready wallet keep the merge action blocked. Finalized
series do not offer merging.

Actual eta counters explain its outstanding supply: minted per leg 4, merged
pairs 0.005, P redeemed 0.10, N redeemed 0.05. Redeemed units are derived from the
contract's cumulative split/merge counters and outstanding quantities, not from
the outstanding-leg gap alone; malformed/missing counters produce unavailable
values. The marks-response height type now matches the existing canonical state
height type (number|string|null), fixing a type-check mismatch without conversion.

Closed Buy/Sell toggles are disabled. Quote values use dashes with one shared gate
message. Exact K and final-price ticks replace evenly spaced interior ticks,
with separated label tiers for nearby values. All-missed windows say elapsed
with no reports; partially missed windows retain the individual slot numbers.

Build/TypeScript/format and seven terminal-data checks passed. Targeted real-data
browser checks and responsive screenshots cover the changed controls. No fixtures
were used as successful live responses; no transaction was submitted. Independent
review and connected-wallet merge acceptance are pending. The ten-market ladder
is still not active; contract capacity/new-profile acceptance remain required.

### APP-02 chart inspection and compact footer — 2026-11-13

Graph hover/tap/keyboard inspection now shows the selected price, NEAR/USD payout
and P&L when a cost is available. Finalized-series inspection is explicitly
hypothetical; the actual settled result remains fixed. A shared compact footer
replaces the homepage tagline and workspace footer, using existing documentation,
FAQ, pricing, NEAR and GitHub destinations in the existing theme.
Dependencies: exact payoff helpers, retained settlement and spot/cost evidence.
Invariant: no financial behavior, wallet submission or settlement-state changes.
Failure: absent cost leaves P&L unavailable; stale spot cannot supply USD entry
cost. Evidence: production build, typecheck and formatting passed; two focused
workspace browser tests passed, plus touch inspection at 390px with no horizontal
overflow. Desktop footer measured 49px; desktop/mobile visuals self-reviewed.
Reviewer: implementation-agent self-review; independent review pending.
This UI update does not complete the MKT-05 live ladder activation.

### APP-02 footer placement correction — 2026-11-13

Moved the shared footer outside the content frame, with a full-width divider and
an inset link row (82%, capped at 1280px). Removed the trailing blank scroll area:
chart screen-reader instructions now have a positioned containing block inside
the scroll panel. Dependencies: existing shell and shared footer. Invariant:
content/actions and keyboard instructions are preserved. Failure path: mobile
links wrap without horizontal overflow. Evidence: build/type compilation and
format check passed; full-page desktop (1512px), mobile (390px), and homepage
browser checks put footer bottom within 1px of viewport bottom at end of scroll.
Desktop footer 53px; mobile 89px. Full-page screenshots self-reviewed.
Reviewer: implementation-agent; independent review pending.

### APP-02 settlement clarity and merge visibility — 2026-11-13

Backing now reads "NEAR backing remaining" with six display decimals and exact
atomic units retained; outstanding claims remain separately labelled in units.
The final-price gridline/tick is solid and drawn above the fill; strike caption
uses the same exact price as its tick. Delayed rows omit redundant final-price
pending text. Finalized markets lead with the payout chart; settlement reports,
coefficients and supply remain available in an initially collapsed disclosure.
The existing delayed-series primary merge action was verified on real alpha
state (wallet-connect opens without a transaction). Mobile now labels its drawer
entry "Merge matching pairs". Finalized eta correctly does not offer merge.
Dependencies: exact display helpers, recorded core/oracle data, existing SDK.
Invariant: no change to settlement, holdings or signing; hypothetical inspection
cannot change the fixed payout. Failure: unavailable or unmatched holdings still
block merge; missing live offers stay unavailable. Evidence: production build
and type compilation; 10 amount/terminal tests and 2 focused browser tests pass;
desktop alpha/eta visuals inspected, mobile merge-to-wallet route checked.
Reviewer: implementation-agent self-review; independent review and connected
wallet merge acceptance remain pending.

MKT-05 remains unimplemented beyond the read-only planner: current core has eight
lifetime slots and a constructor-bound sampled oracle version; five slots are in
use. The ten-market rolling ladder requires a compatible new deployment/storage
layout and TWAP maker, collector/indexer and public receipt acceptance. No new
series, funded offers, chain actions or acceptance evidence were fabricated.

### APP-02 guided tour and contextual help — 13 November 2026

Implemented an optional six-step trade tour, launched with Start here and
replayable as Quick tour. It highlights the current controls, supports Back,
Next, Skip, Escape and focus restoration; dismissal is a nonessential local
preference. The tour acknowledges zero open markets and never clicks a wallet,
requests an offer or submits an action. Existing theme retained.

Installed Base UI Popover powers reusable information buttons with hover,
keyboard activation, touch, Escape/Close and viewport collision handling.
Quantity, set price, chart semantics, matched pairs, backing, trading balance,
quote reserves and quote execution/cost definitions now use contextual help.
Cost/loss values, price provenance, pending states and execution blockers remain
visible; underlying financial calculations and signing are unchanged.

Dependencies: APP-02, existing Base UI/Cult stack, current SDK/provider state.
Invariant: explanatory UI cannot fabricate markets or authorize transactions.
Failure: missing live markets remains explicit; unavailable storage does not
block the tour; unavailable amounts and gates keep their existing behavior.
Evidence: production build/type compilation, formatting, two guidance browser
checks and two existing focused workspace checks passed. Tests exercise six
steps/back/replay/dismissal, real no-open state, focus, hover/keyboard/touch,
mobile fit and zero tour POSTs. Desktop/mobile screenshots self-reviewed.
Reviewer: implementation-agent; independent review and new-user usability
acceptance remain pending. Backend work remains in DEFERRED_BACKEND.md.

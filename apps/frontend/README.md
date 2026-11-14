# Hedgeveil frontend

Next.js App Router, React and TypeScript implementation of the approved light
homepage and application workspace. All pages use reusable JSX components.

```sh
npm ci --prefix apps/frontend
npm --prefix apps/frontend run dev
```

Open http://127.0.0.1:3000. To run the optimized build, stop the development
server first, then run:

```sh
npm --prefix apps/frontend run build
npm --prefix apps/frontend run start
```

Dependencies are pinned; system fonts avoid build-time font downloads. Scripts
disable Next telemetry. The trading service must remain running at
http://127.0.0.1:8794 with its retained deployment and journal. Do not reset that
service or initialize a new deployment just to start the frontend.

## Pages

- `/`: approved homepage; app links open `/trade`.
- `/markets`: compatibility redirect to `/trade`; open series and history live in the trading workspace.
- `/trade`: buy/sell requests, funded offers, review and an explanatory payoff chart.
- `/portfolio`: finalized holdings, redemption, merging and creating pairs.
- `/funds`: account storage, collateral deposits and withdrawals.
- `/activity`: retained signing attempts, receipt recovery and withdrawal tickets.
- `/liquidity`: actual project maker inventory and connected maker authorization controls.
- `/vault`: disabled research status; no deposit controls.

`components/desk/DeskProvider.tsx` owns the pinned NEAR Connect wallet and account
state. `components/home` retains the approved homepage. Shared exact amount and
wallet-boundary code comes from `packages/sdk`; no financial behavior is redefined.
The chart is a normalized payoff illustration before cost and fees, not a market
price or a simulated offer. Live balance/price failures never substitute fixtures.

## Local API boundary

The new React workspace calls a same-origin allowlisted bridge at `/api/desk`.
The existing service still owns the immutable intent, durable handoff, journal,
receipt reconciliation and live contract checks. The browser wallet signs;
the frontend loads no wallet private keys or service credentials. The bridge
cannot invoke server-side submission. It checks Host, Origin, Fetch Metadata,
JSON content type and body size, and never retries a mutation.

`/wallet-executors` serves only the existing pinned Meteor/Intear lock entries,
verifying SHA-256 before returning the code. Workspace pages use nonce CSP.
Unknown signing outcomes lead to Activity recovery, never automatic resubmission.
Changing accounts invalidates the current review and ignores old asynchronous
balance responses. Wallet returns target `/activity` and are recovery hints only.

This bridge is **loopback-only**, not a public backend deployment. Settings:

| Variable | Default | Use |
| --- | --- | --- |
| `HEDGEVEIL_DESK_URL` | `/trade` | Optional public homepage destination, evaluated on the server; legacy `/markets` maps to `/trade` |
| `HEDGEVEIL_FRONTEND_ORIGIN` | `http://127.0.0.1:3000` | Exact browser origin for the local bridge |
| `HEDGEVEIL_BACKEND_ORIGIN` | `http://127.0.0.1:8794` | Fixed retained wallet service origin |

Both bridge origins accept only HTTP `127.0.0.1` without credentials, paths,
queries or fragments. Use this address rather than `localhost`. Keep these server
settings out of `NEXT_PUBLIC_*`. If customizing, copy this app's `.env.example`
to `.env.local`; **never copy the repository's credential file**.

The 13 November layout-2 runtime uses `http://127.0.0.1:8796`. Point
`HEDGEVEIL_BACKEND_ORIGIN` there and restart the frontend after verifying its
deployment and reconciliation. Old balances and exits stay at
`http://127.0.0.1:8794/app#portfolio`; they do not transfer to the new core.
Use a full page reload after switching deployments so wallet reviews and
operation recovery use the new contract binding.

## Verification

With the built frontend and real retained backend running:

```sh
npm --prefix apps/frontend run typecheck
npm --prefix apps/frontend run format:check
node --test tests/e2e/next-bridge.test.mjs tests/wallet/near-connect.test.mjs tests/wallet/boundary.test.mjs
npm --prefix apps/frontend run test:browser
```

Browser checks use Playwright in `apps/web`. Install its locked dependencies and
Chromium if needed. `FRONTEND_TEST_URL` changes the test address; bridge origins
must match. The workspace integration suite requires real retained markets and
wallet executors. It covers all seven routes at 375/768/1440 px, navigation,
position/chart synchronization, wallet picker, offline failures, CSP and API
boundaries. It sends no wallet transactions. Homepage checks include keyboard
interaction, no-JS FAQs and 762 payoff points against shared exact arithmetic.

Fresh external-wallet signing acceptance through this React frontend, independent
review and public hosting remain pending. Prior receipts from the legacy desk do
not establish acceptance of this new UI. The legacy desk remains available for
existing recovery paths. No open series means no new offers; creating new series
is a separate backend operation, never a frontend fixture.


## Retail trade context

The workspace uses Trade / Portfolio / Activity navigation. Market history,
funding and maker/pricing tools remain secondary routes. `/api/spot` retrieves
the fixed public Coinbase Exchange NEAR/USD ticker; no API key is required.
Spot is indicative only, refreshed every 30 seconds while visible and rejected
after 120 seconds. Missing data removes USD estimates rather than inventing values.

The scenario chart uses shared payoff rounding and actual selected buy-offer cost
for P&L. It is a hypothetical payout explorer, not a spot-price history chart.
First funding remains registration then deposit with separate wallet approvals.
Automatic receipt checks only verify attempted operations; they never resend.

Additional deterministic checks:

```sh
node --test tests/e2e/next-market-display.test.mjs tests/e2e/next-amount-display.test.mjs
```

Run from the repository root. See
[retail flow evidence](../../research/reports/APP02_RETAIL_FLOW.md) for calculation
conventions, live acceptance limitations and the automatic-roll release gate.

Compact trade data (13 November): `/api/marks` reads registered markets without a
wallet and exposes fresh legacy model marks or actual finalized coefficients.
It never signs an RFQ. Unavailable/TWAP-pending models remain unavailable; default
Trade inspects labelled recent history when there are no open markets. The Cult terminal supersedes model-mark display on Trade; the read-only marks endpoint remains available. Read-only
ladder policy and activation blockers are in `services/markets/README.md` at the
repository root. Run `node --experimental-strip-types --test tests/e2e/next-marks.test.mjs` from the root for mark/ladder boundary checks.


## Cult UI terminal

The trading workspace uses Cult UI Halo Tabs, Halo Button and Family Drawer,
manually installed from the official MIT registry. Source attribution and license
are in `components/ui/CULT-SOURCES.md` and `CULT-LICENSE.md`. Tailwind v4 utilities
are scoped through `(desk)/cult.css`; `terminal.css` applies the accepted Hedgeveil
palette, desktop rails and mobile drawer without changing the homepage.

Exact financial helpers live in `lib/terminal-data.ts`. The terminal reads the
existing desk bridge and public spot endpoint; it does not synthesize markets or
quotes. See [scope and evidence](../../research/reports/APP02_CULT_TERMINAL.md).

```sh
node --experimental-strip-types --test tests/e2e/next-terminal-data.test.mjs
npm --prefix apps/frontend run test:browser
```

Run these from the repository root, with the real local backend and frontend
running for browser acceptance. A wallet connection and funded open markets are
required for separate live signing acceptance.

First-visit onboarding: the trade tour starts automatically after workspace data
loads and anchors each step to its relevant section. There is no launch button.
Done, Skip and Escape remember dismissal using `hedgeveil.trade-tour.v2` in
browser local storage. Clear that single preference to exercise a fresh visit
in development; ordinary workspace browser tests seed it as already seen.

### Activity and tweet acceptance

Activity uses the vendored Coss Table, with receipt recovery in per-operation
details and drafts separate from submissions. The homepage Cult tweet grid loads
only the configured Vitalik post through `/api/tweet/[id]`; failure renders a
link to the original post. No X API key is needed. Attribution/licenses live in
`components/ui/COSS-SOURCES.md` and `components/ui/CULT-SOURCES.md`.

With the local frontend/backend running and retained operation records available,
run `node tests/e2e/next-activity-live.mjs` from the repository root. This is a
read-only live acceptance check (requires network for the real post), not a wallet
signing test. It reviews populated rows in an isolated component harness using
actual journal records and writes screenshots to `/tmp/hedgeveil-*.png`.


### System status

`/status` is accessible without a wallet and linked from the shared footer. It
reads `/api/status` every 15 seconds while visible. The frontend coalesces requests
and caches the allowlisted backend projection alongside the existing spot reader.
It does not issue RFQs, submit transactions or change trading gates. Maker status
uses the last actual offer result, so an idle maker can correctly be unverified.

The page retains at most 30 measured checks in server memory while requests arrive.
Restarting clears that history; empty intervals are not successes and no uptime
percentage is calculated. RPC and contract checks reflect reconciliation evidence,
not independent monitoring of every provider. This same-host page cannot serve as
an external uptime monitor when the frontend itself is down.

From the repository root:

```sh
node --test tests/e2e/status.test.mjs
node tests/e2e/status-live.mjs
```

The browser check needs the real frontend/backend running. Its simulated outage
is intercepted only inside the test browser; product data remains real.

## Hosting preparation

The selected frontend target is Vercel (`hedgeveil.vercel.app`, availability pending).
See [deployment setup and outstanding public-access gates](../../docs/DEPLOYMENT.md#vercel-frontend-setup).
Use `apps/frontend` as the root and include shared source outside that directory.
The backend requires separate persistent hosting. Explicit hosted mode now supports
an authenticated HTTPS bridge and NEP-413 wallet sessions; configuration, limits
and remaining final-host acceptance are documented in `docs/DEPLOYMENT.md`.
Local mode stays loopback-only. Hosted credentials must be server-only variables.

Security regression checks (local keys/transports; no chain writes):

```sh
node --test tests/wallet/hosted-auth.test.mjs tests/e2e/next-bridge.test.mjs
```

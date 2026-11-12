# Hedgeveil frontend

Next.js App Router, React and TypeScript implementation of the approved homepage.
This is JSX with server-rendered sections and React state for the payoff/action
selectors. It does not embed the earlier HTML page or run its DOM scripts.

From the repository root:

```sh
npm ci --prefix apps/frontend
npm --prefix apps/frontend run dev
```

Open http://127.0.0.1:3000. For the optimized build:

```sh
npm --prefix apps/frontend run build
npm --prefix apps/frontend run start
```

Stop the development server before starting the built app on the same port.
Dependencies are pinned in `package-lock.json`; system fonts avoid build-time
font downloads. Next.js telemetry is disabled by the scripts.

## Current scope

- `app/page.tsx`: homepage composition and server-rendered metadata/layout.
- `components/home/`: header, hero, payoff chart, problem, actions, comparison,
  FAQs, closing and footer. Only `Actions` and `PayoffChart` need client state.
- `app/globals.css`: the approved off-white/black/olive/lime design tokens and
  responsive styles, retained from the design preview.
- `lib/payoff-illustration.ts`: normalized explanatory curves, never transaction
  amounts or market quotes. Regression coverage compares all 762 points with
  the existing exact shared payoff calculation.

The wallet/trading desk is still the existing application on port 8794. Homepage
CTAs navigate to it; this increment does not migrate wallet providers, trading,
portfolio or transaction recovery into React. No API proxy, signing authority
or backend credentials are introduced. The legacy homepage remains available
on that service while subsequent frontend pages are migrated.

The optional public `HEDGEVEIL_DESK_URL` is read at build time. Its default is
`http://127.0.0.1:8794/app#trade`. Copy this app's `.env.example` to `.env.local`
only if changing that destination; never copy the repository's credential file.
URLs with credentials/query parameters or non-HTTPS remote origins reject.
The frontend can render without the backend; trading requires the real desk to
be running. It never substitutes a fake quote, balance or transaction result.

## Verification

With the built frontend running on port 3000:

```sh
npm --prefix apps/frontend run typecheck
npm --prefix apps/frontend run format:check
npm ci --prefix apps/web
npm --prefix apps/frontend run test:browser
```

Browser checks use the repository's existing Playwright installation in
`apps/web`. Install Chromium there with `npx --prefix apps/web playwright install
chromium` if it is not available. `FRONTEND_TEST_URL` can select another local
frontend address; the checks assume the default desk destination.

The browser suite covers hydration, mobile/tablet/desktop layout, keyboard
selectors, native FAQs without JavaScript, routes and destination validation.
It submits no wallet transactions. Independent product/accessibility/security
review and public hosting remain pending.

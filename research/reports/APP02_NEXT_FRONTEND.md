# APP-02: Next.js homepage implementation

Date: 12 November 2026. User approved the existing light centered design and
clarified that implementation meant Next.js, React and TypeScript.

Implemented `apps/frontend` with Next.js 16.4.6, React/React DOM 19.3.1 and
TypeScript 7.0.2, pinned in its npm lockfile. Framework setup follows the
[official App Router installation documentation](https://nextjs.org/docs/app/getting-started/installation).
The optimized build prerenders the homepage. Header, hero, problem, comparison,
FAQs, closing and footer are JSX server components; action and payoff selection
use React client state. No iframe, HTML injection or legacy DOM-script wrapper.
The existing tokens/CSS were carried over to preserve approved appearance.

Dependencies: APP-02 wallet desk and approved homepage design. Invariant: retain
shared financial behavior, existing wallet signing/recovery and live-data guards.
Only a public desk destination is configured, with no root `.env` loading or
service secrets. The homepage sends no transaction and invents no market data.
Missing backend availability prevents trading rather than creating a substitute.
Invalid destination schemes, credentials and query parameters reject. Unknown
frontend routes return 404; `/home` redirects to `/`.

Evidence:

- `npm --prefix apps/frontend run build`: optimized production build passed.
- `npm --prefix apps/frontend run typecheck`: strict TypeScript passed.
- `npm --prefix apps/frontend run format:check`: passed.
- `node --test tests/e2e/next-homepage.test.mjs`: 8 checks passed against the
  running production build. Includes hydration and keyboard controls at
  375/768/1440 px, no horizontal overflow, unchanged light palette, correct CTA
  links, native FAQs with JavaScript disabled, route handling and URL validation.
- All 762 plotted payoff coordinates agree with the existing exact integer
  payoff function within 0.0051 SVG units (rounding to two decimal places).
- Desktop/mobile screenshots inspected. Corrected word spacing around hidden
  mobile line breaks and reran the focused suite; no console/page errors.
- Live Chromium navigation from the Next.js homepage to `/app#trade` on the
  retained wallet desk passed, with its wallet-connect control present. No
  transaction was submitted.
- `git diff --check`: passed. No contract changes; Rust/Sandbox suites were not
  rerun for the frontend-only increment.

The built frontend runs at http://127.0.0.1:3000. The configured trade destination
is the retained wallet desk at http://127.0.0.1:8794/app#trade. Its stopped process
and database owner were verified before clearing the stale runtime ownership
marker and restarting; its database and journals were not reset.

Scope: homepage migration complete. The trading, portfolio and transaction pages
are still the earlier application, linked from this frontend; their React
migration and public hosting remain separate work. No new wallet transaction,
backend lifecycle acceptance or production readiness is claimed.

Reviewer: independent product/QA/accessibility/security review pending. User
acceptance covers the existing visual direction, not independent code review.

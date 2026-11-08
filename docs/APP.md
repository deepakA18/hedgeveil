# Local application (APP-02)

The local desk runs actual compiled contracts, two separate funded maker workers,
the synthetic settlement oracle and a PostgreSQL indexer. It is a Sandbox signing
gateway: ephemeral full-access account keys live in the Node process, not in a
browser wallet. The browser can select the disclosed demo accounts. Anyone with
local machine access to the gateway can operate them; do not expose it to a
network or use it to hold public funds. Production and public networks are disabled.

Run the installation/build/start commands in [README](../README.md). The launcher
prints its random loopback URL and ignored `target/app02-*` directory. It starts
fresh deployments; it neither reads `.env` nor imports existing accounts. Keep the
process running while using the UI or recovery CLI. Restarting the launcher makes
a different chain, not a restart of the old deployment. Journal and public client
binding remain on disk, but an old Sandbox RPC and its ephemeral keys cannot be
recovered by relaunching. Persistent deployment lifecycle belongs to DEM-01.

The implementation uses the repository's Node ESM stack and browser modules with
neutral CSS tokens, system fonts and no runtime UI dependency/CDN. Playwright is
a locked development dependency, used through its [library API](https://playwright.dev/docs/library).
Browser binaries must match the lock; [installation instructions](https://playwright.dev/docs/browsers)
cover first-use download. Local services need no paid credentials.

## Flows

- Explore shows immutable series, maturity, reserve evidence and a theoretical
  complementary payoff diagram. It is not a price history, NAV or executable bid.
- Portfolio registers storage and deposits collateral as separate actions. It
  shows exact ledger claims, vault ownership and withdrawal tickets. Native wallet
  funds pay attached storage/collateral and gas; they are not free ledger collateral.
- Trade splits, merges and redeems; it requests BUY/SELL quotes from both funded
  maker processes. Quotes are exact, all-or-nothing, sampled offers with 15-second
  TTLs. The UI and gateway recheck expiry; only the contract can establish a fill.
- Save previews proportional basket inputs, shortfalls, rounded outputs, share
  quantity, attached deposit and gas allowance. In-kind exit returns actual assets
  into the ledger without a buyer. No approved recurring policy or reliable NAV is
  claimed. The local basket displays POLICY_UNSELECTED / ROLL_DEFERRED.
- Transactions lists the server's retained operations, exact intents, callback
  results and tickets. The evidence viewer pages through indexer events, raw
  receipt outcomes, transactions and alerts. Oracle cases include disputes,
  observation commitments, challenge information and finality.
- Makers shows indexed inventory, key registry, epoch and nonce state, with real
  journal-backed cancel-nonce, advance-epoch and key-revocation controls for the
  selected maker. Advancing the epoch invalidates old signatures but does not stop
  new quote issuance. Revocation is permanent for that key ID. None of these
  actions changes custody. Worker retirement remains an explicit service operation.

## Transaction and failure boundaries

Amounts share the SDK's portable BigInt parsing/formatting; prices are 10^12-scaled
USD, claims/shares/collateral 10^24-scaled quantities. No floating-point value goes
into a transaction. Chart coordinates and human timestamps use numbers only after
integer calculation. Fees and inputs are displayed without silently rounding the
submitted integers. Previews use one finalized block and include maker inventory,
signature/nonce/key status, account storage, gas allowance and output bounds. They
can still become stale before execution; contract receipts decide the outcome.

The SDK owns the immutable intent and permanent journal attempt marker. The
browser persists an operation pointer before preparation and an attempt pointer
before requesting a signature. A lost response never triggers a retry. Reloads
list the durable server journal; explicit recovery reads receipts without signing.
Unknown deposits/withdrawals also block another operation of the same method for
that account in this gateway. Cancellation consumes the operation ID. Escape closes
review without signing or cancelling; the PREPARED operation can be resumed.

Only supply a manually recovered hash from the exact retained signing attempt.
Matching an older identical action cannot prove whether a newer attempt was sent.
Clearing browser storage does not clear the server journal. Losing that journal,
using a different gateway or explicitly creating other actions can repeat transfers;
operation IDs are local bookkeeping, not on-chain idempotency keys. The local
operation listing is bounded at 1,000 entries; use the CLI to inspect/recover
individual retained IDs if the gateway reaches that bound. This is not a
solution to verified production payout recovery.

A stale/unreconciled indexer blocks deposits, splits, purchases and subscriptions.
Fresh direct-RPC checks still allow merges, finalized redemptions, in-kind exits,
withdrawal recovery and maker authorization reduction. Direct account views and
indexed snapshots are fetched independently: their block hashes need not match.
The review block identifies the exact preview; each evidence page identifies its
own indexer checkpoint. Refresh updates displayed state; it never submits actions.

The API binds only to `127.0.0.1`, requires the exact Host and same Origin for JSON
writes, rejects cross-site requests, serves a fixed static allowlist and sends no
CORS permissions. CSP forbids third-party scripts, connections and framing. The
local gateway signs only configured demo accounts through the SDK method allowlist;
no key, RPC-write, arbitrary-file or admin-deployment endpoint exists. It is not
an authenticated multi-user service or a public-wallet adapter.

## Ticket metadata and remaining acceptance

Dependencies: APP-01 journal/receipts, INF-01 matched snapshots, VLT-02 risk states,
G3/G4/G5 compiled contract interfaces. Invariant: actual ownership and finalized
receipts determine displays; neither observed marks nor hashes imply execution.
Failure paths: no quote, stale/cancelled signature, asset/storage/gas shortfall,
indexer/RPC outage, user cancellation, lost signing response, disputed settlement,
confirmed payout failure and quarantined unresolved payout.

Evidence: [browser report](../research/reports/G7_APP.md) and source-hashed raw
receipt run. Reviewer: Product/QA and independent security reviewer — **pending**.
Remaining: public wallet/testnet conformance, broader browsers/accessibility review,
browser presentation tests for every callback fault and delayed-oracle path,
strategy/roll convenience flows and held-out economic selection, durable demo
restart/fresh-clone release drill, load/security review. G7/G9 are not complete.

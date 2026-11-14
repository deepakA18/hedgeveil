# Hedgeveil

NEAR-backed options with an upfront purchase cost, funded offers and on-chain settlement.

**[Open the app](https://hedgeveil.vercel.app/trade)** | **[Service status](https://hedgeveil.vercel.app/status)**

Hedgeveil is a testnet application. Production and the experimental tracking vault
are disabled. Independent security review remains pending.

## How it works

1. Connect a NEAR wallet and add trading funds. First deposits can include the
   account's storage requirement in the same approval; storage is separate from collateral.
2. Choose a market, expiry and exposure: **Upside** or **Capped value**.
3. Explore the payout chart, review a funded offer and approve it in your wallet.
4. Sell when an executable offer is available, combine matching pairs, or redeem
   after settlement. Withdraw available NEAR back to your wallet.

Each pair is backed by one NEAR. For set price `K` and final reference price `X`,
per-unit payouts in NEAR are:

```text
Capped value (P) = min(1, K / X)
Upside (N)       = 1 - P
```

Matching P and N can be combined before finalization to recover their backing.
Capped value is not downside protection or a guaranteed dollar balance. A fully
paid purchase has no margin calls but can lose its entire cost plus fees.

The construction is inspired by Vitalik Buterin's research on
[building index-tracking assets using options instead of debt](https://ethresear.ch/t/building-index-tracking-assets-on-top-of-options-instead-of-debt/25036).
This is an independent implementation, not an endorsement.

## Components

| Component | Implementation |
| --- | --- |
| Frontend | Next.js, React, TypeScript, light and dark themes |
| Wallets | NEAR Connect with pinned Meteor and Intear executors |
| Clearinghouse | Rust contract, native NEAR collateral and internal P/N ledger |
| Trading | Signed, funded, all-or-nothing RFQs from project-operated makers |
| Market inputs | Coinbase data for off-chain maker valuation and indicative spot |
| Current expiry settlement | Pinned Outlayer worker authenticates historical Coinbase data for a fixed 30-minute pre-expiry TWAP; a separate resolver validates evidence |
| Indexing | PostgreSQL receipt replay and on-chain reconciliation; optional FASTNEAR background audit |
| Hosting | Vercel frontend and persistent Railway backend |

Existing historical series retain their original settlement terms. Missing or
rejected evidence delays settlement; the app does not substitute a fixture price.
Unknown transaction outcomes require receipt recovery, never automatic resending.

The internal claims ledger is not advertised as a standard wallet token interface.
Maker liquidity is finite and project-operated. Model valuations and charts are
not executable offers; requests can return no quote.

## Repository

- [Frontend](apps/frontend/): pages, wallet UI and server-side API bridge.
- [Contracts](contracts/): clearinghouse, settlement resolvers and local test fixtures.
- [Services](services/): makers, market data, indexing, settlement and testnet operations.
- [SDK](packages/sdk/): exact amounts, transaction intents and receipt recovery.
- [Schemas](packages/shared-schemas/): versioned wire formats and offline validation.
- [Reference model](research/reference-model/), [tests](tests/) and [verification](verification/): payoff agreement and failure-path checks.
- [Recorded evidence](research/reports/): dated results with their scope and limitations.
- [Deployment container](deploy/container/): persistent backend packaging.

The [privacy-track archive](archive/privacy-track/README.md) is historical and
excluded from active builds. Internal planning files and the root `docs/` folder
are maintained locally and excluded from new commits. Some historical reports
refer to those local documents. Maintainer release/review packaging workflows
that require them are not standalone clean-clone entry points.

## Run the frontend

Use Node.js 22.22.2 or newer and the committed lockfiles:

```sh
npm ci --prefix apps/frontend
npm --prefix apps/frontend run dev
```

Open `http://127.0.0.1:3000`. Configure the API bridge using
[the frontend environment example](apps/frontend/.env.example). The frontend
needs a separately running backend for accounts and transactions; starting it
does not deploy contracts, fund makers or create a functioning trading backend.
Never put service secrets in browser-exposed environment variables.

## Local verification

Rust toolchains are pinned per workspace. Core deterministic checks need no paid API keys:

```sh
cargo test --locked --workspace
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
python3 -m unittest discover -s research/reference-model -v
python3 research/reference-model/generate_vectors.py --check
python3 packages/shared-schemas/build_schema.py --check
node --test tests/market/codec.test.mjs tests/sdk/client.test.mjs
npm --prefix apps/frontend run typecheck
```

For compiled contract lifecycle tests, install the locked Sandbox dependencies:

```sh
npm ci --prefix tests/sandbox --ignore-scripts
python3 scripts/build-core.py
node tests/sandbox/g3.mjs
```

See [contract build instructions](contracts/README.md) for the isolated workspace.
Synthetic inputs belong only to deterministic tests. Live operation uses external
market data and actual finalized receipts.

## Acceptance limits

Recorded testnet evidence includes wallet buys/sells, deposits/withdrawals,
pair creation/merging, and a project-account expiry settlement through both-leg
redemption and withdrawal. These are bounded observations, not an uptime promise
or a completed independent audit. Provider delivery reliability, outstanding
recovery cases and sustained ten-user execution acceptance remain open.

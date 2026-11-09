# NEAR Connect wallet desk

APP-01/02 now provide a separate **loopback-only testnet wallet desk** using
`@hot-labs/near-connect` **0.12.0**, vanilla JavaScript and the existing neutral UI.
Meteor and Intear are the initial choices. A native, keyboard-accessible dialog
limits selection to the pinned manifest; NEAR Connect runs the wallet executors.
This follows the [NEAR wallet-login guide](https://docs.near.org/web3-apps/tutorials/wallet-login)
without migrating the app to React or adding WalletConnect credentials.

## Run

From the repository root:

```sh
npm ci --prefix apps/web
npm --prefix apps/web run build:wallet
npm --prefix apps/web run wallet
```

Open `http://127.0.0.1:8790`. Without deployment configuration, connection,
account selection, reconnect and disconnect are available; transaction controls
are disabled. No paid API key, `.env` or server signing key is needed.
The existing `node apps/web/demo.mjs` Sandbox flow remains available separately.

If a running older server returns `LOCAL_ORIGIN_ONLY` when opening the desk from
a link, stop it with Ctrl+C and rerun the wallet command. The
[navigation fix](../research/reports/G7_WALLET_ORIGIN_FIX.md) permits the main page
to open from an external link while preserving API/write origin checks.

For an actual testnet deployment, pass an SDK configuration file containing only
`network`, `chain_id`, `rpc_url`, `genesis_hash`, `contract_id`, `code_hash` as
described in [WALLET](WALLET.md). Use actual verified deployment records:

```sh
node apps/web/wallet.mjs --config /path/to/public-testnet-config.json \
  --journal .local/testnet-wallet-journal --port 8790
```

Keep the same origin/port and retain the journal across restarts. Losing the
journal loses the local at-most-once and receipt ownership records. Never copy
an unknown operation into a fresh journal to retry it.

**New risk remains disabled:** INF-01 currently reconciles Sandbox only. This
launcher exposes `TESTNET_INDEXER_PENDING` and cannot issue new funding/trade
authorizations. With a valid deployment, direct finalized views, verified exits
supported by the SDK and recovery remain available. Testnet vault methods and
mainnet remain disabled. No public deployment or external wallet acceptance
has been recorded by this increment.

## Signing and recovery

1. Connect without adding a function-call access key. If the wallet returns more
   than one account, select one explicitly. Reconnect never submits an operation.
2. Prepare and review exact integer amounts against finalized contract views.
   The existing indexer, inventory, gas, storage and unresolved-operation guards apply.
3. On confirmation, the local service rechecks the preview and deployment, then
   atomically claims the retained operation before handing it to the browser.
4. The adapter rechecks network, selected account, wallet identity and its pinned
   manifest before passing one function call to the wallet. Server signing is
   forbidden in wallet mode. Controls stay disabled during the pending handoff.
5. Returned hashes and redirects are untrusted hints, persisted separately from
   a validated hash. Matching RPC transaction fields and linked finalized
   receipts determine the result. Undefined responses, prompt rejection and
   post-broadcast exceptions remain uncertain; none authorizes a resend.

Disconnect forgets the local wallet selection even when the vendor sign-out response is lost. It does not delete retained operations.

After an interruption, reconnect to the same wallet/account, open Transactions
and check receipts. If needed, supply the hash from that exact signing attempt.
The [CLI](CLIENT.md) can recover using the same journal with the frontend closed.

## Runtime and trust boundaries

`apps/web/wallets/lock.json` freezes the allowlist, metadata, executor URLs and
SHA-256 hashes. `build-wallet.mjs` downloads the public scripts into ignored
`apps/web/.local/wallet-executors/`, verifies their hashes, and bundles the browser
entry. Startup rechecks the cached bytes before serving them from memory.
Version IDs include the hash to isolate NEAR Connect's executor cache. Changed
upstream bytes fail closed; updating a pin requires inspecting the source and
rerunning acceptance. Upstream URLs are mutable and may stop serving the pinned
bytes; preserve verified build assets for an exact release. Pinning is integrity
control, not an independent audit of vendor code or the wallet's hosted UI.

Wallet mode uses nonce-bearing iframe scripts and a bounded CSP connection list.
NEAR Connect requires inline styles for its internal prompts, so wallet mode
allows those styles. The ordinary Sandbox CSP is unchanged. Injected/debug wallet
replacements cannot pass the signing adapter's pinned manifest identity check.

The journal/API belongs to the local machine user. Strict loopback Host/Origin
checks block cross-origin writes; wallet connection **is not authentication** for
this API. Do not expose it through a tunnel or reverse proxy. A hosted multiuser
service requires a separate NEP-413 challenge/session design and per-account
authorization before reusing these routes. No API key or private key is sent to
the browser by the gateway.

## Evidence and remaining acceptance

Dependencies: APP-01 exact intents/journal/receipt verification; APP-02 previews;
verified testnet deployment and INF-01 reconciliation for funding. Invariant:
one handoff per retained operation, no success from a wallet response alone.
Failure paths: changed account/network/wallet, missing or rejected response,
wrong hash, RPC outage, concurrent handoff, absent deployment/indexer, corrupt
executor assets. Reviewer: Product/QA/contracts/security and independent review
**pending**.

```sh
node --test tests/sdk/client.test.mjs tests/wallet/boundary.test.mjs \
  tests/wallet/near-connect.test.mjs tests/e2e/model.test.mjs
node tests/wallet/near-connect-browser.mjs
node tests/e2e/browser.mjs --report research/reports/g7-near-connect-app-regression.json
```

[Increment evidence](../research/reports/G7_NEAR_CONNECT.md) separates controlled
wallet/HTTP fixtures from real Sandbox receipts. Installed Meteor/Intear signing,
mobile/popup behavior, public-testnet receipts, hosted authentication, independent
review and a fresh full release rehearsal remain pending. The rehearsal script
now requires this connector phase; older release reports are historical.

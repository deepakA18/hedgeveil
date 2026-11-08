# APP-01 local SDK and receipt recovery

Dependencies: CORE-02/03/04, MKT-01 and VLT-01. Reviewer: product/contracts/security,
independent review pending. Invariant: a local operation is submitted at most once
from its retained journal, and only matching finalized receipt evidence establishes
its outcome. RPC failure, an absent hash, a missing ticket or a timeout never
authorizes another send, refund or withdrawal restoration.

This increment targets pinned local Sandbox only. The client binds network/domain,
chain ID, genesis hash, core account and deployed code hash before handing a
transaction request to a signer. `deployment_identity` is an additive read-only
core view; it changes neither state layout nor financial behavior. Code pinning
is checked before submission, not an atomic protection against an authorized
concurrent contract upgrade. Test access-key authority remains disclosed.

Amounts are exact decimal strings with u128/u64 bounds; native display conversion
uses BigInt, never floating point. The SDK builds one allowlisted function call
per transaction with explicit attached deposit and gas. Client operation IDs are
local journal identifiers, not on-chain idempotency keys or ledger event IDs.

The durable journal retains public intents, a permanent submission-attempt marker,
the known transaction hash and immutable recovery observations. Its attempt marker
is persisted before invoking the signer. Losing the response or restarting cannot
make that operation submit again. A new operation ID is a new authorization: this
does not prevent another program, lost journal or deliberate new ID from repeating
an on-chain action. Back up the journal; never reconstruct send eligibility from
balances or a timeout. Corrupt/incomplete files fail closed.

Signing is injected through an explicit adapter. No SDK/CLI secret-key loader,
`.env` parsing or browser wallet integration is included. The local harness keeps
ephemeral account keys in memory and tests CLI submission through an IPC signer.
A cancelled-before-broadcast adapter response is displayed as cancellation but
still consumes the local attempt; arbitrary thrown errors remain ambiguous.

Recovery reads the transaction from the pinned RPC and checks signer, receiver,
single action, method, exact args/deposit/gas and hash against the retained intent.
Only FINAL execution with complete receipt links can confirm an outcome. Successful
submission or a transaction hash alone is not success. An incomplete receipt tree
or unavailable RPC is unresolved. Receipt event parsing accepts only this core's
successful execution outcomes and expected domain.

Withdrawals are special: an authenticated failed native transfer followed by a
successful callback can restore free collateral even though one receipt failed.
Conversely, the native payout can succeed while its callback fails. Recovery binds
the request's withdrawal ledger ID to its ticket and terminal receipt events.
Pending/UNKNOWN or missing terminal evidence remains quarantined. No automatic
ticket cleanup, refund, mark-unknown transaction or resend is performed. CLI
recovery is read-only; explicit merge, redemption and in-kind exit requests are
separate user-authorized operations with their own journal entries.

This is a local client/CLI foundation. Browser wallets, public testnet flows,
token-standard interfaces, the PostgreSQL indexer, provider failover and production
verified payout recovery remain separate work. Unit transport fixtures exercise
client failures; claimed execution evidence comes from real compiled-Wasm Sandbox
transactions and callbacks.

## Supported surface and local use

`packages/sdk/index.mjs` has TypeScript declarations in `index.d.mts`. It uses Node
built-ins, with no runtime dependencies. Node 22.22.2+ is required; evidence uses
Node 24.8.0. The separate, already locked Sandbox harness dependencies are under
`tests/sandbox`. Type declarations are checked with TypeScript 5.9.2.

Supported writes: `storage_deposit`, `deposit_collateral`, `split`, `merge`,
`transfer`, `redeem`, `fill_quote`, `vault_mint_basket`, `vault_redeem_in_kind`,
`request_withdrawal`, `close_ticket`. Other methods, including callbacks, faults,
admin/keeper calls, pair matching and share transfers, are not yet SDK builders.
The existing [RFQ codec](../packages/rfq/README.md) provides canonical Ed25519 quote
signing. On-chain signatures, funding, storage, expiry and nonce checks remain
mandatory; building an intent does not reserve assets or guarantee execution.

All method arguments and deposits use exact base units. `parseNear('0.1')` returns
`'100000000000000000000000'`; `formatNear` is lossless and never changes a submitted
amount. Non-funding methods attach exactly one yocto; funding methods require an
explicit positive amount. `toWireIntent` removes the journal-only signer/gas
metadata to produce the existing shared-schema transaction shape. Each of the
original 11 builders is exercised by real Sandbox execution and schema validation.

Create a public JSON configuration from the running **local** deployment record:

```json
{
  "rpc_url": "http://127.0.0.1:3030/",
  "network": "sandbox",
  "chain_id": "<actual status.chain_id>",
  "genesis_hash": "<actual status.genesis_hash>",
  "contract_id": "core.sandbox",
  "code_hash": "<actual deployed Wasm SHA-256 encoded as base58>"
}
```

The placeholders are not runnable credentials or deployment records. The harness
writes actual config/journal files to ignored `target/g7-<run-id>/` for its
short-lived chain, which it stops at the end. For interactive use, provide your
own still-running pinned Sandbox and public config. This is not yet a persistent
one-command demo launcher. No `.env` values are read or required.

```sh
# Read actual account ownership, series, vault and ticket views.
node scripts/recover.mjs balances --config target/local-config.json --journal target/client-journal --account alice.sandbox

# Explicitly prepare a new authorized merge (amount is yocto claim units).
node scripts/recover.mjs prepare --config target/local-config.json --journal target/client-journal --account alice.sandbox --method merge --args '{"series_id":"alpha","amount":"100"}'

# Substitute the exact operation_id printed by prepare. Review the intent first.
node scripts/recover.mjs inspect --config target/local-config.json --journal target/client-journal --id OPERATION_ID
node scripts/recover.mjs submit --config target/local-config.json --journal target/client-journal --id OPERATION_ID --signer /absolute/path/to/trusted-signer.mjs

# Read-only recovery, also usable in a fresh process after losing a response.
node scripts/recover.mjs recover --config target/local-config.json --journal target/client-journal --id OPERATION_ID
# If the signer did not retain a hash, append --hash ACTUAL_TRANSACTION_HASH.
```

An adapter is executable trusted local code, selected explicitly with `--signer`;
only load one you trust. It exports `async sign(request, onHash)`. The request binds
`signerId`, `receiverId`, `network`, `operationId`, and a single FunctionCall with
exact `methodName`, `args`, `deposit`, `gas`. Await `onHash(hash)` as soon as the
actual hash is available, and return `{hash}`. An adapter may explicitly return
`{cancelled_before_submission:true}`; throwing, disappearing or timing out is
ambiguous. No adapter-provided success flag is trusted. The included `ipc-signer`
only works under a parent that supplies an IPC signing service, as the real
Sandbox CLI harness does. It is not a standalone wallet or key loader.

For exit/redeem preparation, use the current on-chain vault basket and explicit
minimum outputs, or the immutable finalized series and actual owned claim
amounts. `balances` returns independently finalized views, **not an atomic
snapshot**, a NAV, a guarantee of a fill or proof of an earlier transaction.
Separate preparations for registration, deposit and trading stay separate; no
automatic funding or convenience batch is synthesized.

| Client result | Meaning / permitted recovery |
|---|---|
| PREPARED | Intent persisted; no local attempt has started |
| CANCELLED | Adapter reported cancellation; operation still cannot be submitted again |
| SUBMISSION_UNKNOWN | Response/RPC/hash unavailable; recover the same attempt, never resend |
| PENDING | RPC execution not FINAL, receipts incomplete or expected event missing |
| SUCCEEDED | Matching finalized atomic action and expected event; inspect any child warnings |
| FAILED_CONFIRMED | Matching finalized transaction rejected or main action reverted; not a payout restoration claim |
| WITHDRAWAL_SUCCEEDED | Linked successful callback confirms the bound ticket payout |
| WITHDRAWAL_FAILED_CONFIRMED | Linked callback confirms failure and restoration to the original owner |
| WITHDRAWAL_UNKNOWN | Callback/ticket evidence missing or conflicting; funds remain quarantined |

Pin/intent/hash/journal errors fail closed with stable error codes. `inspect` is
available without a live RPC. Terminal observations survive later RPC outages,
but changing deployment pins does not authorize reinterpreting old observations.
Success logs from failed or foreign receipts never confirm an operation. A failed
gas/refund child receipt does not erase a committed atomic ledger action; it is
reported as a warning. Withdrawal recovery explicitly accounts for failed transfer
receipts followed by successful restoration callbacks. This trusts the pinned
local node and artifact; it is not cryptographic proof verification or a mechanism
that changes UNKNOWN funds on-chain.

The journal contains public intents and RPC receipts, including public signer
keys and transaction signatures. It must never contain private signing material.
Keep it on a trusted local filesystem with working exclusive links and fsync;
network filesystem guarantees and hostile local processes are out of scope.
CLI errors redact arbitrary signer/RPC exception text. Retained journal data is
not safe to delete merely because the last result was cancelled or failed.

Reproduce the local evidence:

```sh
node --test tests/sdk/client.test.mjs
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext tests/sdk/types.mts
python3 scripts/build-core.py
node tests/sandbox/g7.mjs
```

See [G7 evidence](../research/reports/G7_LOCAL_CLIENT.md). Independent review remains
pending. Browser storage/signers, granular wallet error UX, public testnet flows,
remaining write builders, PostgreSQL event replay/indexing and the complete G7
application acceptance gate remain open.

When using `--hash` after losing all signer correlation, the operator must obtain
the hash of that exact attempt from the signer. The client validates its complete
transaction contents, but identical transactions can have different nonces; local
operation IDs are not embedded on-chain. Supplying an older identical transaction
cannot prove the newer attempt's outcome. Persisting `onHash` before losing the
signer response is the preferred path; otherwise keep the operation unresolved
until its actual transaction is identified.

APP-02 adds typed `cancel_quote`, `advance_quote_epoch` and `revoke_signing_key`
builders (14 total), validated against real browser-triggered receipts. These
reduce the selected maker’s authorization without moving inventory. Portable
`amounts.mjs` is shared with the browser. [APP](APP.md) documents the local signing
gateway, durable pointers and its distinction from public wallet integration.

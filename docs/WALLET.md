# APP-01 testnet profile and wallet signing boundary

The SDK supports a testnet profile, durable wallet handoff and browser-portable
signing adapters. The [NEAR Connect desk](NEAR_CONNECT.md) now adds Meteor/Intear
connection UI in a separate loopback-only testnet mode. The Sandbox demo retains
its local signer. Actual external-wallet/testnet acceptance, testnet indexer
reconciliation and hosted authentication remain pending; mainnet and testnet
vault methods are disabled. [Boundary evidence](../research/reports/G7_WALLET_BOUNDARY.md)
and [connector evidence](../research/reports/G7_NEAR_CONNECT.md) distinguish
transport fixtures from real local receipts.

Dependencies: APP-01 durable journal/receipt classifier, normal core artifacts,
and a correctly initialized NEAR Connect or Wallet Selector instance. Invariant: a retained
operation is claimed before any wallet handoff; only matching RPC transactions
and complete finalized receipts can establish its outcome. Failure paths include
account/network changes, redirected or missing responses, incompatible actions,
duplicate hashes, unavailable RPC and callback faults. Reviewer:
product/contracts/security and independent reviewer — pending.

## Deployment and network binding

`Client` accepts `sandbox` with its existing loopback HTTP profile or explicit
`testnet` with HTTPS and `chain_id: "testnet"`. Both require actual genesis hash,
contract account and deployed code hash. The SDK checks those and the contract's
stored domain before preparation, handoff and recovery. Credentials, query
strings and fragments are not permitted in RPC URLs. A config is frozen after
validation. Never fill a template with assumed hashes or treat a successful RPC
connection as deployment acceptance.

Testnet primitive intents and RFQs carry the testnet domain; Sandbox quotes
cannot be reused there. Experimental vault builders reject testnet. Public
deployment records, actual key/upgrade authority and independent review remain
separate release requirements. No deployment registry entry was added.

## Handoff and receipt recovery

The journal stays in the Node SDK/CLI. The browser adapter imports
`packages/sdk/wallet.mjs` directly; it does not import the Node client or hold
account keys. An application integrating it still needs an authenticated
transport for public intents/hints and durable browser operation pointers.
The current loopback demo gateway is not that public service.

On the trusted journal owner, prepare and review the operation, then:

```js
const request = await client.handoff(intent.operation_id);
```

`handoff` verifies the pinned deployment and atomically persists the attempt
before returning the single exact function call. Only one simultaneous caller
wins. Treat even a lost handoff response as uncertain; do not call a wallet again
for that ID. `client.submit(id, signer)` uses this same handoff internally.

In a browser with an already connected and selected wallet:

```js
import { actionCreators } from '@near-wallet-selector/core';
import { walletSelectorSigner, walletReturn } from './packages/sdk/wallet.mjs';

const sign = walletSelectorSigner({
  selector,
  actionCreators,
  returnUrl: location.origin + '/transactions'
});
const reply = await sign(request);
```

This is a boundary example, not a complete hosted application. The pinned tests
use Wallet Selector **10.1.4**. Its v10 API requires native NEAR action objects;
the adapter uses the official factory with exact bigint gas/deposit and UTF-8
argument bytes. Bytes avoid the vendor object overload's global `Buffer`
requirement. See the [official v10 migration guide](https://github.com/near/wallet-selector/blob/main/MIGRATION-v10.md)
and [wallet interface](https://github.com/near/wallet-selector/blob/main/packages/core/src/lib/wallet/wallet.types.ts).

The adapter checks the selector's configured network, selected wallet and single
active account before signing, then rechecks selection after asynchronous wallet
lookup. It does not select the first available account, sign in automatically,
load keys or request additional key permissions. Selector configuration is not
proof of a wallet's internal network behavior; RPC recovery remains mandatory.
Account or wallet changes after a prompt opens still require recovery of that
attempt, not automatic retries.

If a hash returns, send it to the journal owner:

```js
await client.rememberHash(intent.operation_id, reply.hash);
const result = await client.recover(intent.operation_id);
```

A hash is a durable `candidate_hash` until its actual RPC transaction matches the
retained signer, receiver, method, args, gas and deposit. It cannot poison the
immutable `hash` binding. An unavailable RPC leaves the hint available after
restart. A wrong hint can be replaced with the correct one; a validated binding
cannot be changed. Wallet exceptions are sanitized and never imply cancellation
or success. A redirecting wallet can return `undefined` or navigate away.

For a redirect, retain the operation ID before requesting handoff. The adapter
adds `hv_operation` to a same-origin return URL. On return:

```js
const hint = walletReturn(location.href, retainedOperationId);
// Pass hint.hash through rememberHash/recover on the existing journal owner.
```

The parser rejects wrong/duplicate operation IDs, multiple transaction hashes and
wallet error parameters. A parsed redirect is still only an untrusted hint.
Never show success from query parameters, wallet status strings or a top-level
transaction success alone. Missing receipt links remain pending; failed payout
callbacks remain UNKNOWN even when the native transfer succeeded.

Equivalent CLI operations, using real public config and an existing journal:

```sh
node scripts/recover.mjs handoff --config CONFIG --journal JOURNAL --id OPERATION_ID
node scripts/recover.mjs remember-hash --config CONFIG --journal JOURNAL --id OPERATION_ID --hash ACTUAL_HASH
node scripts/recover.mjs recover --config CONFIG --journal JOURNAL --id OPERATION_ID
```

The journal atomically reserves a validated transaction hash for one operation in
one deployment domain. Concurrent recovery cannot confirm two identical intents
from one receipt. Older per-operation hash files also participate in the check.
Stop older client processes before using the updated journal; preserve the whole
directory, including `.hash-bindings`. A crash may reserve a hash before writing
the operation binding; retry recovery for the same ID, never submission.

These are local journal guarantees, not on-chain idempotency. They do not span
lost/copied/separate journals or cryptographically bind a client operation ID to
the chain. Transaction hints still require a trustworthy provenance: identical
actions are indistinguishable beyond their transaction evidence, and the SDK
cannot identify an old receipt never recorded in its journal. No timeout, journal
loss or ambiguity authorizes resend, refund or restoration.

## Verification

Requires the existing Sandbox/indexer/browser prerequisites, compiled normal
artifacts and TypeScript 5.9.2. Test-only dependencies are locked separately:

```sh
npm ci --prefix tests/wallet --ignore-scripts --no-audit --no-fund
node --test tests/sdk/client.test.mjs tests/wallet/boundary.test.mjs
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext tests/sdk/types.mts
tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --typeRoots tests/sandbox/node_modules/@types tests/wallet/types.mts
node tests/wallet/browser.mjs
```

The SDK declarations are checked without skipping library checks. Vendor interop
uses bundler resolution and `skipLibCheck` because upstream declarations contain
extensionless/internal package imports. The call site and a negative action-type
case are checked; full correctness of vendor declarations is not claimed.

The browser harness bundles the real vendor action factory but uses a **test
wallet transport** with generated keys held in the local Node process. It sends
real Sandbox transactions. It proves this boundary works in Chromium, not that
an installed extension, redirect wallet, mobile wallet or public testnet flow has
passed. Public configuration tests use explicitly labelled RPC fixtures. Future
release rehearsals include this suite; previous release archives remain frozen
historical evidence and have not been relabelled as tests of these changes.

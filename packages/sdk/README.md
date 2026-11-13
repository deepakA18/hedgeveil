# Local Hedgeveil SDK

Node SDK with TypeScript declarations, exact decimal amounts, pinned Sandbox/testnet
identity, durable per-operation attempt journal and finalized receipt recovery.
Runtime dependencies: Node built-ins only. No private-key loader or `.env` parsing.

`Client` accepts optional `transport.fallback_urls` (up to three, empty by
default). The wallet desk supplies its configured indexer RPC alternatives.
Only read requests fail over; each fallback checks chain/genesis identity and
contract views remain pinned to the requested finalized block. HTTP/JSON-RPC
429 responses cool down that provider for at least 60 seconds, honoring a longer
Retry-After. No broadcast is retried on another provider. Receipt verification
and UNKNOWN quarantine are unchanged.

See [CLIENT](../../docs/CLIENT.md) for supported writes, signer/CLI usage, states,
tests, journal retention and limits. [G7 evidence](../../research/reports/G7_LOCAL_CLIENT.md)
records real Sandbox execution. Browser wallets, public testnet and the complete
G7 application gate remain pending; independent review has not been supplied.

The browser-portable [wallet boundary](../../docs/WALLET.md) uses the official
Wallet Selector v10 action factory. Durable handoff precedes the prompt; wallet
hashes are recovery hints until checked against RPC evidence. The desk is still
local-only, and installed-wallet/public-testnet conformance remains pending.

First deposit can set `storage_deposit` on a `deposit_collateral` intent.
`attached_deposit` is the total wallet debit; trading collateral is that total
minus storage. The SDK permits only two ordered calls to the same receiver:
`storage_deposit` (50 Tgas), then `deposit_collateral` (200 Tgas). It is one wallet
transaction, not arbitrary batching. Finalized receipts must contain both exact
credits. Missing/unknown results never authorize resend. Existing single-call
intents are unchanged. See `tests/sandbox/first-deposit.mjs` for real local-Wasm
success and atomic rollback evidence.

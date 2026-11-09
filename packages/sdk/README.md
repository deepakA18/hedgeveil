# Local Hedgeveil SDK

Node SDK with TypeScript declarations, exact decimal amounts, pinned Sandbox/testnet
identity, durable per-operation attempt journal and finalized receipt recovery.
Runtime dependencies: Node built-ins only. No private-key loader or `.env` parsing.

See [CLIENT](../../docs/CLIENT.md) for supported writes, signer/CLI usage, states,
tests, journal retention and limits. [G7 evidence](../../research/reports/G7_LOCAL_CLIENT.md)
records real Sandbox execution. Browser wallets, public testnet and the complete
G7 application gate remain pending; independent review has not been supplied.

The browser-portable [wallet boundary](../../docs/WALLET.md) uses the official
Wallet Selector v10 action factory. Durable handoff precedes the prompt; wallet
hashes are recovery hints until checked against RPC evidence. The desk is still
local-only, and installed-wallet/public-testnet conformance remains pending.

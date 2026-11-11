# INF-02: hosted runner startup failure — 11 November 2026

Status: deployment attempted; managed migration blocked at runner initialization.
No hosted indexing, parity, freshness or cutover acceptance is claimed.

The user's OnFinality logs at 13:39:50 UTC show native NEAR runner 6.0.2
requesting block 9820210 and failing with UNKNOWN_BLOCK, then reporting that
all endpoints failed to initialize. This happens before mapping execution.

Inspected the published `@subql/node-near@6.0.2` npm tarball, file
`package/dist/indexer/nearApi.connection.js`. It declares
`const GENESIS_BLOCK = 9_820_210` and calls
`api.block({ blockId: GENESIS_BLOCK })` in `NearApiConnection.create`, regardless
of the chain ID. Its comment identifies this as the mainnet genesis block.
The upstream source inspected on the same day contains the same implementation:
https://github.com/subquery/subql-near/blob/main/packages/node/src/indexer/nearApi.connection.ts

Live read-only RPC probes returned:

| Endpoint | status chain / genesis | Block 9820210 | Anchor 277012602 |
|---|---|---|---|
| https://archival-rpc.testnet.near.org | testnet / FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b | UNKNOWN_BLOCK | 42MbGBXczr5ANRcBxeB8QGKgYybEEoVCv4wzrMPPKRRx |
| https://test.rpc.fastnear.com | same | UNKNOWN_BLOCK | UNKNOWN_BLOCK |
| https://testnet-rpc.intea.rs | same | UNKNOWN_BLOCK | UNKNOWN_BLOCK |

The archive endpoint can serve the deployment anchor; this specific startup
failure is the runner's network initialization assumption. Changing the mapping,
start block or batch size cannot affect that earlier call. Do not substitute a
mainnet endpoint or fabricate a response to the genesis request.

## Support message (prepared, not sent)

Our OnFinality project `hedgeveil-testnet` fails before mapping initialization
with `onfinality/subql-node-near:v6.0.2`. CID:
`QmSSgpj7debN9YQpumbgU7NJKGSFnyTBpvP9iekvKNVrMq`.
The manifest has `chainId: testnet`, startBlock 277012602 and endpoint
`https://archival-rpc.testnet.near.org`.

The runner's `NearApiConnection.create` hard-codes mainnet genesis block 9820210
and requests it on testnet, causing UNKNOWN_BLOCK and startup termination.
The RPC's `status` returns the testnet genesis hash
`FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b`, and our actual start block is
available. Can you provide a supported NEAR testnet runner that derives the
network genesis from `status.genesis_hash` (with proper network validation),
instead of fetching the hard-coded mainnet block? Please confirm which image
version we should deploy on the managed service.

## Recovery and acceptance

Await a supported corrected runner; pin and retest it before replacing the CID
or claiming hosted operation. Keep the retained indexer/database/journals active.
Then perform actual hosted replay, same-block monetary reconciliation, restart
and sustained freshness checks before application cutover. No change was made
to financial behavior or the deployed contracts. Independent infrastructure
review remains pending.

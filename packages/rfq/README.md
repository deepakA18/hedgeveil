# G5 RFQ signing codec

`codec.mjs` uses only Node built-ins. It serializes exact integer amounts to the
explicit Borsh field order in [MARKET](../../docs/MARKET.md), signs the raw bytes
with Ed25519 and calculates SHA-256 audit digests. JSON text is never the signed
message. `baseQuote` intentionally defaults to the local `sandbox` domain;
testnet clients must explicitly select and verify their network/contract domain.

Exports: `Q`, `uint`, `signingBytes`, `digest`, `signQuote`, `verifyQuote` and
`baseQuote`. Amounts/times/nonces are canonical decimal strings; arithmetic uses
BigInt. `signQuote` takes a Node private KeyObject, not a wallet file. The caller
must retain its key securely and register the raw 32-byte public key under its
own clearinghouse account before filling. Codec verification authenticates bytes;
it does not check current inventory, registry, expiry or cancellation state.

From the repository root:

```sh
node --test tests/market/codec.test.mjs
node scripts/generate-rfq-vectors.mjs --check
```

The two [public vectors](../../fixtures/rfq/encoding-v1.json) contain unsigned
encoding examples with placeholder zero signatures. They cannot authorize trades.
The Sandbox suite separately signs ephemeral keys, compares Rust/JS digests and
executes actual fills. `--check` is read-only; omit it only to intentionally
regenerate the vectors and review the diff. This package is not the full G7 SDK.

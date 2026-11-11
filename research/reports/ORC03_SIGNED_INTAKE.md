# ORC-03 increment: signed intake and archive

9 November 2026. Implemented and locally tested; external interoperability and
settlement acceptance remain pending. User requested this step stay free.

## Changes

Added exact-byte Ed25519 verification with explicit key pins, bounded strict JSON
decoding, exact 10^12 price normalization, asset/shape/timestamp validation and a
separate freshness check. An immutable archive deduplicates concurrent identical
writes, preserves conflicting observations and revalidates artifacts after restart.
CLI commands verify, ingest, replay and select a current observation entirely
offline. No paid endpoint, `.env`, key store or wallet is accessed.

Held testnet runtime now refuses startup before touching its workspace or loading
maker keys. This prevents the held setup's fixed 50/50 reference from being served.
Local deterministic tests remain available; no contract or payoff change landed.

## External evidence and limits

[Outlayer documents a JSON signed feed](https://price-oracle.outlayer.ai/docs/)
with a public key, raw payload and signature. The example transcribed in
`tests/oracle/fixtures/outlayer-published-example.json` returned false with both
Node crypto and TweetNaCl. The raw copy was not repaired or re-signed. This is an
example interoperability failure, not proof that the live service always fails.
Direct HTTP retrieval of the documentation returned 403; the example was obtained
through the web tool's rendered page. No authenticated current observation was
obtained. See `orc03-signed-example-check.json` for file hashes and verifier results.

The documented signature authenticates the payload's values, not envelope source
reports or request policy. Thus even a valid signature is insufficient to prove
an approved source quorum/aggregation rule or historical expiry coverage. The
documented key has not received independent attestation/authority approval. Current
selection is a diagnostic API, not a maker valuation input or settlement record.

Positive archive/failure tests use ephemeral local signing keys and are explicitly
unit-test fixtures. They do not constitute external feed acceptance. Historical
signature verification and current freshness are separate; replay never resets
publish time. Every output retains `settlement_eligible: false`.

## Acceptance and next dependencies

ORC-03 dependencies: ORC-01/02, source/key provenance, fixed historical rule.
Invariant: no invalid, stale, ambiguous or unsigned input becomes an accepted
current price or settlement. Failure: return an error; retain evidence; never
substitute fixtures. Reviewer: oracle/contracts/security, independent review pending.

Still required: valid external signed-response interoperability, source-policy
authentication and historical coverage, a specified/versioned on-chain resolver,
compiled-Wasm callbacks and public receipts. MKT-03 needs current inputs plus an
explicit option valuation model; spot alone is not an option price. Public wallet
acceptance, token-interface limits, vault selection and release review remain as
listed in REAL_DATA_READINESS. Public deployment remains held; no funds spent.

## Validation

Signed-intake tests cover the published invalid sample; byte tampering and wrong
keys; unsigned metadata; duplicate/escaped JSON keys and unsafe numbers; asset,
price, exponent and timestamp bounds; exact conversion; future/stale data;
concurrent archive deduplication, restart, conflicting prices, file corruption and
hash mismatch; and refusal to launch the held public maker runtime.

Run commands are in `services/outlayer/README.md`. Fourteen signed-intake/runtime
test groups passed; 36 including adjacent oracle, deployment and indexer tests.
Five Python reference tests, 565 shared vectors, schema regeneration/check and
all 11 schema groups passed. Root locked Rust tests/format/Clippy and the contract
workspace locked test command/format/wasm-target Clippy passed. The latter is not
compiled-Wasm lifecycle execution; no contract changes landed in this increment.
All 59 archived checksums remain unchanged and `git diff --check` passed.

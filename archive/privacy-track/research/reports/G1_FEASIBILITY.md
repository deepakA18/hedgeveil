# Initial G1 evidence — 7 November 2026

Both complete feasibility gates remain open. These are measured partial results,
with a real proof and live public attestation; no mocked verifier or AI badge.

## Real proof and deployed verifier

| Measurement | Result |
|---|---|
| Circuit | One input → one output, depth-20 private Merkle path |
| Constraints | 15,821 |
| Proof / public inputs | 256 / 288 bytes |
| Native proving / setup | 212 / 220 ms, one run |
| Native verifier | Under 1 ms in the recorded run |
| Peak resident memory | 152,043,520 bytes (about 145 MiB), excluding compiler |
| Device | Apple M4, 16 GiB RAM, Rust 1.91.0 |
| Valid testnet call | 43,459,329,847,927 gas (43.46 Tgas) |
| Testnet protocol | 88; actual runtime config saved with receipt evidence |
| Deployed checks | 15 passed: valid proof, changed nullifier, malformed proof, nine noncanonical inputs, short proof, infinity A, extra input |

Account: `hv-zk-fcc9e3e143585953.testnet`. See the
[testnet account](https://testnet.nearblocks.io/address/hv-zk-fcc9e3e143585953.testnet)
and [receipt-level results](note-spend-testnet-2026-11-07.json).
The initial deployment ran all checks as transactions. The final source-matched
build measured the valid transaction and replayed negatives as view calls.
The account is upgradeable and holds only faucet test funds for deployment/gas.

[Native measurements](note-spend-local-2026-11-07.json),
[public proof fixture](../../fixtures/proof-vectors/note-spend-v1/README.md),
[setup/artifact manifest](../../circuits/setup-manifests/note-spend-spike-v1.json),
and [deployed Wasm](../../deploy/testnet/verifier-spike.wasm) make the result
inspectable. The fixture is independently replayed by a Rust test.

Native adversarial tests additionally reject wrong secret/path/direction/owner,
out-of-range amount, zero spend secret and on-curve G2 points outside the prime
subgroup. All nine public inputs reject substitution in native real-proof tests.
Encrypted output round-trip and tampering checks pass for an honest sender.

This is a read-only verifier, not the note ledger: it does not spend a nullifier,
custody collateral or prove funded issuance. Correct output encryption is not
constrained, so a malicious payer can still provide unusable ciphertext. The
largest join/split/vault transition and browser proving remain unmeasured.
Single-process test parameters are not reviewed production setup material.

## Live AI evidence and remaining inference gate

Candidate: `z-ai/glm-5.3-flash`, observed in the public model catalog. The
[actual public evidence report](ai-public-evidence-2026-11-07.json) records:

- Gateway and model CPU quotes verified by DCAP QVL: `UpToDate`, no advisories.
- Signed nonce/signer bindings, complete configuration hash and event-log replay passed.
- Wrong nonce and corrupted signed quote rejected for both reports.
- NVIDIA overall and detached GPU JWT signatures, digest/nonce binding and GPU policy checks passed.

`measurement_policy` is **NOT_ACCEPTED**. Hardware authenticity does not approve
the measured application or its provenance. Gateway measurement fingerprints
varied across observations, reinforcing the need for an explicit deployment policy.
No report is promoted to an approved route automatically.

Seven offline test groups cover E2EE round trips, authenticated ciphertext
tampering, exact-byte signatures, gateway/model classification, unknown/missing
evidence, replayed nonce, measurement/configuration/event-log changes, signed GPU
claims, and fail-closed hardware errors. Those synthetic fixtures are not live
completion evidence.

The local completion CLI is implemented but has not sent an inference request:
`NEAR_AI_CLOUD_API_KEY` and the reviewed policy are not configured. Actual
encrypted completion, model response signature binding, decrypted fictional
output and the combined-path retention checks remain required. TLS endpoint
attestation binding is not implemented. Follow [AI_VERIFICATION.md](../../docs/AI_VERIFICATION.md).

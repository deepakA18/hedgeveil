# ADR 0001: arithmetic first; cryptographic choices remain gated

Status: accepted for the initial development baseline, 7 November 2026.

Implement exact native-NEAR/USD payoffs before contracts. Use u128 external
amounts/prices, 10^24 collateral coefficient scale, 10^12 price scale, checked
U256 Rust intermediates and an independent Python Fraction implementation.
Pin the available `primitive-types` 0.13.1 dependency; its checked integer API is
documented in the [upstream library documentation](https://docs.rs/primitive-types/0.13.1/primitive_types/struct.U256.html).
This selection is for arithmetic development, not a Wasm compatibility finding.

Commit shared semantic schemas before financial contracts or witness builders.
Schema version 0.1 is a review baseline; it is not a canonical proof transcript.
Do not hash arbitrary JSON for proof inputs. Binary encoding, field ordering,
hashes, key derivation, encrypted-output binding, arities and circuit setup remain
G1-ZK decisions. Schema changes must be versioned with downstream vectors.

Do not scaffold a plaintext ledger, fake proof verifier, or verified AI badge to
stand in for an unpassed feasibility gate. UI development follows real proof and
AI evidence. No near-sdk, circuit library, oracle provider or AI model is pinned
until its corresponding reproducible compatibility spike.

Alternative rejected: converting amounts to floats for convenience. It cannot
represent atomic NEAR reliably. Alternative deferred: a full contract workspace
before choosing proof encoding, output recovery and withdrawal outcome handling.


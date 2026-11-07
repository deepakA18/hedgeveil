# Test-only setup inventory

The benchmark runs a fresh, single-process Groth16 circuit-specific setup with
OS randomness. The process does not serialize toxic-waste scalars. That fact is
not a ceremony, secure-erasure guarantee, or independent setup review.

`production_setup` is always false. Generated proving/verifying keys live under
ignored `.local/zk-spike`. Re-running generates different keys and a different
valid proof; deterministic witness tests use separately labeled fixed seeds.
No deployment may promote these parameters to production.

The checked-in fixture uses a real proof from the measured run, public inputs,
verification key and encrypted synthetic output. It contains no spend/view key,
plaintext opening, private path or setup randomness. The setup manifest records
artifact hashes and source/dependency identifiers. The local proving key is kept
for this experiment; production must publish immutable, provenance-reviewed
prover artifacts and a historical-note compatibility plan.

Pinned compatibility choices: Rust 1.91.0; Arkworks 0.5; near-sdk 5.17.2 and
near-sys 0.2.5. The near-sys pin avoids a newer transitive release requiring a
newer compiler. Cargo.lock records the full resolution. The Wasm uses NEAR's
native BN254 host operations; it does not import an EVM verifier.


# Note-spend feasibility circuit v1

This is a real Groth16/BN254 circuit and a **noncustodial verifier benchmark**.
It is not the clearinghouse, a wallet, or an accepted production proof system.
It cannot authorize deposits, transfers or withdrawals.

`crates/note-spend-spike` uses pinned Arkworks 0.5, with the BN254 x^5 constants
from light-poseidon 0.4.0 in an Arkworks sponge (rate 2, capacity 1). This is not
the circomlib hash encoding. The native and R1CS sponge agree in the witness tests.
Primitive/composition review is still required; no custom hash parameters or
handwritten pairing implementation is introduced.

The witness contains a spend secret, 128-bit amount, note secret/blinding,
20 siblings and direction bits, and output owner/secret/blinding. It proves:

- The input owner is the domain-tagged hash of a nonzero spend secret.
- The complete input note belongs to the public depth-20 root; the path is private.
- The nullifier binds deployment domain, spend secret and unique note secret.
- The output preserves the same asset and amount, and binds its recipient and opening.
- Amount and each ciphertext-digest limb are range-constrained to 128 bits.
- The transition digest binds every public input.

Tag values: 1 owner, 2 note, 3 Merkle node, 4 nullifier, 6 transition. The input
domain in generated samples is explicitly a test domain, not a production
network/account derivation. Random siblings represent a synthetic committed tree.
No real funded note ledger is created by this benchmark.

## Public input order and encoding

| Index | Field |
|---|---|
| 0 | Test deployment domain |
| 1 | Asset identifier |
| 2 | Merkle root |
| 3 | Nullifier |
| 4 | Output commitment |
| 5, 6 | SHA-256 of output ciphertext, low/high 128-bit little-endian limbs |
| 7 | Opaque test context |
| 8 | Domain-tagged transition digest of fields 0–7 |

Each scalar is a canonical 32-byte little-endian BN254 scalar, encoded as
64 lowercase hex characters. Never reduce noncanonical external integers modulo
the field. This spike format is separate from the draft semantic JSON schema;
there is no claim that the entire planned transaction envelope is enforced.

The uncompressed 256-byte proof is G1 A, G2 B, G1 C. Coordinate encoding is
little-endian x,y; G2 uses x.c0,x.c1,y.c0,y.c1, matching the
[NEAR host encoding](https://github.com/near/nearcore/blob/master/runtime/near-vm-runner/src/logic/alt_bn128.rs).
The contract checks exact lengths, canonical coordinates/scalars, curve membership,
subgroups and nonidentity proof/key points. Native host multiexponentiation,
negation and pairing check implement the Groth16 verification equation.

`contracts/verifier-spike` pins the verification key, domain, asset and root at
self-initialization. Its `verify` method is read-only and can verify the same proof
again. **It has no nullifier registry and does not prove double-spend prevention.**
It has no deposit, withdrawal, custody or admin-mint path. The dedicated testnet
account retains its local full-access test key and is upgradeable.

## Output recovery limitation

The benchmark encrypts the output opening with RustCrypto's sealed-box library,
decrypts locally and checks the recovered opening. Its SHA-256 digest is bound
to the proof, and AEAD rejects a modified ciphertext. This proves honest output
recovery and substitution resistance. It does **not** constrain correct encryption
inside the circuit or require recipient acknowledgment. A malicious payer can
still prove a transition containing garbage ciphertext. The full G1-ZK gate
therefore remains open and this circuit must never be used for custody.

## Reproduce

```sh
cargo test --workspace --locked
cargo run --release -p note-spend-spike --bin benchmark
rustup target add wasm32-unknown-unknown
cargo build -p verifier-spike --target wasm32-unknown-unknown --release --locked
npm ci --prefix scripts/testnet --ignore-scripts
node scripts/testnet/verify.mjs
```

The last command creates a dedicated faucet-funded `.testnet` account, deploys the
verifier and submits its checks. It uses test tokens only. Keys are written with
mode 0600 under ignored `.local/testnet-keys`; no signing keys are printed. Artifacts
and receipts live in `.local/zk-spike`. Do not regenerate setup and then reuse an
old deployed verifier. `--reuse --views` can redeploy the current Wasm to the same
dedicated account using an unchanged setup; the script checks the initialization
hash before reuse. It measures the valid call by transaction and negatives by view.

Remaining G1-ZK work: reviewed output recoverability, fixed arities and actual
largest join/trade/vault circuits, named-browser proving/RAM, setup review,
deployment-domain derivation, storage-growth accounting and independent circuit
review. Small-circuit timing does not answer those questions.


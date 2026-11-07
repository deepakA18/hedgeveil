# Real proof fixture, synthetic unfunded note

This is a real randomly generated Groth16 proof, not a mocked proof response.
It was accepted by the noncustodial NEAR testnet verifier. The associated note
has never represented deposited assets. `manifest.json` hashes the public
artifacts. No spend/view secret, plaintext note opening, Merkle path or setup
randomness is included. The encrypted output cannot be recovered without the
ephemeral demo recipient's key, which the benchmark discarded after its local
recovery check. This is not the planned user backup/restore implementation.

`cargo test -p note-spend-spike --test replay --locked` independently verifies
the fixture using the committed key and confirms that changing a public input
fails. Initialization and call arguments can also be replayed against the
noncustodial Wasm. A fresh benchmark creates new parameters; do not mix artifacts
from different runs. See `docs/CIRCUITS.md` and `docs/SETUP.md` for unresolved gates.

# Shared public inputs v0.1.0

`public-inputs.schema.json` is a **draft semantic JSON envelope**, not an accepted
proof, canonical transcript, curve encoding, hash choice or on-chain API. Its
reserved `.invalid` identifier is not a network dependency. All records are
closed to extra properties. Validate untrusted data before constructing witnesses.

Supported first lifecycle shapes: deposit, transfer, pair split/merge, redemption,
withdrawal. Orders, recovery and vault join/exit require their own reviewed state
bindings; they are deliberately rejected until specified. Transfer of existing
share notes does not grant vault accounting authority. Single-asset transfer
exposes asset kind/ID; pair operations expose series. No amounts appear for these
internal operations. Deposit/withdrawal and explicit relayer fees are public.

All operations bind protocol/network/pool/deployment, verifier-key hash, operation,
expiry, public fee recipient, outputs and ciphertext digests. Non-deposit operations
bind an accepted root and nullifiers. Pair operations bind current series state;
redemption binds the immutable finalization digest, leg and coefficient.
Withdrawal binds recipient, amount and recovery commitment. Pool/deployment
digests are conceptual identifiers pending canonical domain encoding.

The four-input/four-output maximum is an initial **schema test profile**, not a
measured chain budget or proof of feasibility. G1-ZK must freeze actual arities,
padding/dummy rules, tree depth/root retention, byte limits, field layout and
curve/field checks; benchmark the largest vault transition separately. Padding
and public array lengths can leak transaction structure. Testnet/sandbox only;
mainnet domains are rejected in this draft.

## Validation layers

JSON Schema enforces shape, lexical integer/digest encoding, per-operation fields
and array bounds. Decimal strings are additionally checked against u128 and
coefficients against Q by the test/reference validator in `validate.py`. JSON
numbers are never accepted for financial amounts. Duplicate output commitments
are rejected even if their ciphertext digests differ.

The contract/proof must independently enforce semantics absent from JSON Schema:
approved verifier/domain, expiry and chain time, accepted root, unspent nullifiers,
state freshness, balance conservation, payout/fee totals, valid account destination,
membership/ownership, authentic settlement and actual ciphertext hash/preimage
binding. Syntactically valid 32-byte hex is not a valid curve point or commitment.
Hash binding alone does not establish recoverable encrypted output. Never approve
a transaction because this validator passes. JSON parsing must reject duplicate
object keys before validation; `loads_strict` provides that behavior for fixtures.


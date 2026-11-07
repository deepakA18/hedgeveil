# G1 Sandbox experiments

Local runtime, token namespace/resolver, synthetic-oracle and native-withdrawal
feasibility probes. These are not the production clearinghouse, settlement oracle,
backed P/N issuance or vault. Read [SPEC](SPEC.md) for the bounded test contract.
G0 independent review and complete token/wallet/indexer conformance remain pending.

The isolated Cargo workspace uses Rust 1.96.0 and near-sdk/near-contract-standards
5.30.1. The root payoff workspace stays on Rust 1.91.0. npm dependencies are pinned
and locked in `tests/sandbox`; Sandbox node 2.14.0 is selected explicitly. Node
22.22.2 or newer is required by the pinned JavaScript dependencies.

From the repository root:

```sh
rustup toolchain install 1.96.0 --profile minimal --component rustfmt,clippy,rust-analyzer --target wasm32-unknown-unknown
npm ci --prefix tests/sandbox --ignore-scripts
python3 scripts/build-g1.py
npm test --prefix tests/sandbox
cargo +1.96.0 fmt --manifest-path research/g1/Cargo.toml --all -- --check
cargo +1.96.0 clippy --manifest-path research/g1/Cargo.toml --workspace --target wasm32-unknown-unknown --locked -- -D warnings
cargo +1.96.0 clippy --manifest-path research/g1/Cargo.toml -p g1-core --features fault-injection --target wasm32-unknown-unknown --locked -- -D warnings
```

First use downloads dependencies and the official Sandbox binary. Runs require
local process/loopback permissions. No `.env`, wallet file, API key, faucet or
public-network deployment is used. Each run creates fresh ephemeral accounts and
tears down its node; test signer keys are never printed or written into evidence.
The normal and fault Wasm files and manifest live in ignored `target/g1-artifacts`.
The runner verifies artifact hashes and that normal core exports no fault API.
A successful run writes `research/reports/g1-sandbox.json`; a failed run writes
`target/g1-failed.json` and exits nonzero without replacing successful evidence.

`replay-g1-observation.py` reads a committed synthetic window, verifies coverage
and computes the integer mean plus data/config hashes. Replaying in a separate
process needs no clock or source service. The oracle exercises proposal/challenge/
finality/delay; test identities control proposals and arbitration. Bond release,
production historical archives and economic security are not implemented.

The core uses bounded sponsor-funded storage and operations. Only registered
predecessors deposit/withdraw. Failed native payments restore free balance once;
failed/missing callbacks remain pending until marked UNKNOWN and never authorize
resend/refund. The fixture-only feature can inject callback faults and replay
results for testing. Never deploy that artifact to public custody.

The FT fixture uses the pinned official implementation. The P/N MT probe is an
explicit subset with sponsored registration, no approval extension, no batch-call
interface or complete metadata/event/storage compatibility. Its arbitrary seeded
balances and test burns are not backed claims. Passing its callback tests does not
prove NEP-245 conformance or wallet/DEX support. The product retains the public
internal-ledger path until the remaining compatibility gates pass.

Primary references used for this spike:

- [NEAR integration testing](https://docs.near.org/smart-contracts/testing/integration-test)
- [Official Sandbox JavaScript runner](https://github.com/near/near-sandbox-js)
- [near-sdk and contract standards](https://github.com/near/near-sdk-rs)
- [NEP-245 interface and resolver requirements](https://github.com/near/NEPs/blob/master/neps/nep-0245.md)

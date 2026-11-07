# ADR 0003: isolate G1 experiments and retain internal-ledger fallback

Status: local implementation decision, 7 November 2026; independent review pending.

The current SDK 5.30.1 package declares Rust 1.95 minimum. Use installed Rust 1.96
in `research/g1` with exact SDK/standards and lockfile pins. Keep the validated root
Rust 1.91 payoff workspace unchanged and exclude G1 from it. Pin near-api-js 7.4.0,
near-sandbox 0.3.5 and node 2.14.0; test actual compiled Wasm and inspect receipts.
Advance Sandbox by observed timestamps rather than assuming seconds per block.

G1 contracts are bounded experiments with sponsor-funded storage and separate
oracle bonds. Neither test issuance nor sponsor accounting implements G3. Compile
withdrawal fault injection as a separate artifact, check normal exports, and
record source/lock/Wasm hashes. Never infer failure of a transfer from failure of
its later callback. UNKNOWN is unavailable and cannot trigger timeout refunds or
resends. Use bounded promise-result reads and private callbacks.

Bind oracle imports to the immutable oracle account and full observation terms,
including source/config hashes, units/window and test proposer/adjudicator/bond/
deadline policy. Synthetic observations replay independently of current time.
Disclosed adjudication demonstrates state transitions, not source independence.
Bond release/slashing and production recovery remain separate implementation work.

FT and P/N namespaces can coexist in the measured local fixture. Receiver refunds
must be limited by transferred and remaining quantities even after receiver burns
or spends. The custom MT probe lacks complete standard interfaces, metadata,
events, storage lifecycle and wallet/indexer validation. Retain the product's
internal-ledger path; do not advertise NEP-245 conformance or composability yet.

See [G1 evidence](../../research/reports/G1_PUBLIC_LEDGER.md) and the
[experiment specification](../../research/g1/SPEC.md). No public-network deployment,
credentials, production authority change or independent review is implied.

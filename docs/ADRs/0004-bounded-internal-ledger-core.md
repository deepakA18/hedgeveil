# ADR 0004: bounded core through the internal-ledger fallback

Status: local implementation decision, 7 November 2026; independent review pending.

Proceed with Sandbox-only G3 development using the plan's explicit internal-ledger
fallback. G1's token namespace/resolver evidence does not constitute NEP-245 or
wallet/indexer compatibility. Expose ordinary internal transfers; do not stub FT/MT
interfaces or claim those gates passed. Keep production disabled.

Use the measured Rust 1.96/SDK 5.30.1 workspace under `contracts`, with typed wire
records under `crates/protocol-types`. The root payoff library remains unchanged
and is a direct dependency. Preserve G1 and archived evidence.

Bounded BTreeMap state allows an explicit 16-account/8-series/4-ticket-per-account
profile with invariant checks after each mutation. Each account/series funds a
4096-byte allowance; separate bootstrap funds cover code/operations and temporary
storage during refund callbacks. Pin queried storage cost at initialization; a
protocol cost change requires reassessment before additional public deployment.
These development caps and fees are not approved production economics.

Series terms and prices are immutable. Merge only before finalization; redeem
using shared checked math. Dust can move to protocol fees only after both supplies
are zero. Refund storage to its original category on failure; quarantine every
unknown outcome. Delete terminal tickets explicitly, with monotonic IDs.

Canonical event deltas are derived from before/after accounting records, with
supply separated from ownership. Independently replay those events and compare
state. Bind oracle results to immutable config and a callback request sequence.
The G3 oracle is an explicit test fixture, not a replacement for ORC-01/02.

See [core specification](../../contracts/README.md) and
[G3 measurements](../../research/reports/G3_COLLATERAL_CORE.md). Remaining independent
review, full production key/recovery controls and larger adversarial coverage
remain gates; local progress does not certify them.

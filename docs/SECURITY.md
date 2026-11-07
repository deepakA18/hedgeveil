# Security evidence and release gates

The bounded collateral core is implemented and tested in local Sandbox; it is
not independently audited or formally verified. Read the
[threat model](THREAT_MODEL.md) and [accounting assumptions](../verification/assumptions.md).
Arithmetic and schema tests cover only their stated scopes. G1 additionally runs
compiled-Wasm callback/receiver/oracle fault cases in Sandbox, with bounds and
remaining gaps in [the G1 report](../research/reports/G1_PUBLIC_LEDGER.md). Fixture
test issuance, sponsored storage and fault-only entry points must not be promoted
to the product contracts. G3 uses user-funded storage, a separate operating
allocation and a distinct normal artifact; its stateful, event-replay and callback
evidence is in [the G3 report](../research/reports/G3_COLLATERAL_CORE.md).

Required SEC-01 layers: unit/serialization tests; shared rational/Rust vectors;
stateful conservation across split/transfer/trade/merge/finalize/redeem;
compiled-Wasm Sandbox receipts; oracle/withdrawal interleaving models; bounded
symbolic or formal analysis with assumptions; actual browser flows; load and
storage/gas limits. SEC-02 maps independent review and remediation to the exact
source/Wasm candidate. Publish coverage boundaries and counterexamples.

Mandatory failures include forged/replayed quotes, cancelled/revoked keys, shared
maker inventory, near-maturity delays, missing storage, malicious receivers,
wrong-series results, unauthorized callbacks, equivocation, arbitrator timeout,
rounding fragmentation, donations, stale NAV, no bids and keeper overreach.

Withdrawal acceptance specifically includes external success followed by callback
failure. UNKNOWN remains unavailable without refund/resend; only authenticated
failure restores the original owner's free balance once. Testnet quarantine does
not establish production recovery. G10 additionally requires reviewed recovery,
independent settlement, exact key/custody audit, critical/high remediation and
operational incident drills. Testnet upgrade authority must be disclosed.

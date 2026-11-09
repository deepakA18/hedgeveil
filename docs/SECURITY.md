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

G4 adds a bounded synthetic settlement contract and independent archive replay.
Its [evidence](../research/reports/G4_SETTLEMENT.md) covers committed publisher
authorization, historical aggregation, disputes, deadlines, bond conservation and
real credit-transfer faults. File hashes authenticate the selected data, not its
truth. All publishers/arbitrators remain test roles under one operator; future
production data independence, economic security and exact release review remain
open. G4 events currently carry aggregate bond totals and state commitments;
G7 still needs per-account indexing/reconciliation and an evidence UI.

G5's [market evidence](../research/reports/G5_FUNDED_MARKET.md) covers signed exact
fills/pair issuance, invalid domains/signatures, cancellation ordering, reused
inventory, durable replay protection across unregistration, maturity/cutoff and
market pauses. JS/Rust encodings agree and every fill is linked to a signed
payload and actual receipt. Two separate local workers exercise request-time
freshness/loss withdrawal; there is no continuous feed monitor or production
reference authentication yet. These bounded tests are not exhaustive concurrent
execution, signature interoperability or an independent security review. Retained
maker/key limits can exhaust lifetime capacity; production reuse/migration design
is separate. The new core passes the complete G3 payout-fault regression.

G6 VLT-01 [basket evidence](../research/reports/G6_BASKET.md) covers seeded
bootstrap, proportional rounding, complete limits, share ownership and storage,
donation isolation, pauses, unresolved/finalized claim exits and permanent final
closure. Managed native cash and claims participate in existing conservation
checks; share supply is separately reconciled. There is no token callback surface
or keeper authority yet. The profile rejects testnet vault creation and does not
claim selected strategy safety. Independent review and combined interleaving/fuzz
coverage remain pending.

VLT-02's [one-shot guard evidence](../research/reports/G6_KEEPER.md) adds maker
quotes explicitly bound to the core account, authenticated current-reference
publication and immutable timing/fee/loss/notional/series checks. Ordinary fills
retain predecessor authorization. Expected deferrals do not move holdings or
consume a nonce; signature-verification failures revert. Publisher truth remains
a separate trust assumption, even when signatures and freshness pass. The local
keeper/planner and publisher are distinct accounts/process roles under one test
operator. No production source independence, signed quote-creation timestamp,
approved recurring policy or exhaustive concurrent-state proof is claimed.

SEC-01 now adds [finite executable models](../verification/README.md) for
withdrawal, oracle and resolution-import interleavings and bounded reserve
redemption. Ten deliberately unsafe model mutations must produce counterexamples.
The extended stateful Sandbox profile mixes signed trades into the independent
ledger comparison and reports observed gas/storage at the local caps. See the
[SEC-01 evidence and invariant matrix](../research/reports/G8_SECURITY.md).
Separate bounded SMT checks find no counterexample to 32 accounting obligations
at eight selected complementary coefficients and the actual supply cap. This is
neither symbolic Rust execution nor an independent audit. General
cross-module concurrency, production load and SEC-02 review remain open.

Required SEC-01 layers: unit/serialization tests; shared rational/Rust vectors;
stateful conservation across split/transfer/trade/merge/finalize/redeem;
compiled-Wasm Sandbox receipts; oracle/withdrawal interleaving models; bounded
symbolic or formal analysis with assumptions; actual browser flows; load and
storage/gas limits. SEC-02 maps independent review and remediation to the exact
source/Wasm candidate. Publish coverage boundaries and counterexamples.

SEC-02's [local review handoff](SECURITY_REVIEW.md) now packages an exact committed
candidate, separates normal/fault artifacts and labels historical evidence by
input mismatches. The verifier requires an externally retained manifest digest;
it cannot grant approval or interpret missing findings as a clean review.
Independent review, remediation and reviewer retest remain pending.

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

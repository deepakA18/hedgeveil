# G1 local feasibility contract specification

Sandbox-only experiments, not the G3 clearinghouse or a public custody release.
The root implementation plan and docs/SPEC.md govern economics. No changes to
payoff equations, fees, product permissions or production deployment are made.

Runtime: isolated Rust 1.96.0 workspace, near-sdk/near-contract-standards 5.30.1;
near-api-js 7.4.0 and near-sandbox 0.3.5. Pin the node binary version in the runner.
All accounts/keys are ephemeral Sandbox accounts. No .env or public chain is used.

Core experiment: sponsor-funded storage/operations (20 local NEAR at deploy),
maximum 8 registered accounts and 32 retained tickets. Registration is admin-only
and consumes sponsor storage, never a user deposit. This deliberately excludes
production storage/refund/cleanup machinery. Positive native deposits credit only
registered predecessors. User free balances and withdrawal obligations are separate.
Debit first, persist fixed owner/receiver/amount/version, then transfer with a
private callback. Success is accepted only for an empty native-transfer result;
confirmed failure restores original owner exactly once. Malformed results become
UNKNOWN. PENDING can become UNKNOWN after a five-second reporting threshold;
this does not refund/resend. Both states remain quarantined until an authenticated
callback, if one is still in flight. There is no timeout retry or recovery authority.
Views expose tickets and totals. Production durable verified recovery remains G10.

The explicit `fault-injection` feature adds administrator-only methods for real
callback panic/gas exhaustion, malformed result and replay tests. These compile
only into separate fault artifacts and must never be deployed to public custody.
No fault API may debit another owner. Test injection supplies real promise receipts,
not a mocked success string. Both normal and fault artifacts are built and hashed.

Synthetic oracle: one immutable observation per deployed instance, with scenario,
source hash, window, units/scale, oracle version/config hash, and authorized test
proposer/adjudicator fixed at initialization. Proposal and challenge require exact
bonds funded separately; each occurs once. Challenge is permissionless during its
window and supplies a conflicting evidence hash. Finalize an uncontested proposal
after deadline; a disputed result needs the disclosed adjudicator before arbitration
deadline. A missed adjudication becomes RESOLUTION_DELAYED with no fabricated price.
Finalized state cannot be rewritten. Bond release/slashing is intentionally absent
from this spike; bonds remain recorded and locked. G4 implements reviewed bond flows.
Positive prices only; missing/zero observations fail. Demo intervals are short and
fixed in the config; the runner advances only Sandbox time. Production independence,
source collection/retention and economic security are not demonstrated.

Core import: fixed expected oracle account and full observation identity; request
calls that oracle and binds the returned identity in a private callback. Nonfinal,
malformed, failed or mismatched results cannot set price. Repeated imports cannot
rewrite final price. Source replay uses a committed deterministic dataset and hash;
loading it in a new process must reproduce the observation, independent of node time.

Token experiment: official FT implementation for a fixture share namespace plus a
separate bounded MT candidate for P/N. Arbitrary test issuance has no product backing
claim. Test direct transfers and receiver/resolver paths (partial return, over-return,
malformed output, receiver panic, spending/burning before return), registration and
nonzero unregister behavior. Ordinary token APIs require one yocto authorization.
No claim of full NEP-245 or wallet/indexer compatibility: record every missing method,
metadata/event/storage rule and retain the internal-ledger release path until full
conformance is demonstrated. Test-only burn methods model receiver consumption.

Acceptance records must include actual receipt status/gas, native balance deltas,
storage measurements, source/lock/Wasm/node versions, positive and negative cases.
Independent G0/security review stays pending. Local feasibility does not complete G1
wallet/indexer evidence or production recovery, nor authorize a testnet deployment.

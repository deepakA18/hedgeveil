# G7 / APP-01 local client evidence

8 November 2026. Scope: a Node SDK with TypeScript declarations and a durable
local receipt recovery CLI for the public internal ledger. This is an implemented
portion of APP-01, not completion of G7. Dependencies are CORE-02/03/04, MKT-01 and
VLT-01; product/contracts/security review remains **pending**. No independent
reviewer sign-off, browser wallet, public deployment or production recovery is
claimed. The [root plan](../../IMPLEMENTATION_PLAN.md) remains authoritative.

## Implementation and invariant

Eleven allowlisted write builders enforce canonical string u128/u64 amounts,
exact deposits, the Sandbox domain and method-specific arguments. TypeScript
method/argument unions reject number-valued money and unsupported methods.
Shared-schema projections and actual emitted events are validated. The existing
RFQ codec signs exact quote bytes; the SDK submits an actual funded signed fill.

A public JSON config binds the RPC's chain ID/genesis, core account, code hash and
stored domain. The sole contract change is the additive `deployment_identity`
view: no state layout, payoff, collateral or callback behavior changed. Production
remains disabled. Node 24.8.0, near-api-js 7.4.0, near-sandbox JS 0.3.5, Sandbox
2.14.0, near-sdk 5.30.1 and Rust 1.96.0 were used. Type checks use TypeScript 5.9.2;
the root payoff workspace remains Rust 1.91.0.

The retained local operation can invoke its signer at most once. A fully written,
fsynced attempt marker is published with an exclusive link before signer entry.
The immutable intent, hash and append-only observations survive fresh processes.
Lost responses, thrown signer exceptions, cancellation, RPC outages and a known
failed receipt never reset send eligibility. The journal is trusted local state;
losing it or using a new ID can repeat an on-chain action. Client IDs are not
on-chain idempotency keys. A manually supplied hash requires operator correlation
to the exact attempt, not an older transaction with identical action contents.

Only matching FINAL RPC execution and complete linked outcomes establish success
or failure. The client checks hash, signer, receiver, single method/args/deposit/gas,
root receipt binding and core event domain/actor. It retains full public RPC
responses. A failed refund child does not erase an already committed atomic
ledger action. Withdrawal recovery separately binds the request's ticket delta
and terminal callback; it never infers restoration from timeout or main transaction
status. Read-only recovery never changes UNKNOWN tickets or sends a refund.

## Actual execution results

[Machine-readable evidence](g7-client.json) retains source SHA-256s, artifact
hashes, actual chain identity, 31 recorded deployment/method transactions, 31
canonical ledger events, 17 finalized RPC responses and 19 passing acceptance
checks. Account-creation setup transactions are not included in the 31. Ephemeral
keys remain in process memory; public signing keys/signatures in RPC records are
not private keys. Capital comes from local genesis accounts. Oracle observations
are disclosed synthetic fixtures; no market price or economic result is asserted.

| Acceptance path | Evidence |
|---|---|
| Exact funding and internal ownership | Real storage/deposit/split/transfer; storage is not credited as collateral |
| Typed wire/contract agreement | All 11 builders execute on compiled Wasm; normalized intents and actual logs pass shared schema |
| Funded RFQ | Registered Ed25519 key, actual signed quote fill and consumed nonce bitmap |
| Failed frontend/CLI process boundary | Separate prepare, submit and recover processes for merge, in-kind exit and redemption; parent IPC signer sends actual transactions |
| Lost deposit response | Real 17-yocto deposit commits, adapter loses its response, restarted client refuses second send and recovers the identified hash |
| Hash retained before response loss | Journaled hash recovers a committed merge after the adapter throws |
| Cancellation and repeated actions | Cancelled prompt sends no transaction; cancelled and confirmed-failed operation IDs cannot submit again |
| Wrong deployment | Wrong deployed code or journal genesis binding prevents signer invocation |
| Confirmed native payout | Linked callback and exact 100-yocto recipient balance change agree |
| Confirmed native failure | Missing destination fails; callback restores free collateral once despite the failed child receipt |
| Closed terminal ticket | Original linked successful callback still establishes payout after explicit owner cleanup |
| Callback panic / gas exhaustion | Separate fault artifact sends native funds, then fails callback; shared classifier returns WITHDRAWAL_UNKNOWN with PENDING ticket |
| UNKNOWN quarantine | Fault tickets become UNKNOWN; 200 yocto remain in flight without refund/resend |
| Current assets after restart | Fresh read-only CLI account view matches actual core state |

The callback-fault writes are made directly by the test harness against the
separately marked fault artifact, then passed to the same withdrawal classifier.
The product intent builder exposes no fault method. This proves the classifier's
handling of real fault receipts, not a product fault API or an on-chain recovery
capability. Successful/failed ordinary withdrawals go through the full SDK path.

## Artifacts and verification

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| clearinghouse.wasm | 614,630 | `378f6ce6e57e073670d53580b64d6f1744b9c8ca2f54c2022e608e345fa3a007` |
| clearinghouse-fault.wasm | 620,800 | `b9d53331a4a996eb02697f517a3d2da36f5d1616296edf5153b2d73f314fc556` |

Thirteen Node client test groups cover exact conversion/bounds, malformed inputs,
unsupported methods, deployment rejection, competing journal claims, corruption,
restart/response loss, cancellation, transaction mismatch/incomplete finality,
terminal conflicts, callback/ticket binding and child-refund semantics. Transport
fixtures in these unit tests are explicitly synthetic, separate from the actual
execution report above. TypeScript positive/negative compilation checks pass.

The five Python payoff tests, 565 reproducible vectors, three locked root Rust
tests, both workspace format checks, root Clippy, Wasm-target contract Clippy for
normal/fault builds, 11 schema groups, schema regeneration/check, seven existing
RFQ/keeper unit tests and RFQ binary-vector check pass. Contract workspace locked
`cargo test` succeeds but defines no host contract tests; execution evidence is
compiled-Wasm Sandbox. No independent audit or comprehensive concurrency/load
coverage is implied. Earlier G3–G6 reports and archived checksum evidence remain
historical and unmodified; they are not relabelled as runs against this artifact.

Reproduction and CLI examples are in [CLIENT](../../docs/CLIENT.md) and
[README](../../README.md). The harness stops its Sandbox at the end and writes
public per-run config/journals to ignored `target/g7-<id>/`. Interactive use needs
a separately running local chain and explicitly selected trusted signer adapter.
It is not yet the persistent no-frontend demo bundle required for release.

## Remaining gates

Browser wallets and durable browser storage, complete error UX, remaining SDK
methods, PostgreSQL finalized event replay/reconciliation, UI/evidence views,
provider failover and funded public testnet flows remain G7 work. The next local
increment is INF-01 indexing/reconciliation. The journal trusts local filesystem
fsync/exclusive-link semantics and the pinned RPC; it is not a cryptographic
receipt proof. Code checks do not atomically prevent authorized concurrent
upgrades. Unknown payout resolution remains the separate reviewed production
gate. No recurring economic policy has passed G2; that limitation is unchanged.
Independent review is pending throughout; G9 release and G10 production remain open.

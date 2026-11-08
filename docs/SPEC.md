# Public-ledger protocol specification v0.2

Status: implementation baseline pending independent review. Supersedes the
privacy-track specification. [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)
is authoritative. The payoff library/reference, draft schemas,
[G1 feasibility fixtures](../research/g1/SPEC.md) and a
[bounded G3 core](../contracts/README.md) exist; this is not an audited custody
system or a public deployment. G1 sponsor-funded storage and fault hooks
are experiment constraints, not amendments to this product's accounting rules.

## Product and units

Native NEAR backs public complementary P/N balances. One transparent vault holds
up to four series and issues public transferable shares. Backend services have no
balance authority. The first release has no borrowing, collateral staking,
rehypothecation, multichain custody, arbitrary payoff scripts or physical delivery.

| Quantity | Unit / representation |
|---|---|
| Collateral, claim amounts, share quantities | Canonical decimal-string u128 atomic units |
| Q | 10^24 atomic NEAR per NEAR; also coefficient scale |
| K, X_M | Positive strike / nonnegative observation, USD per NEAR × 10^12 |
| p_q, n_q | Integers in [0,Q], with p_q+n_q=Q |
| Times | Canonical decimal-string u64 UTC nanoseconds |
| M | End of the observation window, distinct from finalization time |

No floating point monetary amounts, signs, whitespace, exponents, decimal points
or leading zeros except `"0"`. Rust uses checked U256 intermediates; Python uses
exact rational arithmetic. Representation ceilings are not approved economic
limits. Lower per-series supply, whole-contract, oracle exposure, batch and
storage caps must be measured/frozen before their implementation gate passes.

## Payoff and rounding

For K>0, p=1 when X_M<=K, otherwise K/X_M; n=1-p. A pair backed by C NEAR
pays C×p NEAR to P and C×n NEAR to N. At observation, the ideal USD values are
C×min(X_M,K) and C×max(X_M-K,0). Holding both legs preserves NEAR exposure.

| X_M, K=2 USD/NEAR, C=1 NEAR | P NEAR | N NEAR | P USD | N USD |
|---|---|---|---|---|
| 8 | 0.25 | 0.75 | 2 | 6 |
| 4 | 0.5 | 0.5 | 2 | 2 |
| 2 | 1 | 0 | 2 | 0 |
| 1 | 1 | 0 | 1 | 0 |

The numbers are fictional. Below strike P absorbs losses; a normalized $1 share
price is not a peg. Before maturity intrinsic payoff is not fair option value.
Executable quotes determine trades; models are diagnostic marks only.

Finalize p_q=Q if X_M<=K, otherwise floor(K×Q/X_M), with n_q=Q-p_q. Redeem
floor(amount×coefficient/Q). Preserve the remainder identity and round required
inputs up. Zero-payout claims remain burnable. Equal P/N quantities redeemed once
leave zero or one atomic unit of redemption dust. Fragmenting redemption can
increase dust but cannot increase payouts. Coefficient quantization shifts less
than amount/Q atomic units from ideal P to N before final payout rounding; that
bound is not always one atomic unit for arbitrary u128 amounts.

Missing or invalid prices are never zero. Zero is rejected unless explicitly
allowed by the immutable observation policy and authenticated as genuine. K=0 is
invalid. Inverting 1/4 NEAR/USD gives 4 USD/NEAR; conversion/quantization rules
belong in the observation definition. With X_M=4, K=2 and finalization spot=2.4,
P receives 0.5 NEAR worth 1.2 USD at that later time.

## Public accounting and authorization

One clearinghouse owns distinct accounting, series, claims, RFQ, vault, share,
withdrawal and permission modules. All asset transfers and fills within the
core update atomically. Public views expose account balances, reserves, supply,
funded balances/locks, basket holdings, tickets and policy versions with bounded
pagination. Canonical events identify version, operation, actor, exact asset
balance deltas, fees and resulting state references. State is authoritative.

A predecessor account authorizes user debits, not a caller-supplied owner string.
The vault inventory has its own namespace and may only move through checked vault
operations. Registration/storage payments are separate from deposited collateral.
Raw native account balance is not a reserve ledger. Reconcile series reserves,
free and order-reserved balances, fees, bonds, storage liabilities and withdrawals;
never count vault underlying holdings and shares twice.

Series terms are immutable: ID/version, native collateral, payoff/index definition,
strike/price scale, maturity/window/cutoff, oracle config/version, finalization
policy and supply cap. Derive claim IDs deterministically; duplicate IDs in
batches fail. Canonical ID derivation and wire/signature bytes remain G1 decisions.

| Transition | Authorization and accounting effect |
|---|---|
| Deposit | Registered predecessor; credit positive attached collateral only |
| Split c | Before cutoff by block time; free collateral -c, series reserve +c, P/N supply and caller balances +c each |
| Transfer | Debit authorized account and credit recipient for the same asset; registered/storage-funded recipients |
| Merge c | Before finalization, including disputes; burn matching P/N, reserve -c, free collateral +c |
| Finalize | Authenticated oracle callback; fixed complementary coefficients, no reserve creation |
| Redeem a | Finalized; burn claims, reduce reserve by rounded payout, credit free collateral; burn even if payout is zero |
| Fill quote | Verify registered maker signature/domain/nonce/expiry, all legs and fees funded; move them atomically and consume nonce |
| Withdraw c | Debit free balance first; create one public ticket with fixed owner/destination/amount; schedule payment |

Fees are explicitly funded, never silently removed from promised backing. Track
dust separately and release it only after both supplies are zero and no redemption
obligation remains; the destination/authorization must be specified before a sweep
method ships. Unsolicited transfers are surplus, not user credit or vault issuance.
See [the accounting assumptions](../verification/assumptions.md).

## State machines and asynchronous boundaries

Series: OPEN → MATURED_PENDING → PROPOSED → FINALIZED → CLOSED, with DISPUTED
and RESOLUTION_DELAYED branches. Enforce maturity from block time even if a keeper
has not advanced the label. Pause is separate and scoped. No closing can strand
claims; no post-finalization merge can bypass partially consumed reserves.

Resolution import calls the allowlisted oracle and validates its finalized record
only in a private callback bound to series/request ID, oracle version/config,
window, units and bounds. Failed imports remain pending and retry idempotently.
Caller-pasted prices cannot finalize, including in demo mode.

Withdrawals: available balance → PENDING → SUCCEEDED, or FAILED_CONFIRMED →
one restoration to the original owner's free balance. Failed/missing callback
means UNKNOWN; timeout is not proof of failed delivery. Never resend or re-credit
UNKNOWN. Preallocate ticket storage and measure callback gas. Block test upgrades
with unsettled operations. Reviewed receipt recovery or an explicitly trusted,
capped adapter/committee is a production gate, not an invented testnet refund.

## RFQs, vault and token interfaces

Public all-or-nothing quotes bind protocol/network/contract, maker/optional taker,
exact asset legs, fees, rounding, expiry, nonce/cancellation epoch and a registered
signing key/scheme. Multiple quotes may reuse inventory; recheck it atomically at
fill. Only an explicit resting offer locks inventory. The relay is not execution
authority. Partial fills are out of scope. Direct old/new-series swaps are atomic.

Mint shares from a proportional basket: at supply S and holdings h_i, minting s
requires ceil(s×h_i/S) per asset with user limits. Bootstrap uses a predefined
basket/share scale. Exit returns floor(s×h_i/S); the last holder receives all
remaining managed holdings after accrued fee liabilities are separated. Reject
useless dust mints, enforce minima, and test donations/first-depositor attacks.
No backend-marked NAV issuance. In-kind exits include unresolved claims; cash-only
exits require executable quotes. No bid means ROLL_DEFERRED and retained holdings.
Policy changes create a new vault version; existing holders retain exits.

Target NEP-245 P/N and NEP-141/145/148 shares after a pinned compatibility spike.
Keep namespaces distinct and implement/test full receiver/resolver and registration
semantics before claiming conformance. Until then the internal ledger/SDK is the
explicit interface; token composability is incomplete. A keeper has no user
withdrawal or upgrade authority. See [the threat model](THREAT_MODEL.md).

## Delivery boundary

Sandbox and testnet use committed synthetic observations and disclosed test
signers. Testnet prominently labels DEMO ORACLE — SYNTHETIC PRICES; it uses real
receipts and normal chain time. Paid data, API credentials and mainnet funds are
not correctness dependencies. G9 completes the hackathon release; production
source independence, verified payout recovery and audit remain G10 gates.

## G3 implementation profile

The first bounded internal-ledger implementation is specified in
[contracts/README.md](../contracts/README.md). Its explicit storage/refund categories,
local caps, fixed series creation fee, dust-to-fees destination, one-yocto fees,
canonical IDs, event framing and scoped pauses refine this specification for
Sandbox development. It reuses payoff-math without changing financial equations.
No token conformance or independent review is implied. Storage-refund failure
restores storage funding (not collateral), while collateral-withdrawal failure
restores free collateral. Both use the same quarantine discipline.

## G2 research profile

The offline economic simulation is specified in
[the frozen experiment protocol](../research/policy-comparison/PROTOCOL.md).
It preserves these payoff units and rounding rules. Diagnostic model prices are
quantized before integer ledger execution; they are synthetic quote inputs, never
chain prices or observed market liquidity. Research policy parameters, simulated
fees and benchmark debt are not changes to the contract or approved vault terms.

## G4 demo settlement profile

[The G4 oracle profile](../contracts/settlement-oracle/README.md) fixes the
synthetic evidence format, publishers, historical fallback, deadlines and bond
allocation before implementation. Oracle bond/storage/operating custody is
separate from clearinghouse collateral. Failed bond withdrawals restore only
original credits; UNKNOWN remains quarantined. This demo profile does not approve
production source independence, economic security, or administrative keys.

## G5 funded market profile

The [G5 market specification](../docs/MARKET.md) pins domain-separated RFQ and
pair-creation signing bytes, prepaid market storage, permanent replay protection,
fee rules and bounded atomic execution before implementation. Native/P/N ledger
units and payoff equations are unchanged. G5 is a new clearinghouse state layout
for fresh demo deployments, not an in-place upgrade of G3/G4 state. No policy
approval or production market readiness follows from local maker execution.

## G6 basket mechanics increment (VLT-01)

Before implementation, [VAULT](VAULT.md) defines one Sandbox-only, immutable
basket-demo vault: exact seeded bootstrap, ceiling proportional inputs, floor
in-kind exits and complete last-holder allocation. Shares use a separate internal
ledger. There are no management/performance liabilities or keeper authority in
this increment. G2 policy selection and VLT-02 guards remain pending; no rolling
strategy is enabled. This changes core state layout and requires fresh accounts.

## VLT-02 experimental guard profile

The [keeper profile](KEEPER.md) defines an optional, immutable, one-shot Sandbox
roll configured before initial shares exist. It adds authenticated synthetic
current references, direct maker-funded P-to-P execution, explicit native fee/loss
budgets and persistent deferral without affecting exits. It is not FIN-02 policy
selection or an approved tracking strategy. Existing basket-only creation remains
available. New optional state requires fresh deployments, with no migration.

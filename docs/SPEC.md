# Public-ledger protocol specification v0.2

Status: implementation baseline pending independent review. Supersedes the
privacy-track specification. [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)
is authoritative. The payoff library/reference, draft schemas,
[G1 feasibility fixtures](../research/g1/SPEC.md) and a
[bounded G3 core](../contracts/README.md) exist; this is not an audited custody
system or a public deployment. G1 sponsor-funded storage and fault hooks
are experiment constraints, not amendments to this product's accounting rules.

## Release profile decision — 9 November 2026

The user approved an options-first public testnet release. Vault entry and keeper
actions remain disabled; existing Sandbox vault mechanics and economic results
are retained research. This profile does not alter payoff, custody, oracle or
withdrawal rules. No recurring tracking policy has passed selection. A future
vault release needs its own economic and review acceptance.

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

Hashless `fill_quote` recovery may resolve to `QUOTE_EXPIRED_UNFILLED` only with
a finalized block at or after quote expiry and a same-block maker registry whose
epoch still equals the signed quote epoch and whose consumed nonce bit is clear.
The deployment code must match the journal binding at that block. This proves
the quote did not fill and cannot fill later; it does not prove no transaction
was submitted or no gas was spent. Preserve the original attempted journal and
evidence. A fresh quote requires a new explicit review/signature; never resend
the old operation. Consumed nonces, changed epochs, malformed data, RPC failure,
and other methods remain unresolved. A subsequently supplied matching receipt
can refine transaction/gas status. No refund or ledger mutation follows recovery.

Series: OPEN → MATURED_PENDING → PROPOSED → FINALIZED → CLOSED, with DISPUTED
and RESOLUTION_DELAYED branches. Enforce maturity from block time even if a keeper
has not advanced the label. Pause is separate and scoped. No closing can strand
claims; no post-finalization merge can bypass partially consumed reserves.

Resolution import calls the allowlisted oracle and validates its finalized record
only in a private callback bound to series/request ID, oracle version/config,
window, units and bounds. Failed imports remain pending and retry idempotently.
Caller-pasted prices cannot finalize, including in demo mode.

The ORC-03 Outlayer reader is diagnostic only: `settlement_eligible` is always
false. Query time and on-chain ingestion time are not historical venue observation
proof. Null/stale/ambiguous data never becomes zero, synthetic replacement data,
or a final resolution. An external source requires a separately specified,
versioned adapter and evidence for the immutable observation window before use;
existing series terms cannot be changed to accept a different source.

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

User-directed release boundary, 9 November 2026: synthetic observations and
fixed fixture maker marks are confined to deterministic tests/research. Public
testnet requires authenticated external observations and historical expiry
coverage, an accepted versioned resolver, and maker pricing derived from market
inputs. Current spot alone does not define an option premium or a past expiry
price. Missing data yields no quote/delayed settlement, never zero or a fixture
fallback. This changes release acceptance, not the implemented payoff or existing
immutable terms. No real-data resolver is implemented by this document change.

Local tests remain usable without paid API credentials. Public release remains
blocked on real-data integration; paid service use is not enabled automatically.
Testnet assets remain test currency and transactions require real receipts. G9
requires the above integration; production economic security, reviewed recovery
and audit remain G10 requirements. The old synthetic public deployment is held.

## G3 implementation profile

### ORC-03 signed observation intake (diagnostic, not settlement)

The first real-data intake increment verifies Outlayer JSON feed signatures over
the exact UTF-8 payload against an explicitly pinned Ed25519 key. A key published
in provider documentation is an interoperability pin, not independently verified
TEE attestation or approved settlement authority. No API key or paid request is
required to verify an already obtained signed response.

Reject duplicate JSON keys, unsafe numeric encodings, wrong/missing assets,
nonpositive prices, unsupported exponents, overflow and lossy price conversion.
Normalize NEAR/USD to 10^12 only with exact integer arithmetic. Parse publish time
as whole Unix seconds. Current-input validation rejects future or older-than-bound
observations. Historical verification is separate and must never make an old
observation current by changing its timestamp.

Archive immutable signed artifacts by payload hash and reverify every artifact
when replaying. Identical observations deduplicate. Conflicting prices at the same
publish time make a current selection ambiguous; an earlier same-time value is
never silently overwritten. A deleted file is not recoverable from the archive;
the archive does not prove complete historical coverage, earliest inclusion or
that later source inputs preceded maturity. No local acquisition timestamp is
source-authenticated.

The signature covers asset/price/exponent/publish time, not envelope `sources`,
source count, aggregation choices, request parameters or our series/config.
Exclude unsigned metadata from the verified artifact. Every intake result remains
ineligible for settlement until the versioned historical rule and source-policy
authentication are accepted. This increment changes no financial behavior and
does not connect the feed to makers or clearinghouse payouts. Public setup and
the old fixed-price maker runtime remain held; local tests retain their fixtures.

The first bounded internal-ledger implementation is specified in
[contracts/README.md](../contracts/README.md). Its explicit storage/refund categories,
local caps, fixed series creation fee, dust-to-fees destination, one-yocto fees,
canonical IDs, event framing and scoped pauses refine this specification for
Sandbox development. It reuses payoff-math without changing financial equations.
No token conformance or independent review is implied. Storage-refund failure
restores storage funding (not collateral), while collateral-withdrawal failure
restores free collateral. Both use the same quarantine discipline.

### ORC-04 inverse-call expiry TWAP (candidate implemented; activation pending)

On 11 November 2026 the user selected Deribit's inverse-option settlement as the
reference for new series. Hedgeveil retains native NEAR collateral and its
existing complementary payoff: for a positive final reference S, N pays
C max(S-K,0)/S NEAR and P pays C min(1,K/S) NEAR, subject to the existing exact
coefficient/redemption rounding. P is not a vanilla put. There is no intermediate
futures position, margin borrowing or change to withdrawal custody.

The selected reference is a NEAR/USD time-weighted average over the 30 minutes
ending at immutable series expiry T, not three first-arriving reports. An expiry
at 08:00 UTC therefore observes the preceding 07:30–08:00 window; finalization
need not wait another 30 minutes. The series expiry schedule remains explicit;
Deribit's daily schedule is not automatically imposed on every test series.

This is a target policy, not an executable source profile. Before new-series
activation, freeze the source/feed identity and version, authentication method,
source-time semantics, sampling/interpolation and boundary rules, completeness
proof, confidence/staleness limits, integer integration/rounding and outage policy.
A simple arithmetic average of irregular observations is not this TWAP. A
caller-selected subset or a fresh post-expiry spot price cannot replace it.

Retain authenticated canonical evidence so later execution reproduces the same
reference. Finalize after evidence verification and chain finality, with no
arbitrary additional review delay specified by this target. Missing/ambiguous
evidence holds settlement; it never authorizes a fabricated price or refund.
Valuation must use the same averaging rule and account for its fixed portion,
native payout denomination and model assumptions. The existing terminal-price
model is not accepted as an aligned TWAP model.

MKT-04 candidate maker valuation (`ARITHMETIC_TWAP_NEAR_MOMENTS_V1`) prices
the native payoff `max(1-K/A,0)`, with P defined as its exact complement. Before
the 30-minute window begins it matches the first two moments of the arithmetic
average under a zero-carry NEAR numeraire GBM model to a lognormal distribution.
For years until window start `a`, window length `w`, and `v=sigma²`, its moments
are `E[A]=spot*exp(v*a)*expm1(v*w)/(v*w)` and
`E[A²]=spot²*exp(3*v*a)*(expm1(3*v*w)/3-expm1(v*w))/(v*w)²`.
The inverse-payoff expectation uses that fitted distribution, rather than
substituting the terminal spot price or dividing a USD Asian call by spot.
The model uses observed realized volatility, not implied volatility. Continuous
averaging and lognormal moment matching are explicit pricing approximations;
neither changes the exact last-trade-hold settlement calculation. Simulation and
formula checks are model evidence, not external price observations or review.

This initial candidate deliberately refuses new quotes once the averaging window
starts: authenticated partial history is not yet connected to maker valuation.
Quotes expire before that boundary. It must not silently assume that the already
observed part of the window equals current spot. Missing/stale inputs, unsupported
windows, or unresolved mature inventory keep the maker unavailable. A finalized
series uses the exact on-chain coefficient. Public activation and independent
economics review remain separate gates.

Existing native-sampled-v1 series retain their original rules. New-profile
activation requires source feasibility, schema/version isolation, rational/Rust
agreement, compiled-Wasm failure tests and actual testnet lifecycle evidence.
Independent oracle/contracts/economics/security review remains pending.
See [source assessment and venue comparison](../research/reports/EXPIRY_SETTLEMENT_COMPARISON.md).

#### ORC-04 candidate `COINBASE_NEAR_USD_TRADE_TWAP_V1`

This isolated implementation candidate fixes the source to Coinbase Exchange
`NEAR-USD` trades; it is not Deribit's multi-exchange index. For [T-1800s,T),
the reference process holds the latest trade price until the next trade.
Require consecutive trade IDs, nondecreasing exchange timestamps (microsecond
precision), a predecessor at or before the window start, and a successor at or
after its end. Ties are ordered by trade ID; the highest ID at a timestamp wins.
No caller may supply prices, URLs, product identifiers or alternate windows.
Allow at most 60 seconds since the effective price's exchange timestamp anywhere
in the window. Missing sequence/boundaries, excessive staleness, conflicting
data, pagination exhaustion or malformed data returns failure, never a price.

Integrate price (10^12 USD/NEAR integers) times microseconds using checked u128,
then divide once by 1,800,000,000 microseconds and floor. Preserve exact decimal
strings; prices must be positive and at most 10^6 USD. End is exclusive. Archive
HTTP bodies, cursor chain and hashes separately from the calculated result.
Bound retrieval to 64 pages of at most 1,000 trades and 1 MB per response.
Total raw response bodies may not exceed 2 MB per evidence bundle.
This gives bounded recovery, not an unlimited historical availability promise.
Exchange data remains an external trust dependency; sequence continuity checks
do not prove honesty of the exchange. An HTTP replay result is not authenticated
settlement evidence until the pinned Outlayer execution is verified.

The isolated resolver `native-trade-twap-v1` pins the published worker hash and
Outlayer account, accepts only its own request's private callback, and recomputes
the raw evidence before accepting a result. This does not remove trust in the
Outlayer operator or Coinbase HTTPS. Initial callback admission is narrower than
worker retrieval: at most three pages (3,000 trades) and 500,000 returned bytes,
to bound on-chain verification gas. A larger bundle is rejected and settlement
remains delayed; this profile is not yet approved for public trading. The caller
sponsors exactly 0.02 test NEAR per explicit request with no resolver refund
entitlement. Provider-issued unused-budget refunds name that caller as payer.
A protocol-level failed-call deposit refund instead returns to the resolver as
operating funds, never collateral; this distinction must be disclosed before
public use. No timeout clears a pending request or authorizes a resend/refund.
Known rejection permits a new explicitly funded request. A guardian can pause
requests/finalization but cannot choose a price. Accepted evidence is immutable;
finalization has no additional time delay. Core imports use its existing private
callback. A distinct event standard and deployment prevent old-series migration.

### ORC-03 native sampled resolver (testnet design accepted)

The user accepted this design for testnet on 10 November 2026. Source and
deployment acceptance remain outstanding; production remains disabled.

The `native-sampled-v1` adapter samples an external oracle's on-chain
reports during three equal consecutive slots of the immutable observation window.
The reference is explicitly **oracle ingestion-time samples**, not historical
venue trade timestamps. This is a new versioned source definition and must not be
substituted into existing series. It requires source/freshness/trust review before
release; implementing it alone does not satisfy that acceptance.

The registrar commits source account, reporter account, `wrap.near` asset, exact
units, time bounds and price bounds before mint cutoff. Testnet restricts the
native source to `price-oracle.testnet`; Sandbox permits a separate fault fixture.
Permissionless sampling calls that source's `get_asset` and accepts only a private
callback bound to series, slot and monotonic request ID. The selected reporter's
timestamp must fall in the same slot, precede the request and be at most 30 seconds
old at request time. Callback completion must be within 10 seconds of the request
and within the slot. One accepted sample per slot is immutable. Concurrent/retried
read requests invalidate old callbacks after five seconds; no funds move in them.

Final price is the floor of the arithmetic mean of the three exact 10^12-scaled
prices, available after maturity plus a fixed 60-second review delay. Missing,
malformed, duplicate, stale or late reports never fill a slot. A missing slot
leaves the series delayed; there is no fabricated backfill or operator price setter.
Anyone may finalize complete cases; the guardian may halt finalization globally
but cannot replace observations or a finalized result. This veto is a disclosed
liveness/authority risk, not independent bonded arbitration. Source upgrades and
off-chain source quality remain dependencies of the external provider. The verified
provider request allows cached market data up to 300 seconds. Fresh ingestion
does not prove fresh venue timestamps or three independent price observations.

The adapter holds no user collateral or bonds, exposes no payout method and
retains no publisher keys. A fixed nonrefundable 0.1 test-NEAR registration fee
funds bounded storage; require separate prefunding, actual storage coverage and
an operating reserve. Registrar/guardian authority and at most 16 series are
explicit. The existing synthetic bonded resolver remains test-only. The accepted
testnet design uses pause/delay handling instead of bonded arbitration. Historical
venue proofs and an independently reviewed dispute mechanism remain production
work. Source verification, operational sampling/refresh and public indexer
acceptance still gate the testnet release.

Every state-changing resolver transition emits a monotonically sequenced
`hedgeveil_external_oracle` event with its network, contract and canonical SHA-256
state commitment. The read-only indexer pins deployed code, replays contiguous
successful-receipt events and compares the last commitment with `get_snapshot`
at the same finalized block. Missing events, wrong domain or a changed snapshot
fail reconciliation. This verifies the contract's recorded state; it does not
independently establish upstream price correctness. Delayed/missing samples are
exposed as alerts, and a paused resolver remains visible in the snapshot.

The first native demo series is configured ten minutes before its sampling
window, with three three-minute slots. Its strike is taken from an archived real
market observation when terms are created; a restart never rewrites the terms.

The off-chain collector uses one retained refresh intent (0.02 test NEAR maximum
attached) and one sample intent per slot. It does not automatically retry a failed
or uncertain transaction. Before proceeding it recovers every prior attempted
operation, checks pinned chain/code and immutable terms, and uses a 15-second
source-age preflight limit, stricter than the contract's 30-second limit. Confirmed
refresh success without a fresh report remains a wait/delay condition, not sample
success. At most three refresh deposits (0.06 test NEAR total, plus gas) are possible
for one series under this collector. Contract-level permissionless sampling is
unchanged. An exclusive journal lock prevents concurrent collector processes;
an interrupted process leaves its lock for explicit inspection.

## G2 research profile

### MKT-03 market-derived maker profile v1

Public makers fetch Coinbase Exchange `NEAR-USD` ticker and hourly candles from
the fixed HTTPS endpoint themselves; caller-supplied marks cannot authorize a
public quote. This is a disclosed single-exchange pricing input, authenticated
to the maker by TLS, not a signed settlement oracle or independent liquidity.
No credentials or paid fallback. Reject unavailable/stale/future inputs, crossed
or excessive-spread books and missing/duplicate/malformed closed hourly candles.
Use the last 169 consecutive closed hourly closes (168 returns), ending at the
latest fully closed hour, for annualized sample standard deviation of log returns.
Do not invent volatility, interpolate gaps or include the current open candle.

Maker valuation uses the zero-rate, zero-carry Black–Scholes European call model:
N mark in native NEAR per claim = call_USD(spot, strike, time, realized_sigma)/spot;
P mark = 1 - N mark. Spot is the exact bid/ask midpoint. Zero rate/carry and using
realized rather than implied volatility are explicit model assumptions, not observed
facts. This is a terminal-price approximation to the settlement reference, not an
exact model of an averaged observation window. Oracle basis, jumps, execution
costs and calibration remain maker risks. It does not change contractual payouts.

Model calculations use bounded floating point; quantize N down to 10^-12 native
NEAR per claim, scale to ledger units and define P by exact complement. Signed
quote amounts, inventory, fees and transfers still use integer arithmetic. Existing
maker spreads and inventory/loss limits remain. The public testnet maker uses a
90-second signed quote lifetime to allow external-wallet review; local Sandbox
keeps 15 seconds. Both are bounded by maturity minus one nanosecond and the
contract's existing five-minute maximum. Source freshness is checked at issuance;
a longer lifetime exposes the project maker to price movement until expiry.
Every quote identifies the
source snapshot and model version; absent valid inputs means no quote and existing
quote cancellation is attempted through the existing receipt path. Snapshot files
preserve the raw public responses and their hashes for replay, not proof to a
settlement contract. The first release remains project-operated liquidity.

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

### Testnet deployment funding compatibility

The native transfer funding profile sends 48 test NEAR in one `Transfer` from
an explicitly approving owner wallet to a locally generated ED25519 implicit
account. The receiver is the 64-hex public-key bytes, checked against the retained
public plan. Four independent implicit accounts receive core 30, resolver 8 and
two maker allocations of 4.5 each; the administrator retains 1 before expenses.
No key is added to the owner account. This proposed layout replaces named
subaccounts because Meteor blocked the earlier `AddKey` request; its separate
wallet transfer requires explicit user review/signature. The old attempted
journal stays unresolved and held, never reset or automatically retried.
Funding and deployment require exact finalized transaction actions and complete
receipt trees. Local keys grant control only of the disclosed service accounts.
Payoff, source policy, custody accounting and the 48-NEAR total are unchanged.

### Bounded native testnet event discovery

The optional `watched-roots` indexer profile follows and validates the entire
finalized block ancestry but fetches complete receipt trees only for transaction
roots addressed to watched contracts (including explicit delegate targets).
This covers the native browser/collector/admin routes and all their descendant
callbacks. It does not infer success from a transaction header or filter outcomes
inside a selected tree. All existing sequence, conservation, snapshot-commitment
and same-block code/domain checks remain mandatory. An indirect call originating
in an unselected third-party contract can cause missing events; that must fail
reconciliation and block risk until its root receipt is supplied/indexed. This is
a disclosed discovery/liveness limit, never permission to skip state agreement.
The filter is part of the database binding and uses a separate schema from the
full-network history profile, which remains available. Public acceptance requires
actual reconciliation under the selected profile.

Maker valuation includes requested series and every series with nonzero maker
holdings. A zero-held expired unresolved series is excluded from that maker's
valuation set; held or requested unresolved matured positions still block
quoting. This prevents a fully merged historical demo series from disabling
unrelated live markets without assigning any invented mark to delayed claims.

An invalid or already-expired requested market declines only that RFQ. It does
not retire a maker from unrelated live markets. Existing signed quotes retain
their original expiry and nonce rules. Unresolved matured holdings, unavailable
market data and actual risk-limit failures still stop the maker's quoting; this
request-level rejection never clears a retained retirement or changes exposure.

### Journal-discovered native demo receipts

The optional `journal-roots` profile retains the complete parent-linked finalized
ancestry from the deployment anchor. Only transaction discovery changes: retained
wallet/service journals provide candidate hashes and signers, never success or
balance evidence. Every candidate is fetched as a complete FINAL RPC receipt
tree. Its root must be found in an ancestry-bound chunk, and every projected
outcome block must belong to that same finalized ancestry at or before the snapshot.
All contiguous event-sequence, custody, source-state commitment, code/domain and
same-block snapshot checks remain mandatory. A receipt newer than the snapshot
waits for the next checkpoint; it is never treated as absent success.

The profile has its own database binding. It is scoped to this local demo's
recorded wallet/admin/collector operations, not a general-purpose public account
indexer. An unrecorded external operation changing protocol state must fail
reconciliation until its real root hash is supplied. Missing/corrupt journals or
unavailable receipt evidence cannot authorize risk or any resend. Historical
full-network profiles and their evidence remain intact. This changes discovery
cost and its disclosed liveness coverage, not financial behavior or terms.


The optional testnet Neardata header transport supplies numeric-height prefetch
hints. Final head remains a chain/genesis-pinned RPC read. The deployment anchor
can reuse its retained original RPC response after providers prune that block;
its hash must match the immutable configured anchor, and restart verifies live
chain/genesis identity before opening the bound database. This never changes the
cursor, skips missing receipts or substitutes for current reconciliation;
every intervening parent link must match. Missing/null/wrong-height data cannot
skip an ancestor. Contract snapshots and complete FINAL receipt trees still come
from pinned RPC reads. No alternate price source or financial term is introduced.

### Canonical receipt checkpoint profile

Optional `discovery_source: neardata-testnet` augments this profile with the
FASTNEAR finalized full-block feed. A separate durable cursor begins at the
existing reconciled checkpoint (or deployment anchor for a new database), with
that baseline explicitly recorded. It does not retroactively claim full-history
coverage. Every subsequent produced block must extend the saved parent hash;
null heights are provisional skips checked by the next produced block. Watched
root transactions and non-system action receipts provide transaction/signer
hints, including indirect calls. System refund receipts do not identify original
signers and are covered by complete transaction trees instead. Hints and cursor
advance atomically; restart never starts at the latest head or discards hints.
All hints still pass FINAL-tree, canonical-block, root-inclusion and same-block
accounting verification. By default feed failure or lag beyond the existing
block limit disables new risk when enabled. The explicit additive mode
`discovery_required: false` retains the existing canonical-journal acceptance
policy: feed lag is reported separately and cannot bypass any receipt, sequence,
snapshot, staleness or custody check. It makes no continuous-discovery guarantee;
an outside operation absent from both sources still blocks reconciliation until
discovered. This mode allows evaluating the free feed without replacing the
existing discovery path or claiming managed-indexer cutover.
The HTTPS feed is trusted for discovery and
parent continuity, not cryptographically verified. Snapshot reconciliation and
receipt verification remain independently required. The data feed replaces
neither application storage nor the monetary reconciler.

`canonical-journal` is a separate local-demo indexer binding. Free public data
limits prevent reliable full-network header following. This profile verifies
only blocks needed by journal-discovered transactions: RPC-pinned final head,
each complete FINAL receipt tree, each outcome block's hash/height, and an
identity-pinned canonical RPC read at that height. Root chunk inclusion remains
mandatory. Every receipt block must be at/after the deployment anchor and no
later than the final snapshot head. A fresh final head is captured after receipt
verification; all snapshots use that exact hash, with the existing lag/staleness
gates. Height/hash conflicts, omitted event sequences, missing receipts and any
custody/source-state disagreement fail closed.

This stores a sparse set of canonical receipt/checkpoint blocks, not a complete
parent-linked chain. It trusts the configured HTTPS RPCs' canonical finalized
chain answers, as the existing RPC client does; it does not claim full-node or
cryptographic light-client verification. Provider identity/code pins, actual
receipts, contiguous contract sequences and exact financial reconciliation are
unchanged. The prior full-ancestry profiles and evidence are preserved. Journal
coverage limitations still apply: outside operations must be supplied and
verified before changed protocol state can reconcile. No price, balance,
transaction result, financial term or refund rule is synthesized or overridden.

Public testnet maker epoch cancellation is durably journaled before its sole
broadcast. Unresolved attempts block subsequent quotes and are recovered by hash
after restart; they never authorize a replacement cancellation. The indexer
discovers these journal hashes and verifies actual finalized receipts.

The sampled collector may authenticate the just-completed refresh receipt and
source code/report at its callback block using the existing public source-proof
verifier. It can then submit a sample immediately if that actual report is within
the same 15-second preflight allowance at the latest final head. This avoids a
redundant polling cycle; the resolver still reads the real source and enforces
its unchanged 30-second on-chain age bound and immutable sampling windows.
Invalid/unavailable proof never authorizes sampling or another paid refresh.

### Public source cache compatibility (10 November 2026)

The pinned native source's `request_price_data` reuses stored reports while they
are within its on-chain `recency_duration_sec` (observed 300 seconds). Its response
wrapper timestamp is current time even when the underlying report is cached.
Only `get_asset` report timestamps authorize sampling. The collector verifies
that the source cache policy remains 300 seconds and waits until the stored report
expires before spending its one refresh allowance for a slot. A cached response
never becomes a new observation by changing the wrapper timestamp.

New public demo series use three 360-second slots (an 18-minute observation
window), allowing the 300-second source cache to expire between fresh reports.
This is a new immutable series configuration, not a change to already registered
alpha/beta/gamma/delta terms. The three-report arithmetic mean, 15-second collector
preflight, 30-second contract freshness, callback bound and 60-second review delay
remain unchanged. A missed sample still delays settlement; no historical backfill.

### Maker observation clock alignment

A real ticker received during an HTTP request is checked against the completion
clock, with the same 60-second maximum age and no future timestamp. Closed candle
hour checks remain unchanged. Before valuation, the maker retains that exact
observation and waits at most 4.5 seconds (ten finalized-head reads, 500 ms apart)
for finalized chain time to reach its timestamp. Failure yields no quote. No
timestamp is rewritten, price interpolated or freshness bound widened.


### MKT-05 rolling listing target (13 November 2026; initial cohort deployed)

The user-selected target is two distinct expiries: next daily and next Friday,
both 08:00 UTC, with 90/95/100/105/110% strikes from one fresh source snapshot per
expiry cohort. Coincident daily/Friday dates use the following Friday for weekly.
The read-only planner uses at least one hour of lead, preserves each expiry's
initial seed and never modifies existing series. This is a planned provisioning
policy, not authorization to reuse old oracle terms or bypass capacity/data gates.

Activation requires scalable versioned series/position storage (legacy core has
8 lifetime slots), storage pricing and coexistence tests, aligned TWAP maker pricing,
accepted oracle/runtime integration, actual funded inventory and receipt-journal
recovery. Unknown writes cannot be resent; unavailable inputs may leave no open
markets. Startup/periodic/event reconciliation must be idempotent. No automatic
listing transaction or new series is implemented by the read-only planner.
The separate layout-2 provisioner below has now deployed the first ten funded
markets with confirmed receipts; periodic renewal remains pending acceptance.

Public model marks are display estimates only, never executable RFQs. The existing
legacy terminal model remains limited to its disclosed old-profile approximation;
new TWAP marks refuse that model. Finalized historical rows use actual coefficients.
No change to payoff, custody, settlement or withdrawal semantics is introduced.


### MKT-05 core layout 2 — reusable market slots (13 November 2026)

This is a separate-deployment layout, never an in-place upgrade of layout 1.
The hot ledger retains at most 32 series and 16 accounts. Each account reserves
32 position slots within its separately paid 4,096-byte storage allowance. This
supports ten current markets and retained earlier cohorts without unbounded
per-transaction account/series scans. Capacity exhaustion remains a real gate;
no position may be evicted to keep ten markets visible.

Permissionless `archive_series` may retire only a CLOSED series after maturity,
with no outstanding P/N, no reserve and no pending resolution callback. Closure
still requires finalization, burning all claims and releasing dust. A delayed
series with claims cannot be archived. The finalized series record is preserved
in append-only on-chain storage, addressable by immutable series ID and paginated
archive index. IDs can never be reused. Only its now-empty physical position slot
can be reused, and account slots must be verified zero before reuse. Vault/roll
instances block retirement in this layout; the public options-only profile has
neither enabled. No collateral or storage refund is created by archival.

Every creation pays the existing separate series-storage allowance and fee,
including replacement cohorts. The allowance is retained to fund its historical
record permanently; archive storage is flushed and included in coverage checks.
The event state commitment includes a chained digest of archived records. Existing
ledger delta semantics and protocol version 1 remain unchanged, with an added
`SERIES_ARCHIVED` event. `storage_quote` identifies layout 2 and reports hot and
archived counts. `list_series` paginates retained series (limit 16); clients must
read all pages at one finalized block. `list_archived_series` paginates immutable
zero-balance records; `get_series` and `series_state` resolve both sets. Archive
records are not position-slot mappings for a current account snapshot.

Old deployment configuration, receipts, accounts, holdings and exits remain
available separately. No balances or signing authority are copied to a new
deployment. New funding, oracle binding and activation require their own receipts.
Independent review and public deployment acceptance remain pending.

Layout-2 payout and resolution callbacks reserve 120 Tgas because their invariant
and event checks cover up to 16 accounts and 32 retained markets. Client calls
remain bounded at 250 Tgas. Event deltas retain the same sorted order and exact
amounts; merging the two already sorted ledger snapshots avoids building a third
full map. Full-capacity receipt checks must establish headroom before deployment.
A callback failure still leaves the original ticket quarantined; gas exhaustion
never authorizes a second transfer or a refund.

### ORC-04 resolver layout 2 — retained cases and immutable history

The separate layout-2 TWAP resolver uses 32 retained cases, matching the new
core's hot-market capacity. A finalized case with no pending request can be
archived permissionlessly for one yoctoNEAR. Its terms, accepted evidence hashes
and final price remain immutable and available through `get_case` and
`get_resolution`; archiving never changes payout selection or authorizes a retry.
Non-finalized cases cannot be archived. A pending or delayed case therefore
continues to consume capacity, rather than silently abandoning obligations.

Each registration still pays the exact nonrefundable 0.1 NEAR storage fee.
Archives are append-only, their IDs can never be registered again, and their
count and chained commitment are part of each event's snapshot hash. Storage
collections are flushed before checking byte coverage and the separate operating
reserve. Historical case pages are capped at 16. The storage layout is not an
upgrade path for existing funded resolvers.

The canonical indexer reads the retained snapshot at a finalized block. For any
retained core market whose finalized oracle case has been archived, it also
reads `get_case` at that same block and validates the exact immutable core terms,
final price, accepted price and source binding. These supplemental cases remain
separate from the event-hashed hot snapshot. Missing or inconsistent historical
cases fail reconciliation; archiving cannot erase a still-held claim's resolution.

The expiry keeper uses a durable, deployment-bound journal and a cross-process
lock. It permits at most one automatic 0.02 NEAR historical request per series,
followed by receipt-confirmed finalization and core import. Before any due-series action the coordinator checks the chain, all three code
hashes, exact terms, source and policy at one finalized block. Local wall time
only suppresses unnecessary polling before expiry; it never authorizes a request. UNKNOWN or failed operations halt progression. A rejected historical
result requires explicit operator review; elapsed time cannot fund a retry.
An optional operator-reviewed delivery-retry policy may authorize at most two
additional requests (three total, at most 0.06 test NEAR compute deposits plus
gas, with no refund assumed). Default behavior remains one request. Each retry
has a distinct stable journal label and requires FINAL, complete prior request
receipts, source yield-timeout evidence, and a reviewed FINAL worker submission
that reported successful computation but failed at the source with `Execution
request not found`. The source request ID, worker hash, expiry and transaction
bindings must match. This diagnostic is eligibility to request again, never
settlement authentication. A fresh same-block REJECTED resolver case must have
no pending, accepted or final result. Backoff uses chain time after the rejection
receipt; a short explicit authorization deadline limits the experiment. Unknown
outcomes, absent review, invalid evidence, policy expiry and exhausted budgets
stop the scheduler. Retry records survive restart and policy edits cannot reset
the stable three-attempt cap. No single-pending contract constraint is changed.
Actual receipt trees (including source response bytes) remain in the journal.
Keeper completion requires the core and resolver to expose the same final price.

### MKT-05 separate deployment budget and provisioning

The layout-2 setup uses a new core, resolver and two maker accounts. A single
32 test NEAR owner transfer funds a fresh service administrator, which then
funds the new core with 21 NEAR, resolver with 6 NEAR and each maker with 1.5 NEAR.
The core's 20 NEAR operating reserve and code/state storage are separate from
collateral. The resolver's 1 NEAR operating reserve and code/state storage are
also separate. These account budgets are not deposits into the trading ledger.
The administrator retains 2 NEAR for registration fees, source requests and gas;
none is taken from old core reserves or user claims. The owner retains at least
1 NEAR. No access key is added to the owner's wallet.

Each new maker deposits 1.1 NEAR collateral, splits 0.1 NEAR per initial market
across ten markets, and retains 0.1 NEAR free collateral. Its remaining native
balance pays account/key storage and gas. Inventory is limited; listing does not
promise liquidity. This budget covers the initial cohort, not indefinite service.
Old service keys for old contracts and makers are not copied to the new workspace;
the administrator signer is also new. Old claims and exits remain on
their original deployment. Historical UNKNOWN operations stay quarantined in
their original workspace; the new deployment cannot resend or replace them.

Provisioning persists the first fresh Coinbase observation per expiry and exact
terms before registration. Every funding, deployment, registration and inventory
operation has an immutable journal identity and must resolve before progression.
Restarts recover receipts and cannot repeat deposits, reprice issued cohorts or
resend UNKNOWN operations. The keeper and provisioner share an exclusive lock.
Fresh source, code pins, funds and capacity remain prerequisites. Periodic renewal
and recycling require their own acceptance; the initial deployment test does not
establish them.

### Trading display clarification — 13 November 2026

Display-only spot-derived values require observed and fetched ages of at most
30 seconds; missing data must not become zero or an executable quote. Hypothetical
reference-price scenarios remain labelled illustrations. Server-clock countdowns
are early UI gates; chain validation and finalized receipts are authoritative.
Expiry alone does not lock payout: only the clearinghouse's finalized coefficient
fixes the NEAR amount. Current USD conversion can continue changing afterward.
NEAR-cost breakeven and entry-USD-cost breakeven are different bases and must be
labelled; fees are included in quoted cost, gas excluded. Intrinsic payoff slope
is not model delta. Historical native-sampled series retain their own immutable
windows; this UI change introduces no settlement-profile migration.

On 13 November 2026 the user approved canonical receipt/journal discovery with
strict same-block reconciliation for the separate layout-2 demo. FASTNEAR remains
an additive audit (`discovery_required: false`) because its observed free quota
is 30 blocks/minute. This does not claim continuous full-network discovery.
Missing outside receipts, event gaps, custody/state disagreement, stale canonical
snapshots and UNKNOWN payouts retain their existing gates and quarantine rules.

### APP-02 first-deposit transaction composition (13 November 2026)

A `deposit_collateral` review intent may include an optional positive
`storage_deposit` amount. `attached_deposit` is the total wallet debit; trading
collateral is total minus storage, which must be positive. This is an SDK
composition, not a new contract entry point or payoff change. It expands only
to two ordered FunctionCall actions on the same core: `storage_deposit({})`
with 50 Tgas, then `deposit_collateral({})` with 200 Tgas. Both attached amounts
and the 250 Tgas total are bound to one durable operation and one wallet signature.
No generic arbitrary batching is allowed. Without the optional field, existing
single-action intents remain byte-for-byte compatible.

Preview requires an unregistered account, exact current storage minimum, fresh
reconciliation, deposits enabled, and sufficient wallet funds for the total plus
gas/storage. If registration appears before handoff, the old review is blocked
and a new plain deposit must be reviewed. The atomic action receipt must contain
both successful, ordered ledger events with the exact actor and storage/free
credits before success is reported. Failure of either action rolls back both
state changes; gas is still charged. Missing receipts or a lost wallet response
remain unresolved and cannot trigger automatic resend.

### Backend renewal and ten-user acceptance (13 November 2026)

The layout-2 release target is ten distinct retail accounts plus the administrator
and two makers (13 of 16 account slots). Capacity is bounded; overflow rejects
without reallocating another user's state. Ten concurrent sessions require actual
load evidence, not just the account constant.

The service reconciles the listing policy on startup, every 60 seconds and after
settlement. It shares the settlement ownership lock and pauses/drains maker quote
queues before maintenance; wallet transactions remain independently authorized.
Only project-maker matched pairs may be merged after their trading window closes;
finalized maker claims may be redeemed. User balances are never harvested.
Archival requires the existing zero-claims/zero-reserve/finalization predicates.
Fresh observed prices seed new dates once. The complete renewal plan is durable
before its first write; recovery completes that exact plan before planning again.
Every write has a deterministic journal identity and is broadcast at most once.
Unresolved receipts halt renewal, without timeout-based resend permission.
For a service-owned ordinary V0 key only, an operator may record
`EXPIRED_NOT_INCLUDED` after reconstructing the exact unsigned transaction hash,
checking canonical reference/finalized blocks with two distinct RPC providers,
passing the chain's block-height validity horizon, and observing a finalized
access-key nonce below that transaction's nonce on both providers. The transaction
nonce must also be below the key-recreation nonce floor at its reference height,
so deleting/readding the key cannot hide earlier execution. This is retained
chain-state evidence under the RPC trust model, not a receipt or light-client
proof. Missing, inconsistent or consumed-nonce evidence leaves UNKNOWN unchanged.
This classification never authorizes resending the original operation, credits
funds, or applies to user-wallet withdrawals. A replacement settlement request
has a new intent bound to the classified predecessor and still requires finalized
resolver state NOT_REQUESTED with no pending/accepted/final value. Independent
review of this recovery path remains pending.
An isolated maker cleanup may still merge fully matched, expired project-maker
pairs when the only unresolved administrator action is a resolver `request`.
It uses the same ownership lock and drained maker queues, checks both admin and
maker cancellation journals, and blocks any maker with unresolved writes. It
cannot request settlement, redeem, archive, list, or spend administrator funds.
The exact cleanup batch is retained before submission and each merge is broadcast
at most once. Partial/unmatched claims remain valued conservatively and may still
block quotes. This exception does not resolve or retry the administrator request.

Listing preflight retains native storage plus a 0.1 NEAR gas buffer per service
signer, and 0.02 NEAR request sponsorship per unresolved resolver case. A renewal
may spend only available service-wallet funds and free maker ledger collateral;
core/resolver operating reserves and user funds are never funding sources.
Insufficient funds/capacity produces a blocked renewal status, not partial fake
liquidity. Quotes remain subject to fresh inputs, inventory and actual execution.

A separately labelled acceptance series may use a nearer fixed expiry with the
same complete 30-minute future observation window, source and payout rules. It is
not a ladder cohort and does not change the daily/Friday 08:00 UTC schedule or any
existing terms. This lets real source/callback/import/redemption acceptance execute
without pretending a historical/fixture window was a newly traded market.

### Bounded read sharing (13 November 2026)

Successful immutable maker/display read snapshots may be shared for two seconds
from completion. In-flight identical loads coalesce; failures are never retained
as usable data, and maintenance/reset invalidates the cache generation. Snapshot
reuse does not extend quote expiry, change source freshness, or reserve inventory.
Public maker source observations must also be no older than 60 seconds at wall
clock evaluation. Wallet preview and handoff do not use the display cache and
obtain fresh verified state. Read-only provider fallback validates chain identity
and view-block binding; signed broadcasts are never retried through fallback.
An on-chain zero retained-ticket count permits skipping an empty list query;
positive/missing counts still require the list and consistency checks.

### Receipt delivery telemetry and retry presentation

Delivery timing is an observational field, not a settlement rule or authority.
Retain source-request and resolver-callback nanosecond timestamps as decimal
strings, complete FINAL receipt identity, request ID, series and classified
outcome. Executor pickup time remains null unless independently evidenced; a
provider job creation timestamp is not a pickup timestamp. Keep timeout,
provider-reported `STALE_TRADE`, accepted and other rejected outcomes separate.
No percentile or SLA follows from a small mixed-window sample.

The keeper may load explicitly reviewed per-series testnet retry policies from
private `delivery-retry-policies.json`. Existing hard limits and evidence gates
still apply: one pending request, 2–3 total attempts when authorized, 30–600s
backoff, at most 15 minutes of authorization, separate review of each timed-out
predecessor and its late valid computation. No policy means no automatic retry.
A cap, expired authorization, missing review or UNKNOWN receipt never grants a
new send or refund. A backoff beyond authorization has no scheduled attempt.

Public state exposes a restricted diagnostic projection. Attempt counts describe
journaled submissions (excluding certified never-included requests), not fills.
Only a fresh keeper backoff observation may show the next eligible attempt time;
observations older than 90 seconds hide the countdown. This is not a completion
ETA. Chain finality still determines whether a payout is fixed. Cap-hit cases
remain delayed; users holding both matching legs retain the contract's merge
path, without requiring an oracle result.

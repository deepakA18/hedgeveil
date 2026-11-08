# VLT-02 experimental one-shot roll

Dependencies: VLT-01, MKT-01/02 and FIN-02 experiment. Economic selection and
independent review remain pending. Reviewers: quant/contracts/security. Invariant:
keeper calls can only exchange the entire configured old-P holding for configured
new-P through a funded signature within immutable limits; share supply/ownership
and custody remain conserved. No keeper withdrawal, arbitrary transfer or policy
replacement exists. Failure preserves assets and leaves in-kind exits available.

This Sandbox-only `roll-demo-v1` mechanism is an opt-in before the first deposit,
not an approval of a rolling strategy. The guardian configures it once while the
vault is unseeded, prepaying another 4096 storage bytes plus one yocto. Existing
funded or closed vaults cannot acquire/change a policy. The separate storage is
permanent, never collateral. Policy fixes keeper, distinct reference publisher,
fee receiver, old/new series, schedule, new-maturity bounds, reference freshness,
quote validity horizon, maximum notional/cash input/fee/marked loss, total fee/loss
budgets and a minimum new-P quantity. One successful full-old-P roll exhausts it.

Allowed trades have one maker-gives leg (new P), one old-P taker-gives leg equal
to the vault's entire old-P holding, and optionally a positive native cash input.
Both series share the same index definition; new maturity is later. Policy timing
ends no later than old maturity. Holdings after execution may cover at most four
series. Existing unrelated seed assets are retained. There is no P-to-N switch,
partial old-P allocation, arbitrary routing, external native transfer or share
trade. Fees go only to the policy's fixed registered receiver. All debits happen
before credits, in the same receipt, using G5's maker keys/nonce/epoch checks.

The maker signs the existing G5 payload, with non-null taker equal to this core
account. The single vault is that core's only managed RFQ taker. The contract
validates the signature for this account instead of the keeper caller. Ordinary
user fills retain predecessor authorization and cannot debit managed holdings.

The configured publisher supplies a monotonically increasing sequence/timestamp
and positive old/new P marks in native collateral per claim, scaled by Q. Marks
must be <= Q and observed no later than current block time, within policy age.
Publishers are authenticated NEAR accounts; all local references are labelled
`SYNTHETIC CURRENT REFERENCE`. This is separate from historical settlement and
does not authenticate market truth or provide production source independence.
The keeper cannot publish its own reference; test roles may share an operator.

Execution requires the exact latest sequence and a fresh reference. Quote expiry
must be future and no later than reference timestamp plus the policy's validity
horizon. G5 has no signed creation timestamp: this bounds validity against fresh
reference data, not independently proven quote issue age. Incoming reference
value rounds down; outgoing old-P value rounds up. Input value includes cash and
fee. Both input/output values must fit the notional cap. Positive marked loss
must fit the per-roll basis-point cap and remaining absolute loss budget; fees
must fit per-fill and total budgets. These are reference-valued native amounts,
not realized USD returns, NAV or a fairness guarantee.

Missing quotes, stale/missing references, wrong reference sequence, timing,
shape/maturity, budget, inventory or four-series failures return a recorded
`ROLL_DEFERRED` reason without changing holdings or consuming a maker nonce.
Signature/domain/key verification failures and unauthorized callers revert;
earlier guard checks may defer before signature verification. Deferral
is latched: publishing another reference cannot alone reopen inflows; a successful
eligible roll clears it. Initial reference publication can activate an unseeded
policy. Mints additionally require current reference freshness and an unexpired
roll deadline until execution; after execution they use the current basket and
its maturities, never obsolete seed holdings. Guardian mint pauses remain in force.

An explicit null quote records no liquidity; it is not simulated execution. The
local keeper planner compares supplied signed candidates by native reference value
net of cash/fee and submits one proposal through its own account. The contract,
not that planner, authorizes every debit. There is no unattended production
daemon, authenticated external feed or economically selected multi-roll policy.
The risk view discloses the experimental profile, deferral, exhaustion and absent
NAV. Fresh state is required; no upgrade/migration path is supplied.

Hard local bounds: reference age positive and <=60 seconds, validity horizon
positive and <=30 seconds,
notional <=10 NEAR, cash input <=1 NEAR, fee <=0.01 NEAR, total fees <=0.1 NEAR,
marked loss <=1000 bps and total marked loss <=1 NEAR. Minimum new quantity is
positive and <=100 Q. New remaining maturity is positive and <=365 days. These
are arithmetic/demo limits, not selected economic capacity or safe parameters.
The test policy uses tighter bounds; see its [evidence](../research/reports/G6_KEEPER.md).

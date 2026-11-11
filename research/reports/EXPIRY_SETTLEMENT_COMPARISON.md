# Expiry settlement comparison — 11 November 2026

Status: documentation research and accepted direction for new series; no new
resolver, source integration or valuation implementation is claimed. Existing
series, including eta, retain their original terms. Independent review pending.

## Venue comparison

Let S be the venue's settlement reference, K the strike and q the underlying
quantity after applying any contract multiplier. Payoffs below are gross of
premium, fees and funding; payoff is not trading profit.

| Venue / product | Reference and payout | Relevance |
|---|---|---|
| Derive European options | A 30-minute underlying-price TWAP; marked in USD and settled in the universe's cash asset (USDC for launch universes). | Fixed expiry and a defined settlement index are compatible with averaging. [Current supported products](https://docs.derive.xyz/supported-products). |
| Deribit inverse options | 30-minute index TWAP ending at 08:00 UTC. Call: q max(S−K,0)/S; put: q max(K−S,0)/S, in BTC or ETH respectively. Since 1 August 2026, ITM options settle through same-expiry inverse futures, which immediately cash settle; net payoff is unchanged. | Closest mathematical comparison to Hedgeveil's N claim, without adopting its futures plumbing or margin model. [Inverse options](https://support.deribit.com/hc/en-us/articles/31424939096093-Inverse-Options). |
| Paradex dated options | 30-minute Spot Oracle TWAP ending at expiry. USDC cash payoff per unit: call max(S−K,0), put max(K−S,0). Its docs describe delta decaying as the averaging window fixes more of the settlement price. | A dated product, distinct from perpetuals. Pricing must recognize the already-fixed part of an index. [Dated options](https://docs.paradex.trade/trading/dated-options/overview). |
| Panoptic | Perpetual positions constructed from Uniswap liquidity; no scheduled terminal-price settlement. Premium accrues with AMM activity (streamia), with position closure, liquidation and forced-exercise rules. | A different product architecture, not a replacement expiry resolver. [Overview](https://panoptic.xyz/docs/panoptic-protocol/overview), [fee accounting](https://panoptic.xyz/docs/panoptic-protocol/streamia). |

The common lesson is not “remove averaging.” It is to define an unambiguous
expiry reference before trading. A window ending at expiry is not a requirement
to wait that window again after expiry. Evidence publication and execution can
still take time. A single instant observation also requires timestamp, ordering
and missing-data rules; a caller-chosen latest report is insufficient.

## Hedgeveil interpretation

The existing SPEC pays, for S > 0:

- N: q max(S−K,0)/S NEAR — the inverse-call payoff shape.
- P: q min(1,K/S) NEAR — the complementary covered-call residual, **not a put**.
- A matched pair returns q NEAR before the specified integer rounding/dust rules.

This comparison is algebraic, not a claim that Hedgeveil has the same source,
custody, liquidity or risk controls as Deribit. USD values computed using S are
reference values; actual NEAR/USD value at later redemption may differ.

The current three-slot resolver accepts fresh source-ingestion reports, with
first accepted observations fixed per slot. This does not prove a canonical
venue-time expiry index or three independent observations. The current maker's
terminal-price model does not model that sample path. See
`services/maker/valuation.mjs` and the native-sampled-v1 section of `docs/SPEC.md`.

## Accepted direction and remaining decisions

For new series, bind expiry, source identity/version, units and deterministic
observation/index selection before claims exist. Retain authenticated evidence
so delayed execution cannot substitute a later price. Finalization must check
the evidence and blockchain finality. The maker must model that same payoff and
reference, including known index observations if averaging is selected.

Follow-up decision: the user selected the Deribit reference design. The target
is now a 30-minute NEAR/USD TWAP ending at each series' immutable expiry, retaining
native collateral and existing P/N payoff. This adopts a settlement convention,
not Deribit's exchange infrastructure, BTC/ETH index or reliability guarantees.
The intermediate futures step is unnecessary for Hedgeveil's direct redemption.

The exact source, index construction, boundary/tie rules, completeness proof,
timestamp semantics, permitted lateness and outage handling remain undecided.
An authenticated report alone proves authenticity, not that no earlier eligible
report was skipped. A provider-defined canonical expiry report or verifiable
ordered history must address that selection problem. A public venue REST price
is not automatically authenticated evidence usable by a NEAR contract.

Source feasibility check (11 November): the inspected Outlayer path records
ingestion time and does not expose historical-window requests (see
[prior source inspection](OUTLAYER_FEASIBILITY.md)). The NEAR oracle directory
still lists Pyth, but [Pyth's own NEAR documentation](https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/near)
says Core support ended on 26 August 2026 and maintained NEAR contracts/guides
were removed. Therefore a supported, free Pyth-on-NEAR expiry/TWAP integration
cannot be assumed from the directory. No new source has passed acceptance.

Recommended implementation sequence:

1. Prove a free source can supply the required NEAR/USD expiry evidence, including
   recovery after collector downtime; then freeze the new SPEC/profile.
2. Implement versioned verification/archive/import with no synthetic fallback,
   no discretionary price substitution and no edits to old series.
3. Align maker valuation and disclosure. Model uncertainty and realized-volatility
   estimation remain even when contract and pricing reference agree.
4. Test boundaries, skipped/reordered/duplicate reports, replay, outages, delayed
   execution, exact payout conservation and actual testnet redemption/withdrawal.

Dependencies: FIN-01, ORC-03, MKT-03, CORE-03, INF-01 and APP-01/02.
Invariant: identical immutable terms and authenticated evidence yield identical
payoffs regardless of caller or execution delay. Failure path: unavailable or
ambiguous evidence delays settlement and blocks unsupported new series; no
invented price or automatic refund. Evidence: primary documentation above and
current repository inspection only; implementation and public acceptance pending.
Reviewer: independent oracle/contracts/economics/security review pending.

# Confidential collateral conservation: initial inductive model

This is a specification argument, not a mechanized proof or cryptographic audit.

Let B be custody available for claims (excluding storage and external fees), F
the sum of hidden free-collateral obligations, T unpaid withdrawal obligations,
and L_s the remaining liability of each series under an assignment of its final
coefficient. Require B >= F + T + sum(L_s) for every consistent assignment.
Shared-vault liabilities must count its underlying assets once, not add shares
as a second external claim on the same backing. That extension is pending G6.

| Transition | Inductive argument |
|---|---|
| Deposit c | B increases c; F increases at most c |
| Pair split c | F falls c; eventual P+N liability rises at most c |
| Transfer / funded trade | Per-asset quantities conserved, including explicit fees |
| Pair merge c | Matching P/N removed; F increases c; pre-finalization only |
| Finalized redemption | Claim liability removed; F increases by its rounded payout |
| Withdrawal reservation c | F falls c; T increases c, with one consumed nullifier |
| Confirmed payout success c | B and T fall c once |
| Confirmed failure recovery c | No successful custody outflow; T falls c, F rises c once |
| Unknown receipt outcome | No resend/refund; retain unresolved obligation in in-flight ledger |

For an actual asynchronous implementation, refine B/T with funds in flight and
the authenticated receipt outcome. A timeout is not a transition to failure.
This model does not yet prove asynchronous refinement, shared-vault conversions,
order predicates, arbitrary interleavings or circuit enforcement.

Assumptions: correct initial state, authenticated deposits/receipts, sound proof
system, bounded integers, nonforgeable ownership, collision-resistant domains,
consistent coefficient per series, atomic nullifier/output updates and no other
mint/custody path. Sound accounting does not imply truthful market observations,
liquidity, key recovery, confidentiality, or safe verifier setup.


# ADR 0001: arithmetic first

Status: arithmetic decisions retained; privacy/proof gating superseded by
[ADR 0002](0002-open-innovation-public-ledger.md), 7 November 2026. The original
text is preserved in the historical archive.

Keep exact native-NEAR/USD payoffs, u128 external amounts/prices, coefficient
scale 10^24, price scale 10^12, checked U256 intermediates and independent Python
Fraction arithmetic. Keep primitive-types 0.13.1 and the validated Rust toolchain
for this library. No floating point token amounts.

Version shared schemas before contracts/SDKs. The new v0.2 schema describes public
accounting and operations; it is not a proof transcript. Runtime/token/oracle and
payout-recovery compatibility now govern G1. Library arithmetic tests alone do
not approve the new contracts, standards compliance or economic strategy.

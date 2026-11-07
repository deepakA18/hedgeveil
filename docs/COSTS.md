# Cost boundary

Current arithmetic/schema checks run locally without `.env` or paid services.
Future core demo uses local database/services, synthetic data, Sandbox and
faucet-funded testnet assets. No inference provider or paid oracle is required.
Free hosted services are conveniences; local reproduction must remain possible.

| Category | Demo accounting | Production obligation, separately gated |
|---|---|---|
| Execution/storage | Measure actual test gas/storage and separate funding | Real gas/storage funding; query current chain parameters |
| Maker inventory | Publish test capital, P/L, subsidies and withdrawals | Capital at risk, hedging/loss budget and stressed depth |
| Oracle | Committed synthetic data, test signers and test bonds | Independent data/history, retention, bonds, monitoring/adjudication |
| Services | Local DB, RPC/Sandbox, makers, keeper, indexer; optional hosting | RPC/archive capacity, hosting, availability/on-call |
| Security/recovery | Local fault suites and documented review scope | Independent review, incident response, recovery operations, bounties |

G1 records local fixture costs in [its report](../research/reports/G1_PUBLIC_LEDGER.md).
G3 records actual bounded-core gas/storage in [its report](../research/reports/G3_COLLATERAL_CORE.md),
including separate user storage, series storage, creation/authorization fees and
operating allocation. These are local measurements, not a production budget. Historical verifier costs do
not estimate the new clearinghouse either. DEM-01 must
publish measured lifecycle costs and subsidy sources. Storage/operations never
silently consume promised collateral. Fixed fees must be explicit; defer
performance fees until independent valuation/high-water-mark review. User-paid
keeper/oracle costs need disclosed hard maxima before implementation.

G4's [oracle report](../research/reports/G4_SETTLEMENT.md) measures local receipt
gas and storage. The oracle retains prepaid account/series storage separately
from refundable/slashable proposal bonds and withdrawable credits. A separate
20-NEAR bootstrap allocation covers code/operations. Its fixed 0.1-NEAR demo
bonds are test parameters, not an economic-security budget for production TVL.

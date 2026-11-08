# Cost boundary

Current arithmetic/schema checks run locally without `.env` or paid services.
The local demo now uses a database/services, synthetic data and Sandbox.
Faucet-funded testnet lifecycle measurements remain pending. No inference provider or paid oracle is required.
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

G5's [market report](../research/reports/G5_FUNDED_MARKET.md) records 5.823–8.664
Tgas for successful exact fills and 6.247 Tgas for pair matching in this local run.
Each lifetime maker registry prepays 4096 bytes (0.04096 NEAR at the measured node
storage price), separately from refundable user registration and collateral.
All key/epoch/cancel/fill calls also pay one yocto; the first key adds the registry
storage payment. Signed trade fees are capped at 0.01 NEAR and paid from the
taker's existing free balance to the signed receiver. The local bots charge five
basis points. Each maker received 80 NEAR collateral plus separate storage/gas
wallet funding from Sandbox genesis; all volume is subsidized test activity.
Reported marked P/L excludes operating/storage costs and is not economic profit.

G6's [basket report](../research/reports/G6_BASKET.md) retains actual gas per
receipt for bounded nine-asset issuance/exit and 16-holder storage coverage.
Vault creation prepays another 4096 bytes (0.04096 NEAR at the local queried price)
plus one yocto. This permanently allocated storage never becomes collateral or
last-holder proceeds. Share holders use existing account registration; ordinary
operations pay one yocto from their wallet. No management/performance fees accrue
inside the basket. Its share cap is a local arithmetic limit, not a liquidity budget.

The optional VLT-02 profile prepays another 4096 bytes / 0.04096 NEAR at the local
price, bringing permanent vault-plus-policy storage to 0.08192 NEAR. Reference
publishers and keepers fund their own one-yocto calls. The successful local roll
used 6.731 Tgas and debited a signed 0.00037425-NEAR fee from vault cash within
immutable limits; its 0.003368261976047904191618-NEAR reference-valued loss is a
synthetic mark calculation, not realized USD performance. See
[keeper cost evidence](../research/reports/G6_KEEPER.md). No production budget follows.

DEM-01 [retained-demo evidence](../research/reports/G7_DEMO_RESUME.md) records
attached amounts, total receipt gas burned and tokens burned for four actual local
actions: storage registration, collateral deposit, split and merge after restart.
The machine report keeps their finalized receipts. These samples are neither a
full operating budget nor testnet measurements. Existing Sandbox genesis funding
still subsidizes wallets, maker capital, storage and gas; resuming adds no seed
funding and does not turn that subsidy into trading revenue.

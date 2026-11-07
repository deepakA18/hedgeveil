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

No current-runtime gas/storage benchmark or production budget is available.
Historical verifier costs do not estimate the new clearinghouse. DEM-01 must
publish measured lifecycle costs and subsidy sources. Storage/operations never
silently consume promised collateral. Fixed fees must be explicit; defer
performance fees until independent valuation/high-water-mark review. User-paid
keeper/oracle costs need disclosed hard maxima before implementation.

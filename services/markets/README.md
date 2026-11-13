# Rolling listing policy and initial deployment

13 November update: the separate layout-2 deployment now has ten real funded
markets and verified signed offers from both makers. The provisioner is
`services/testnet/expiry-deploy.mjs`; [public setup evidence](../../research/reports/mkt05-testnet-setup.json)
retains all 54 successful operations. Periodic renewal and inventory recycling
are still pending. This does not complete the new settlement or wallet lifecycle.

User-selected 13 November 2026: next daily expiry and next Friday expiry at
08:00 UTC; five strikes at 90/95/100/105/110% of fresh observed spot. If daily
and weekly coincide, use the following Friday for weekly. A one-hour minimum
lead retains the complete pre-expiry 30-minute window and setup time.

`ladder.mjs` produces a read-only proposal. It has no signer and always returns
`actions: []`. Seeds are retained per expiry; changing spot must never rewrite
an existing market. The provisioner durably persists these seeds before
registration, reconciles existing terms and uses the receipt journal to resume.
A settlement event is a reconciliation
trigger, not permission to issue another duplicate cohort. Startup and periodic
reconciliation are also required so missed events cannot leave a gap.

The historical core has **8 lifetime series slots**
and fixed `[Position; 8]` account serialization. Raising the constant on a funded
instance is not a state migration. Ten simultaneous markets, and subsequent
cohorts, require a new version with scalable market/position storage, explicit
storage pricing, pagination and account/exit migration acceptance. Historical
claims remain redeemable on the separate legacy desk. The legacy oracle allowlist is fixed
to the old sampled profile; it cannot register the new TWAP profile unchanged.
The fresh layout-2 core/resolver support 32 retained markets/cases and immutable
archives, with their own storage funds and code pins. No old deployment was upgraded.

Other prerequisites: ORC-04 aligned valuation and resolver/runtime acceptance,
real maker inventory per series, operator budgets and authenticated observations,
collector/indexer support, real receipts, and independent review. Listing a
market does not guarantee funded offers. Source or infrastructure outages may
legitimately leave zero tradeable markets; no health check may fabricate one.

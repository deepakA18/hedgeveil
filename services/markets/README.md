# Rolling listing policy — planning only

User-selected 13 November 2026: next daily expiry and next Friday expiry at
08:00 UTC; five strikes at 90/95/100/105/110% of fresh observed spot. If daily
and weekly coincide, use the following Friday for weekly. A one-hour minimum
lead retains the complete pre-expiry 30-minute window and setup time.

`ladder.mjs` produces a read-only proposal. It has no signer and always returns
`actions: []`. Seeds are retained per expiry; changing spot must never rewrite
an existing market. The eventual provisioner must durably persist these seeds
before submitting registration, discover/reconcile existing terms, and use the
existing receipt journal to resume. A settlement event is a reconciliation
trigger, not permission to issue another duplicate cohort. Startup and periodic
reconciliation are also required so missed events cannot leave a gap.

Activation is NOT implemented. The current core has **8 lifetime series slots**
and fixed `[Position; 8]` account serialization. Raising the constant on a funded
instance is not a state migration. Ten simultaneous markets, and subsequent
cohorts, require a new version with scalable market/position storage, explicit
storage pricing, pagination and account/exit migration acceptance. Historical
claims must remain redeemable. The currently deployed oracle allowlist is fixed
to the old sampled profile; it cannot register the new TWAP profile unchanged.

Other prerequisites: ORC-04 aligned valuation and resolver/runtime acceptance,
real maker inventory per series, operator budgets and authenticated observations,
collector/indexer support, real receipts, and independent review. Listing a
market does not guarantee funded offers. Source or infrastructure outages may
legitimately leave zero tradeable markets; no health check may fabricate one.

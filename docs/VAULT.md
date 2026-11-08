# VLT-01 basket mechanics profile

Dependencies: CORE-01/02/03 custody and claims, ORC-02 settlement and MKT-01 funded
trading; FIN-02 policy selection remains unresolved. This increment implements
policy-independent accounting on Sandbox only. Reviewers: contracts/economics,
independent review pending. Invariant: share issuance never dilutes existing
asset quantities per share, exits cannot overdraw managed assets, and share
supply equals registered holders' balances. Failures revert all holdings/shares.

One guardian-created vault has an immutable ID, seed basket and initial share
scale. Creation is restricted to the `sandbox` domain, labelled `basket-demo-v1`,
and prepays 4096 bytes plus one yocto. Storage remains permanently allocated and
separate from collateral. The seed is 1..9 unique native/P/N assets across at most
four existing, unfinalized, pre-maturity series, including at least one claim.
Each seed amount and the initial share supply must be positive, each bounded by
100 Q. The seed defines units, not a price or approved USD strategy.

The first depositor must request exactly the configured initial shares and fund
the exact seed basket from their own ledger; there is no discretionary bootstrap
price. Later requests for s shares against supply S and holdings h_i contribute
ceil(s*h_i/S) per asset using checked wide arithmetic. Supply is capped at 100 Q.
The caller supplies a complete, unique asset-keyed list of maximum inputs;
unexpected/missing assets and exceeded limits fail. Exact requested shares are
the output, so no separate minimum-share field is needed. Reject zero shares and
mints whose existing-basket floor entitlement is zero for every asset. No NAV or
reference mark is accepted or required. Once any held claim matures/finalizes,
new issuance stops; exits remain available with the actual claims unchanged.

Burning s owned shares returns floor(s*h_i/S) of each asset. Complete per-asset
minima are checked before mutation. Reject an exit returning zero of every asset.
The last holder receives every remaining quantity, including rounding dust.
After final exit the vault closes permanently; it cannot bootstrap again or
change policy. No fees accrue within the basket in this profile. Each operation's
one-yocto authorization fee is separately paid from the caller's wallet.

Shares transfer only through `transfer_vault_shares`, between distinct registered
accounts. No force-burn, receiver/resolver callback or token-standard support is
claimed. Account unregistration is blocked while it owns shares. In-kind exits
credit the caller's native/P/N internal balances; ordinary claims can then be
transferred/redeemed/withdrawn through existing core methods. Finalized zero-value
claims remain claims until their owner burns them through `redeem`.

The guardian can pause new vault mints only. Transfers and exits remain available
through vault, market and deposit pauses, oracle delay or absent makers. No method
can donate directly to managed holdings. Raw native transfers and ordinary ledger
deposits/transfers remain outside the vault; they cannot change share ratios.
Canonical events include VAULT holdings, FREE share balances and a SUPPLY mirror;
shares are not native collateral and must never be counted as backing twice.

Without an opt-in roll profile, the risk view reports `ROLL_DEFERRED` /
`POLICY_UNSELECTED`, no NAV and `keeper_enabled=false`. VLT-02 now has the optional
[one-shot Sandbox guard profile](KEEPER.md), configured once before bootstrap.
It adds authenticated synthetic references and bounded funded rolls; it does not
select an economic strategy. After a roll, proportional issuance uses current
holdings and their maturities. Cash-only exits, RFQ-and-mint convenience operations
and an approved recurring policy remain pending. A policy change requires a new
reviewed version; existing holders retain exits.

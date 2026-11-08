# Public collateral accounting: initial obligations model

This is a specification argument, not a mechanized proof. The bounded G3 core
implements collateral/storage/series/ticket accounting and checks its local
invariants after each mutation. G4–G6 add implemented oracle bond, market and
vault categories with separately scoped compiled-Wasm evidence. See
[SEC-01 model boundaries](README.md) and [core evidence](../research/reports/G3_COLLATERAL_CORE.md).
Balances and supplies are observable; there is no confidential-note invariant.

Let F be all user free/order-reserved collateral, R_s the backing reserve for
series s, V_cash managed vault collateral, E fee balances, O oracle bonds,
S storage/refund liabilities, and W pending withdrawal obligations. Partition
ownership consistently: assets moved to vault holdings or order escrow leave the
source category. Vault claims remain part of outstanding P/N, so do not count
shares as an additional claim on the same backing.

Native custody reconciliation must separately model liquid funds, storage stake,
operational allocation, surplus and transfers in flight. Prior to dispatch, a
withdrawal moves F to W. Once funds leave the account, they cannot remain in
available custody; unknown outcome retains a quarantined obligation with its
in-flight evidence. A final callback cannot double-count a transfer or release
unrelated reserves. G3 exercises actual native-transfer receipts, confirmed
failure restoration, callback faults and unknown quarantine. A reviewed recovery
mechanism and general asynchronous refinement remain CORE-04/G10 work. Storage
refund failures restore storage funding, never free collateral.

For every admissible final coefficient pair, each series must cover remaining
claim payouts. At a fixed coefficient the sum of individually rounded payouts
cannot exceed floor(outstanding_p×p_q/Q)+floor(outstanding_n×n_q/Q). Minting equal
P/N against c collateral initially bounds total obligation by c. After partial
redemptions track reserve, burned supply and cumulative payouts together.

| Transition | Accounting obligation |
|---|---|
| Deposit c | Authenticated attached value increases custody and F by c, storage handled separately |
| Split c | F decreases c, R_s increases c, both claim supplies increase c |
| Merge c | Before finalization only: burn equal P/N, R_s decreases c, F increases c |
| Transfer/fill/roll | Preserve every asset including exact fees, with all legs atomic |
| Finalize | Immutable complementary coefficients; no mint or custody creation |
| Redeem a | Burn a claim, reduce R_s by floor(a×coefficient/Q), increase F accordingly |
| Dust release | Only after both supplies and redemption obligations are zero; explicit destination |
| Vault basket mint/exit | Move underlying between categories; shares represent the basket, not extra backing |
| Confirmed payout success | Close one W and reconcile the actual external transfer once |
| Confirmed failure | Restore only original owner F once, close that W |
| UNKNOWN | No resend/refund until authenticated resolution |

Unsolicited donations are surplus, not automatic credit, backing allocation or
share issuance. Fees/operating costs cannot consume promised collateral. Bound
series count, supply, lists and batch sizes; native account balance alone cannot
substitute for these records.

Assumptions requiring continuing executable evidence: correct initial state, predecessor and
callback authorization, atomic receipt effects, checked arithmetic, quote key and
nonce checks, immutable terms, authenticated oracle imports and complete custody
reconciliation. SEC-01 now enumerates finite withdrawal, oracle, resolution-import
and reserve states, with ten unsafe model mutation counterexamples. Separate SMT
checks cover bounded integer reserve obligations at eight complementary
coefficients and the actual supply cap; neither layer proves Rust/runtime
refinement. G3's seeded model comparison and event replay cover a fixed
16-account/8-series/64-ticket profile, not every interleaving or production load.
The queried storage price is pinned at initialization; account keys and the
protocol runtime are trusted deployment boundaries. Historical proof-verifier measurements provide none of this
public-ledger safety evidence.

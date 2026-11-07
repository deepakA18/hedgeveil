# Public collateral accounting: initial obligations model

This is a specification argument, not a mechanized proof of the unbuilt contract.
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
unrelated reserves. The exact asynchronous refinement remains CORE-04 work.

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

Assumptions requiring executable evidence: correct initial state, predecessor and
callback authorization, atomic receipt effects, checked arithmetic, quote key and
nonce checks, immutable terms, authenticated oracle imports and complete custody
reconciliation. Upcoming symbolic/stateful tests must name limits and discovered
counterexamples. Historical proof-verifier measurements provide none of this
public-ledger safety evidence.

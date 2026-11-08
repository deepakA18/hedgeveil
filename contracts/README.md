# Bounded collateral core, market and basket vault (Sandbox development)

This workspace implements the public internal ledger. It does not advertise FT/MT
standards. G5 adds signed funded RFQs and pair matching; G6 VLT-01 adds internal
shares and basket entry/exit on Sandbox only. The root payoff crate remains authoritative
for coefficient and payout arithmetic; this workspace uses the G1-tested Rust
1.96.0 / near-sdk 5.30.1 runtime. Independent review remains pending. No public
custody deployment is authorized by these local tests.

Implementation contract (specified before coding):

- Native NEAR only. Initialize a fixed guardian, allowlisted oracle, network and
  storage byte cost obtained from the node's current protocol config. Sandbox and
  testnet identifiers are accepted; deployment scripts only use loopback Sandbox.
- Bound state to 16 registered accounts, 8 immutable series and 4 retained tickets
  per account. Each account prepays 4096 bytes at the pinned storage cost. Each
  series prepays 4096 bytes plus an explicit 0.001 NEAR creation fee. The core
  requires a separately funded 20 NEAR operating allocation at initialization.
  These are local development caps, not approved production risk limits.
- User storage is a distinct refundable liability. Excess storage prepayment may
  move to the same owner's free collateral. Unregistration requires no free
  collateral, no P/N and no retained tickets; it sends a dedicated storage-refund
  ticket and freezes the closing account. Success removes the account/ticket;
  confirmed failure restores storage funding, clears closing and retains the
  failed ticket until its owner closes it. UNKNOWN never releases/refunds twice.
  There is no force-unregister. Series storage is retained with permanent terms.
- One yocto authorizes sensitive user/guardian methods and is recorded as fees.
  Creation fee is separate from user collateral and reserve backing. Surplus
  donations and operating funds never automatically become user credits.
- Per-series cap <=100 NEAR-sized pairs; aggregate unsettled/free user collateral
  <=1000 NEAR. JSON amounts/times are canonical unsigned decimal strings. P/N asset
  IDs are `P:<series_id>` / `N:<series_id>`; series IDs are unique lowercase IDs of
  at most 32 characters. Prices are USD/NEAR at 10^12; zero observations rejected.
- Split consumes free collateral one-for-one before cutoff by block time. Transfer
  debits predecessor only, requires both accounts registered and rejects self/
  zero/unknown-asset transfers. Merge burns equal P/N before finalization, including
  after maturity while waiting for settlement. Redeem burns finalized claims even
  with zero payout and credits the shared math library's rounded payout.
- Track deposited pairs, merged pairs, payouts, outstanding supplies, reserve and
  released dust. Only after both supplies are zero may remaining reserve become
  protocol fee balance. Dust is never inferred spendable from incomplete redemptions.
- Request resolution through the immutable oracle. Bind a versioned private
  callback to series/request sequence; reject failed, malformed, nonfinal or
  mismatched records. Retry a missing callback only after a five-second timeout;
  stale resolution callbacks cannot overwrite newer state. This is a read-only
  price retry, never a payout retry. Prices/terms become immutable on finalization.
- Debit native withdrawals before dispatch and preallocate ticket storage. Private
  callbacks accept only an empty native result as success; confirmed failure
  restores the original category/owner exactly once. Unexpected result or missing
  callback stays UNKNOWN. No payout retry/recovery method exists. Terminal tickets
  may be removed by their owner; IDs are monotonic and never reused.
- Scoped guardian pauses affect deposits, series creation, splits and G5 fills. Valid
  transfers/merges/final redemption/withdrawal remain available. There is no admin
  price setter, asset seizure, fee withdrawal or upgrade method. Full-access deploy
  keys still exist in Sandbox; absence of an upgrade method is not immutability.
- Events are EVENT_JSON envelopes with protocol schema 0.2.0, operation ID derived
  from network/account/monotonic sequence, actor, exact bucket/asset deltas, fees and
  a post-state hash. Include supply deltas as a distinct SUPPLY bucket; consumers
  must not count supply mirrors as balances. Public lists are paginated (limit<=16).
- Storage funding bounds are checked against serialized state and actual code/state
  stake. Custody views report free/reserve/storage/fees/series-storage/operations
  separately from pending/UNKNOWN funds in flight. G5 adds permanent maker-registry
  storage and G6 adds permanent vault storage as separate allocations. Vault cash
  is reported separately from account free collateral. They do not add in-flight funds
  to available native custody. Persistent indexing/full receipt recovery are future work.

`test-fixtures/oracle` is explicitly admin-controlled and synthetic: tests set
reports to exercise import failures. It is not the G4 oracle and has no security
claim for price discovery. A separate core `fault-injection` artifact tests callback
panic/replay; the normal build excludes those exports. Neither fixture is a
production deployment target. A separate account fixture deletes its own Sandbox
account before a queued unregister request, allowing the suite to observe a real
failed native storage refund. It has no deployment role outside those tests.

## Build and validate

From the repository root, using the G1-installed toolchain and Node dependencies:

```sh
npm ci --prefix tests/sandbox --ignore-scripts
python3 scripts/build-core.py
node tests/sandbox/g3.mjs
node tests/sandbox/g5.mjs
cargo +1.96.0 fmt --manifest-path contracts/Cargo.toml --all -- --check
cargo +1.96.0 clippy --manifest-path contracts/Cargo.toml --workspace --target wasm32-unknown-unknown --locked -- -D warnings
cargo +1.96.0 clippy --manifest-path contracts/Cargo.toml -p hedgeveil-clearinghouse --features fault-injection --target wasm32-unknown-unknown --locked -- -D warnings
```

First use requires Rust 1.96.0 with `wasm32-unknown-unknown` and Node >=22.22.2;
see [G1 setup](../research/g1/README.md). No API key, wallet file or paid feed is
needed. The harness pins Sandbox 2.14.0, creates fresh local accounts and tears
down its node. It records source/lock/Wasm hashes, actual receipts, event replay,
seeded reference comparisons, gas and custody in
[g3-sandbox.json](../research/reports/g3-sandbox.json). Failed runs exit nonzero and
write ignored `target/g3-failed.json`, without replacing successful evidence.
To preserve the original G3 record when testing the G5 binary, use
`node tests/sandbox/g3.mjs --report research/reports/g5-core-regression.json`.
G5 writes [g5-sandbox.json](../research/reports/g5-sandbox.json). The state layout
changed for maker registries; deploy to fresh local accounts only. No migration
entry point exists for old core state.

## Implemented interface

All Amount/Num64 values are canonical decimal strings. The normal Wasm exposes:

| Method | Parameters / authority |
|---|---|
| `storage_deposit` | Positive attached storage funding; predecessor account only |
| `release_storage_excess` | `amount`; one yocto; credit only own free collateral |
| `unregister` | One yocto; empty own account; refund through a distinct storage ticket |
| `deposit_collateral` | Positive attached native collateral; registered predecessor |
| `create_series` | `config` as `SeriesConfig`; exact quoted storage plus creation fee |
| `split`, `merge` | `series_id`, `amount`; one yocto |
| `transfer` | `asset` (`COLLATERAL` or `P`/`N` with `series_id`), `amount`, `receiver`; one yocto |
| `redeem` | `series_id`, `leg` (`P`/`N`), `amount`; one yocto |
| `release_dust` | `series_id`; one yocto; only closed-out finalized obligations |
| `request_resolution` | `series_id`; immutable oracle and request-bound callback |
| `request_withdrawal` | `amount`, `receiver`; one yocto; debit own free collateral |
| `mark_unknown` | Decimal `ticket_id`; overdue pending ticket only, no monetary release |
| `close_ticket` | Decimal `ticket_id`; one yocto; owner and terminal outcome only |
| `set_pauses` | `pauses: {deposits, series, splits}`; guardian and one yocto |
| `register_signing_key` | `key_id`, `public_key` (32-byte lowercase hex); own registered account; first key prepays `market_config.registration_storage` plus one yocto, subsequent keys one yocto |
| `revoke_signing_key` | `key_id`; own registry; one yocto; irreversible ID revocation |
| `cancel_quote` | Decimal `nonce` (0..255); own current epoch; one yocto |
| `advance_quote_epoch` | Decimal `epoch` greater than current; own registry; one yocto |
| `fill_quote` | Signed `quote`; taker predecessor; one yocto; exact funded legs and fee |
| `match_pair` | Signed `pair_quote` passed as `quote`; taker predecessor; one yocto; joint collateral mint |
| `set_market_pause` | `paused` boolean; guardian and one yocto; fills/pairs only |
| `on_resolution`, `on_withdrawal_result` | Private versioned callbacks, never client methods |

Views: `storage_quote`, `custody_snapshot`, `get_pauses`, `get_account(account_id)`,
`get_series(series_id)`, `series_state(series_id)`, `get_ticket(ticket_id)`, and
`list_accounts/list_series/list_tickets` with `from_index` and `limit` (1..16).
`list_tickets` also requires `account_id`. Internal structs use fixed claim slots
indexed by immutable `Series.slot`; asset ownership remains keyed by the public
series ID in events. Account closure removes its storage-refund ticket on success;
the final outcome remains in canonical receipt events. G5 views are `market_config`,
`get_market(maker)`, `quote_digest(quote)` and `pair_quote_digest(quote)`; digest
views encode/hash only and do not authorize execution. See [MARKET](../docs/MARKET.md)
for signing bytes, fee aliases, durable registry limits and maturity restrictions.

The normalized shared-schema transaction envelope is an SDK/review intent, not an
RPC method: send its method/args and attached deposit separately. G6 implements
basket mint/exit intents; keeper and token-standard interfaces remain pending.
G5 implements native/P/N RFQs with at most four legs per side. See
[G3 results](../research/reports/G3_COLLATERAL_CORE.md) for evidence and limits.

## G6 VLT-01 basket interface

The [basket profile](../docs/VAULT.md) is experimental and rejects creation outside
Sandbox. It requires fresh state; there is no migration from G3–G5 deployments.
All methods below except views require one yocto; creation additionally prepays
`vault_risk.storage_payment`. There are no management/performance fees.

| Method | Parameters / authority |
|---|---|
| `create_vault` | `vault_id`, `seed: [{asset,amount}]`, `initial_shares`; guardian; one immutable vault |
| `vault_mint_basket` | `vault_id`, exact `shares`, complete `max_inputs`; caller supplies its own ledger basket |
| `vault_redeem_in_kind` | `vault_id`, `shares`, complete `min_outputs`; caller burns only its own shares |
| `transfer_vault_shares` | `vault_id`, `shares`, registered `receiver`; caller's shares only |
| `set_vault_mint_pause` | `paused`; guardian; affects issuance only |
| `get_vault` | View of seed, holdings, supply, holder balances and pause/closure |
| `vault_risk` | View of experimental profile, limits and explicit POLICY_UNSELECTED status; no NAV |

Run `node tests/sandbox/g6.mjs` after `build-core.py`. Preserve earlier reports by
running the G3/G5 regressions with `--report research/reports/g6-core-regression.json`
and `--report research/reports/g6-market-regression.json`, respectively. The
[G6 report](../research/reports/G6_BASKET.md) distinguishes basket accounting
from the then-unimplemented VLT-02 keeper and unresolved economic selection.

## Optional VLT-02 one-shot Sandbox guard

The [keeper profile](../docs/KEEPER.md) can be configured only before the first
shares are minted. It has immutable terms, a distinct authenticated synthetic
reference publisher and one successful full-old-P roll. It does not approve an
economic policy. Fresh state is required; no migration is implemented.

| Method | Parameters / authority |
|---|---|
| `configure_vault_roll` | `policy` as documented in KEEPER; guardian, unseeded vault; extra 4096-byte prepayment plus one yocto |
| `publish_vault_reference` | `reference: {sequence, observed_ns, old_price, new_price}`; configured publisher; one yocto |
| `execute_vault_roll` | `quote` (G5 quote or null), `reference_sequence`; configured keeper; one yocto |
| `get_vault_roll` | Immutable policy, latest reference, deferral, exhaustion and spent budgets |

The quote must bind its taker to this core account. That account represents the
single managed vault only inside this guarded method; ordinary RFQ callers still
authorize their own ledger debits. Expected guard failures return ROLL_DEFERRED
without consuming the quote or moving holdings; invalid authority/signatures
revert. Publishing data does not clear a latched deferral. Exits always retain
their ordinary owner/minimum checks, independently of reference freshness.

`vault_risk` labels the experimental profile, absent NAV, enabled/exhausted state
and current deferral. Custody adds `roll_storage_fund`, separate from managed
cash and collateral. The [keeper report](../research/reports/G6_KEEPER.md) records
actual local execution and regression coverage. The earlier G6 basket report
describes the revision before this optional guard existed.

# G5 funded RFQ specification

Written before implementation. MKT-01 depends on CORE-01/02 and FIN-02; MKT-02
additionally depends on MKT-01. Invariant: every exact asset leg and fee is funded
before a fill, quote consumption is single-use and all balance changes are atomic.
Failure paths: invalid signature/domain/key, stale/consumed/cancelled quote,
insufficient inventory, paused market and maturity/cutoff. Reviewers:
market/contracts/security and market/quant; independent review pending.

## Authorization and durable replay protection

A registered ledger owner registers up to four lifetime Ed25519 RFQ key IDs.
Public keys are 32 raw bytes encoded as 64 lowercase hex characters, not an assumed
NEAR account access key. Revocation is permanent; key IDs cannot be reused. First
key registration prepays another 4096 bytes plus one yocto authorization fee;
subsequent key/cancel/epoch operations require one yocto. Up to 16 lifetime maker
records are retained, independently of active ledger registration. Market storage
is a separate permanent allocation, never collateral or refundable account storage.

Each maker has a monotonically increasing u64 cancellation epoch and 256 nonce
slots per epoch. Consumed and cancelled bits are retained until the owner advances
the epoch, which invalidates every older quote. Nonces are shared across all maker
keys and both quote types. Unregister revokes keys and advances the epoch before
requesting storage refund. The maker record persists, so re-registering an account
cannot resurrect old signatures. Bounded key/nonce/maker limits are demo constraints.

## Signed bytes and quote records

Existing `quote` JSON v0.2 records are supported for native collateral and P/N;
VAULT_SHARE remains a schema draft and is rejected by this core. Each side has
1..4 positive legs. Asset IDs must be unique across both sides. Contracts and
network/protocol, maker, optional taker, exact legs, fee, nonce, epoch, expiry and
key ID are signed. A non-null taker binds the caller; open quotes permit any
registered caller except the maker. The caller authorizes its debits with one yocto.

Sign raw bytes with Ed25519, not a prehashed message. The signing payload is an
ASCII domain prefix followed by Borsh of every quote field except `signature`.
Strings have u32 little-endian UTF-8 byte lengths; vectors use u32 counts; optional
accounts use a 0/1 tag; Amount is u128 LE and Num64 is u64 LE. Asset tags are
0=COLLATERAL, 1=P plus series string, 2=N plus series string. Field order:

- Trade prefix `HEDGEVEIL:RFQ:1\0`: kind, schema_version, domain (protocol_version,
  network, contract_id), maker, taker, maker_gives, taker_gives, fee (asset, amount,
  receiver), fill_rule, rounding, nonce, cancellation_epoch, expiry_ns,
  signing_key_id, signature_scheme.
- Pair prefix `HEDGEVEIL:PAIR:1\0`: kind (`pair_quote`), schema_version, domain,
  maker, taker, series_id, pair_amount, maker_leg (string P/N), maker_collateral,
  fee, fill_rule, rounding, nonce, cancellation_epoch, expiry_ns, signing_key_id,
  signature_scheme.

Constants: schema_version 0.2.0, protocol_version 1, ALL_OR_NOTHING, EXACT_AMOUNTS,
Ed25519. Signatures are 64 bytes / 128 lowercase hex characters. Epoch/nonce and
amount strings use the same canonical decimal rules as the core. JSON order is
irrelevant to this explicit binary encoding. The two prefixes prevent a trade
signature from authorizing pair issuance. Independent JS/Rust payload digests and
public golden vectors must agree.

## Atomic execution and fees

`fill_quote(quote)` verifies its signature using the current maker registry and
checks expiry (strictly future, at most five minutes ahead), epoch, nonce, active
accounts, and all series. RFQ claim trades are limited to unfinalized pre-maturity
series in this profile; ordinary claim transfers/merges retain their G3 rules.
All outgoing legs and the taker's fee are debited from pre-fill free balances
before any incoming credits. Quotes do not reserve inventory. Two quotes sharing
inventory race; a losing fill changes no balances or nonce. No partial fill exists.

Fees are exact native amounts paid by the taker from preexisting free collateral
to the signed, registered fee receiver, capped at 0.01 NEAR per fill. The separate
one-yocto authorization payment becomes a protocol operating fee. Trade fees
remain owned free collateral; they do not change backing or issued supplies.

`match_pair(quote)` explicitly authorizes both parties' native contributions.
The maker contributes maker_collateral, the taker pair_amount minus that amount;
both must be positive and prepaid, and the taker additionally funds the signed
fee. Mint exactly pair_amount P/N against the total reserve, give maker_leg to the
maker and the opposite leg to the taker. Enforce split pause, mint cutoff and
supply cap. The same nonce cannot authorize both pair matching and a trade.

Old/new rolls are ordinary multi-leg RFQs: swap old P for new P and optionally a
native adjustment in one receipt. No asynchronous naked collateral leg exists.
This is a voluntary exact-amount trade, not the future G6 guarded keeper policy.
No global live-price source or fair-price guarantee is implied. A guardian's
separate market pause stops fills/pair matching, not cancellations or valid exits.
Every fill emits existing canonical balance deltas plus a receipt audit record
identifying maker, taker, signing digest, epoch and nonce.

## Local maker execution

Two separately running Node processes each own an ephemeral RFQ signing key and
a separate funded Sandbox maker account. They query current chain balances,
series and registry state before quoting. A disclosed synthetic reference supplies
current marks; it is distinct from the G4 settlement oracle. Integer-only pricing
uses a half-spread plus inventory-distance adjustment. Enforce reference freshness,
quote TTL, per-quote notional, post-fill position caps and an equity loss limit.
No private keys are logged or written; the local harness passes ephemeral account
keys through IPC only for each maker's own quote-cancellation transactions.

On a request with stale/missing data or a loss-limit breach, or explicit retirement,
a process stops quoting and advances its on-chain epoch if it has issued quotes,
using its own funded account. This action produces real receipts. These local
workers check references on requests, not a continuous feed-monitoring timer.
If cancellation fails, old quotes can remain fillable until expiry;
a process exit alone never revokes a signature. Restart requires registering a new
key ID; never reconstruct a signing counter from an assumed local success.

Report synthetic executable spread/depth, fill/rejection reasons, time to fill,
actual balances/inventory, concentration, model-marked maker P/L, funding and
subsidies separately. Quotes are off-chain signatures; fills/cancellations are real local transactions; reference
marks and economic demand are synthetic. No historical profitability or production
capacity claim follows. G2 selects no passing vault policy; G5 evidence informs a
future revised experiment rather than overriding that result.

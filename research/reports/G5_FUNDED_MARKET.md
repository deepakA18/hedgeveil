# G5 funded market — local execution evidence

Recorded 7 November 2026. MKT-01/02 are locally implemented, with independent
market/contracts/security and market/quant review **pending**. Dependencies are
the G3 internal ledger and FIN-02's synthetic experiment; G0/G1 review/integration
gaps remain, and FIN-02 selects no passing rolling policy. The root plan's two
testnet makers and complete public demo remain future release work.

Invariant: exact signed legs and fees are funded before credits, a successful
quote consumes one nonce, and failure changes neither ledger nor replay state.
Pair matching creates equal P/N only against both parties' combined collateral.
Storage and operating funds never fund claims. UNKNOWN payouts remain quarantined.

## Artifacts and reproduction

- [g5-sandbox.json](g5-sandbox.json): 29 checks, 97 recorded transactions, 61
  canonical ledger events, 41 signed quote submission attempts and 11 fills.
- [g5-core-regression.json](g5-core-regression.json): the complete existing G3
  suite on the new core, 27 checks, 366 transactions and 397 canonical events.
- [MARKET specification](../../docs/MARKET.md), [contract ABI](../../contracts/README.md),
  [signing codec](../../packages/rfq/README.md), [maker worker](../../services/maker/README.md).

These are ephemeral local Sandbox receipts, not persistent testnet deployments.
Setup/account creation is not included in the recorded transaction counts.
Both reports record compiler/runtime versions, dependency/source hashes, actual
transaction/receipt outcomes, custody and artifact hashes. G5 also records signed
quote payloads, public key registrations, fill digests, maker requests and final
inventories. No private key or `.env` value is evidence. `base_commit` anchors
unchanged repository dependencies; the per-file hashes identify changed code.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Normal clearinghouse | 504,618 | `469b1ca678b41aeab5c5bdda06d752dbd50397061235884e32ac4a00fe064645` |
| Fault-only clearinghouse | 510,815 | `3bda6cd3353521ef5560efd9b159257a2e2b4af46adb5cab60d12740a689d0b6` |

Rust 1.96.0 / near-sdk 5.30.1, Sandbox 2.14.0 and Node v24.8.0 on macOS ARM64.
The G5 state layout requires fresh core accounts; no migration is implemented.
Normal Wasm excludes the fault callback exports. Original G3/G4 reports remain
unchanged evidence for their recorded artifacts. G4 oracle source is unchanged;
this market suite uses the disclosed G3 oracle fixture to configure series.

```sh
npm ci --prefix tests/sandbox --ignore-scripts
node --test tests/market/codec.test.mjs
node scripts/generate-rfq-vectors.mjs --check
python3 scripts/build-core.py
node tests/sandbox/g5.mjs
node tests/sandbox/g3.mjs --report research/reports/g5-core-regression.json
```

Also passed: five Python financial tests and 565 reference vectors, three locked
root Rust tests, root format/Clippy, contract Wasm Clippy for normal and fault
builds, four Node codec tests, nine public-schema groups, six oracle collector/schema
groups and 15 G2 regression groups. Generated schemas pass `build_schema.py --check`.
The root payoff implementation and prior G2 experiment are unchanged.

## Authorization, atomic execution and failures

Two unsigned public vectors agree between JS and compiled Rust digests, including
separate trade/pair prefixes. Real Ed25519 signatures authorize the successful
transactions. Every successful fill is independently verified against its recorded
public key and joined to its audit digest and receipt. JSON key order does not
affect the explicit Borsh encoding. Zero signatures in the encoding fixtures are
placeholders, never valid authorization.

The receipt cases cover:

- Forged payload/signature, wrong network/contract/taker/key/epoch, nonce outside
  0..255, expiry, duplicate assets, invalid fee receiver/cap and an unfunded late
  leg; complete before/after ledger and nonce snapshots agree on rejection.
- Both cancellation/fill orderings; used/cancelled nonces never execute again.
  Shared unreserved inventory admits one fill and rejects the competing unfunded
  fill; after replenishment the failed quote can execute because failure did not
  consume its nonce.
- Epoch advancement, permanent key revocation/ID nonreuse, nonce 255, and
  unregister/re-register retaining revoked keys and the advanced epoch.
- Explicit jointly funded pair issuance, contribution/supply-cap rejection and
  a shared replay namespace with exchange quotes.
- Atomic old-P/new-P swaps with native adjustment, taker and maker fee aliases,
  and a maximum four-leg-per-side exchange. Fee funding is checked before incoming
  credits, even when its receiver is a trading participant.
- Market pause rejecting fills/pairs while cancellation and ordinary transfers
  remain available; mint cutoff and maturity checked at receipt execution.
- Full event replay reconciling all free balances, claim supplies/reserves, fees,
  account/series/market storage and withdrawals. All 61 canonical events pass the
  generated public schema. The RFQ audit envelopes are separately digest-checked.

There were 11 successful fills and 30 deliberately rejected submissions among
41 attempts. This adversarial ratio is not an organic order-fill metric. Ten fills
were exchanges and one was pair issuance. Seven were manual adversarial fixtures;
four came from the two maker processes. Cancellation orderings are deterministic
receipt sequences, not an exhaustive concurrent-ordering proof.

The core regression includes seeded split/transfer/merge/redemption, all 16 active
account slots, eight series, 64 retained tickets, real failed native/storage
refunds, successful payouts followed by callback panic/gas failure, and duplicate
callback rejection. Its fault contract retains 200 atomic units as UNKNOWN, with
no refund/resend. It does not test all 16 lifetime maker registries or every key
and nonce combination simultaneously.

## Maker execution and economic disclosure

Two distinct child PIDs, separate ledger accounts and separate ephemeral RFQ keys
are recorded. Each maker received 80 NEAR collateral and initially split 20 NEAR
in each of the old/new series: 40 NEAR free, 20 Q of each of four claims. Each
account was created with 150 Sandbox NEAR, so its remaining wallet balance funded
storage/gas and was not trading inventory. All funds originated from Sandbox
genesis. There is no organic capital, demand, revenue or external hedging evidence.

Marks were controlled synthetic inputs: old P/N each 0.5 NEAR per Q, new P 0.45
and new N 0.55. They are not settlement observations or model-derived fair prices.
Quote TTL was 15 seconds, reference freshness 30 seconds, per-quote notional cap
10 NEAR, inventory target 20 Q, prospective claim cap 40 Q and marked loss cutoff
20% of initial equity. The trade fee was five basis points, additional to the
spread and one-yocto authorization fee.

| Observed request | Executable result before fee |
|---|---|
| Buy 1 Q new P, maker A | Ask 0.4509 NEAR (20 bps initial half-spread); selected and filled |
| Same request, maker B | Ask 0.4518 NEAR (40 bps half-spread); competing quote not selected |
| Buy 1 Q old N, maker B | Paid 0.502 NEAR, actual fill |
| Sell 1 Q new P, maker A | Received 0.44901 NEAR after inventory adjustment, actual fill |
| Roll 1 Q old P plus 0.1 NEAR, maker B | Received 1.323594510845506861443116 Q new P in one receipt |

The sampled A buy/sell prices differ by 0.00189 NEAR; they were sequential at
different inventory states, not a simultaneous order book. Executed requests
demonstrate one-Q request depth and the recorded roll output only. The 20-Q
inventory and 10-NEAR cap are configured bounds, not measured executable depth
across prices or users. A 21-Q buy failed inventory, a 21-Q sell failed position
capacity, and a 100-Q buy failed notional limits.

Of 16 scripted maker requests, eight returned signatures and eight returned no
quote: notional, inventory, position, malformed reference, stale reference and
loss limit once each, plus two retired-maker responses. Four signed quotes filled;
one competitor was unselected, one was deliberately expired and two were used
for cancellation/retirement cases. This selection is a test fixture, not a demand
sample or expected fill rate. Each maker provided two of the four maker fills
(50% concentration by count); either maker's removal reduces available inventory.

Malformed/stale references and an adverse synthetic mark shock produced actual
epoch-cancellation receipts. Explicit retirement invalidated an outstanding quote.
Once both workers retired, neither returned a quote and no transaction success
was fabricated. The shock set marks to one atomic unit to trigger the guard; it
is an artificial marked-loss probe, not a coherent settlement path or realized
market loss. These guards run on requests; killed processes cannot cancel on
their own, and old signatures remain usable until chain cancellation or expiry.

At the unchanged baseline synthetic marks, final ledger equity was 80.00189 NEAR
for A and 80.0063824701195219123505978 NEAR for B: marked gains of 0.00189 and
approximately 0.00638247 NEAR. A finished with its initial four claim balances;
B held 21 Q old P, 19 Q old N, 18.676405489154493138556884 Q new P and 20 Q new N.
Free collateral was 40.00189 and 40.602 NEAR respectively. These are ledger mark
calculations excluding wallet gas, storage, infrastructure and hedging costs, not
net economic profit. Synthetic profitable fills do not override G2's failed
policy selection or establish vault tracking quality.

The selected first fill completed in approximately 753 ms on this local run.
This is one observed submission-to-final-response interval, not a percentile,
throughput benchmark or testnet latency estimate. Raw request timings are recorded
separately and include cancellation transactions where applicable.

## Costs, limits and remaining work

Measured transaction-plus-receipt gas was 5.823–8.664 Tgas for successful exchanges,
6.247 Tgas for pair issuance and 4.788–4.789 Tgas for worker epoch cancellations.
The maximum eight-leg exchange used 8.664 Tgas. These measurements cover the
recorded ledger sizes only. First maker registration allocates 4096 storage bytes,
0.04096 NEAR at the node's queried price; four retained registries total 0.16384
NEAR. Their storage remains separate even after account unregistration. Final
core custody had 204 NEAR free collateral and 118 NEAR reserves, matching 322 NEAR
tracked collateral, with retained categories fully covered.

Independent review, wider interleavings/load, all registry/key capacity boundaries,
other signing implementations, testnet receipts and maker funding, authenticated
production references, continuous monitoring, relay and wallet/indexer flows are
pending. The bounded lifetime maker/key registry is a local profile, not a
production capacity/migration design. RFQs do not reserve inventory or guarantee
fair execution, and maker position checks can race with other outstanding quotes;
the contract always rechecks actual spendable balances. G6 still needs reviewed
policy selection and guarded issuance/exit/keeper implementation. G9, G10 and
G11 remain separate gates. No public deployment or independent sign-off is claimed.

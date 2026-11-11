# External price intake

Separate observation and request tools are implemented:

- `probe.mjs`: read-only native contract discovery; records unavailable caches,
  chain/code identity and interface differences.
- `signed-cli.mjs`: offline verification and immutable archival of previously
  obtained Outlayer JSON signed responses. No API call, API key, `.env` loading,
  wallet or transaction capability. This is not a settlement adapter.
- `request-testnet.mjs`: a bounded, wallet-signed native request on port 8792.
  Connect `0xdeepak18.testnet` to approve one `request_price_data` call to the
  pinned `price-oracle.testnet` account, attaching 0.02 test NEAR with 200 Tgas
  maximum. It needs no paid API key. Its durable journal sends at most once;
  ambiguous submissions require receipt recovery, not another send. Running the
  server alone sends nothing. Source acceptance is separate from transaction
  success, and the protocol deployment hold remains in place.

## Signed response workflow

Use Node 24 (the existing workspace runtime). The input is the **inner signed
response**, not the API's transport wrapper. Supply a key obtained independently
of that response. The documentation key in `signed.mjs` is only an interoperability
candidate; it has not passed independent attestation/authority approval.

```sh
node --test tests/oracle/signed.test.mjs tests/oracle/outlayer.test.mjs

# Public-key argument is public material; never supply a private or payment key.
node services/outlayer/signed-cli.mjs verify --input /path/to/response.json --public-key ed25519:PUBLIC_KEY
node services/outlayer/signed-cli.mjs ingest --input /path/to/response.json --public-key ed25519:PUBLIC_KEY --archive .local/outlayer-observations
node services/outlayer/signed-cli.mjs replay --public-key ed25519:PUBLIC_KEY --archive .local/outlayer-observations
node services/outlayer/signed-cli.mjs current --public-key ed25519:PUBLIC_KEY --archive .local/outlayer-observations
```

`verify` checks signatures and format; it may successfully verify old evidence,
but labels it `current: false`. `ingest` also permits authentic historical data
without pretending it was collected now. `replay` rechecks signatures and filenames
from disk. `current` additionally requires an unambiguous latest observation no
older than 60 seconds, with no future timestamp. Invalid inputs return nonzero.
Every output says `settlement_eligible: false`.

The archive publishes each synced artifact through an exclusive hard link,
deduplicates identical payloads and refuses conflicting existing files. Partial
temporary writes are ignored. It retains conflicting signed values rather than
overwriting them; same-time price conflicts block current selection. It does not
provide a remote backup, complete-history proof or authenticated collection time.

Only exact signed bytes, signature, format and key enter the artifact. The
envelope's source reports and aggregation/request settings are not covered by the
price signature. This prevents consumers from accidentally calling those fields
authenticated. An old aggregate's oldest-input timestamp also cannot prove that
every contributing observation preceded a particular expiry.

No live feed has been accepted. User directed this step to remain free; the
documented payment-key endpoint has not been called. A publicly supplied valid
signed response plus verified key provenance would allow interoperability testing
without an account, but that evidence remains outstanding. The provider's
published example currently fails verification; it is retained only as a
negative regression vector. See [intake evidence](../../research/reports/ORC03_SIGNED_INTAKE.md).

## Accepted testnet sampled-price collector

The user accepted `native-sampled-v1` on 10 November 2026. `sampler.mjs` operates
that profile with a caller-supplied dedicated service signer and durable admin
journal. It does not discover wallets, read `.env`, or use the owner's wallet key.
The original read-only/signed tools retain their own non-settlement labels; their
output alone does not authorize this collector. Actual public source verification
remains pending.

A tick checks pinned chain/code, terms, slot and selected report. It can send one
0.02-test-NEAR refresh per slot (three total), one sample per slot, finalization and
core import. A successful refresh transaction is not proof that a sample was
accepted: the next finalized resolver state must confirm that. Unknown/failed
attempts stop progression. Missing slots remain delayed. Full returned receipt
evidence is retained by `AdminTransactions`; source callback bytes are part of
those receipts. There is no automatic paid retry.

`node services/testnet/cli.mjs sample --name NAME` performs one tick only for a
newly provisioned native deployment. Held and legacy plans reject before key
loading. No such public deployment has been provisioned yet. The command expects
a deployment record with pinned `source`, immutable `series`, core and
`external_oracle` indexer contracts, and the plan's accepted policy identifier.

Each tick owns `.native-sampler-running` in the admin journal directory. A process
crash leaves this lock. Confirm the recorded PID is no longer running, retain its
owner record and inspect the transaction journal before explicitly removing that
lock. Never delete the journal, attempts or hashes; the next tick recovers prior
attempts before any new operation. A timer does not authorize clearing the lock
or resending a transaction.

```sh
node --test tests/oracle/sampler.test.mjs
node tests/sandbox/sampler.mjs
```

The latter uses a clearly identified local source fixture and actual compiled
contract receipts. It is not Outlayer public-testnet acceptance.

# Real-data implementation progress — 10 November 2026

## Maker pricing: implemented with actual-data Sandbox acceptance

The fixed public 50/50 reference has been removed from `services/testnet/runtime.mjs`.
Testnet workers require the Coinbase market profile and fetch their own inputs;
caller-supplied marks cannot choose their public quotes. Missing data does not fall
back to fixtures. Price provenance/model parameters accompany quote diagnostics.

The retained public HTTP responses in `mkt03-market-observation-2026-11-09.json`
produce the recorded 168-return realized volatility and exact spot units. The
model uses explicit zero rate/carry and a European terminal-price approximation;
it is not an exact model of the settlement window average or an observed option
market. Eleven test groups include 60 independent Python-erfc model comparisons,
data integrity/freshness/gap failures and snapshot archival behavior.

`mkt03-live-market-sandbox.json` records seven passing checks, actual external
market inputs, two maker processes, signed P/N buys and a sell, source replay and
actual on-chain cancellation. Custody is Sandbox-only, not public testnet.
`mkt03-g5-regression.json` retains the existing 29-check, 97-transaction, 11-fill
regression with explicitly local synthetic fault scenarios. Neither run establishes
independent liquidity, market profitability or production calibration.

## Settlement adapter: implemented candidate, source acceptance pending

`contracts/external-settlement` implements the separately specified
`native-sampled-v1` candidate. It records authenticated callbacks from a configured
external account during fixed slots, rejects invalid/missing/stale reports, keeps
accepted samples immutable and exports the existing clearinghouse Resolution wire
type. It has no collateral or price setter. Its timestamp rule is **source on-chain
ingestion**, not verified historical venue time. The guardian veto is not bonded
arbitration; accepting this candidate requires an explicit source/authority decision
and does not silently satisfy the old challenge gate.

`orc03-native-resolver-sandbox.json` records 24 passing compiled-Wasm checks,
including source faults, exact-unit sampling, delayed/missing outcomes, the actual
core callback, both-leg redemption and successful native withdrawal. Its source
is an explicitly synthetic test fixture. No live external settlement is claimed.
Generated external-oracle schema and schema tests cover actual recorded cases,
events and snapshots. The PostgreSQL indexer replays resolver sequences, checks
state commitments at the same finalized block, exposes missing-sample alerts and
survives restart without duplicate events. State tampering and sequence/domain
changes fail reconciliation. Indexed state includes registrar/guardian accounts.
The app audit view now includes both legacy and native resolver evidence.

## Public on-demand check prepared

The local page at `http://127.0.0.1:8792` prepares one `request_price_data` call to
the pinned `price-oracle.testnet` deployment from `0xdeepak18.testnet`: 0.02 test
NEAR attached, 200 Tgas maximum. It adds no keys or accounts and uses no paid API.
Wallet signing remains required. The server checks chain/code identity, retains
handoff attempts, matches exact actions and verifies complete finalized receipts.
HTTP smoke checks verified the bounded action, cost text, bundle, no attempted
transaction and cross-origin rejection. Vendor-wallet execution is still pending.
The protocol's deployment hold is independent of this source probe.

## Remaining acceptance and ownership

MKT-03: public testnet quote/fill/restart acceptance and independent market/security
review remain. ORC-03: actual source refresh, agreed time/authority/challenge policy,
operational sampling, public indexer/source monitoring, public lifecycle and independent
oracle/contracts/security review remain. DEM-01 must revise the old budget after
source acceptance. REL-01 requires a fresh full public rehearsal and review.

The two makers remain project-operated. P/N claims still use the internal ledger;
standards compatibility is not claimed. Vault remains disabled under the agreed
options-first scope. No public deployment, paid API charge or independent sign-off
is invented. The pending wallet source test does not authorize protocol deployment.

## Refreshed external read and smaller budget draft

`outlayer-pinned-2026-11-10.json` records a read-only testnet check: chain and
source-code pins matched and the cache now contained an actual report, but it
was stale. It remains ineligible for settlement; this is not a successful wallet
refresh. No observed transaction is attributed to our wallet without a receipt.

`deploy/testnet/native-sampled-budget-draft.json` allocates 48 test NEAR: core 30,
resolver 5, two makers 6 each and administrator/refresh 1. The owner reserve is
one additional test NEAR. This removes the old project's oracle publisher and
arbitrator accounts; the draft does not claim independent maker liquidity.
A maximum of nine proposed refresh deposits (0.02 each) fits within the admin
allocation; actual source behavior and gas still need preflight validation.
The draft is non-executable and held for source/policy acceptance. No new keys
were generated and no protocol funding/deployment was sent.

## Final local verification

55 focused Node test groups pass across market inputs/valuation, native resolver
event/domain checks, indexer profiles, oracle intake and administrative receipt
handling. The separate PostgreSQL atomicity/restart/API regression also passes.
Fourteen generated-schema groups pass, including actual compiled resolver cases,
events and the indexed snapshot. Five rational reference groups and all 565
shared vectors remain reproducible. Locked workspace tests, format checks and
Clippy pass (Rust 1.91 root; Rust 1.96 and the Wasm target for contracts).
All 59 historical archive hashes remain unchanged. These checks do not supply
independent review or public-wallet/source acceptance.

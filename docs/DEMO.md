# Public demo recording checklist

Updated 14 November 2026. Use https://hedgeveil.vercel.app. The frontend is on
Vercel; the persistent backend is on Railway. All demo assets are test tokens.
Production and the tracking vault remain disabled. This checklist supersedes the
historical local narrative below for public recordings.

## Before recording

- Open Status and verify receipt reconciliation, current price inputs and maker
  offers. A green process heartbeat alone does not prove executable liquidity.
- Pick a currently open market from the UI, not a strike/date copied from an old
  instruction. Refresh its offer immediately before signing.
- Use a small amount within the wallet's actual trading balance. Do not repeat
  deposits, trades or withdrawals marked unknown; recover their receipt first.
- The renewed daily/weekly ladder and both makers' P/N quotes passed the public
  probe at 10:36 UTC. Availability can change. The project-owned timely series
  completed real settlement, both redemptions and withdrawal after one reviewed
  sequential retry. Use the actual final price **$3.329403079313** and linked
  receipts in [the acceptance report](../research/reports/sequential-delivery-retry-2026-11-14.json).
  These positions belong to the project service account, not the connected user;
  do not expect them to appear in the user's Portfolio or claim that the user
  signed these redemptions. Older rejected cases remain unresolved.

## Recording sequence (about three minutes)

1. **Trade:** show the live NEAR price, select an open market and choose Upside.
   Hover the payout chart to explain the possible payout and maximum purchase
   loss. The chart is a scenario, not an executable sell price.
2. **Buy:** enter a small quantity, choose Review trade, review the fresh maker
   offer and approve in the wallet. Stay on the page while receipt confirmation
   updates the position. Open the explorer link to show the actual transaction.
3. **Position and sell:** show the position table, choose Sell, review a newly
   funded offer and sign. Demonstrate the confirmed balance/position change.
4. **Pair primitive:** from Portfolio use Create a pair, then Merge pairs. Explain
   that equal quantities of both sides can be recombined into their NEAR backing;
   a single side alone cannot use this exit. Use real receipts, not animations.
5. **Withdraw:** from Funds withdraw a small available amount to the connected
   account. Show the successful transfer/callback in Activity.
6. **Settlement:** the new-profile project-account lifecycle now has real evidence.
   Show `acceptance-20261114-timely` in History, its immutable expiry, final
   price and external historical evidence. Open the actual redemption and
   withdrawal explorer receipts from the acceptance report. Describe this as a
   project-account test. A separate connected-wallet claim still needs a real
   holding in a finalized series; do not simulate one.

The two makers are project-operated. Do not describe them as independent market
participants or imply guaranteed liquidity. Do not call the internal claims
standard wallet tokens, or the app production-ready/audited. The old rejected
settlement cases remain visible evidence; they are not silently repriced.

## Historical local rehearsal (not the current public recording script)


This is the G9 acceptance narrative. [REL-01](RELEASE.md) now provides an executable
local walkthrough, clean-checkout rehearsal and explicitly scoped evidence map.
It includes a real CLI payout while the frontend HTTP server is offline. Keeper
and payout-fault scenarios run in separate fixtures; crash/loss evidence comes
from the synthetic economics experiment. Public testnet acceptance remains open.
APP-02 has a disposable local
Sandbox UI with two makers, real oracle and PostgreSQL; start it with the commands
in [README](../README.md) and follow [APP](APP.md). It is not a public-wallet or
complete public release demo. DEM-01 has [retained local restart](LOCAL_DEMO.md).
The local rehearsal uses a temporary working-tree snapshot committed and cloned
only inside its private test workspace; it does not certify an already published
release commit. Read the generated acceptance map before claiming any step complete.
The [retained REL-01 report](../research/reports/rel01-local.md) records 109 passed
local checks and the exact public artifact digest; the public narrative remains
the acceptance target below.

Required modes are local Sandbox and faucet-funded testnet with real receipts.
Optional live-data observation cannot settle claims or replace demo fixtures.
No paid API key is required. Keep prefunded demo accounts and a local fallback
for faucet/RPC outages. Show **DEMO ORACLE — SYNTHETIC PRICES**, test assets,
public balances/history, test signer/admin authority and maker subsidies.

1. Connect a fresh test wallet and fund storage/gas separately.
2. Deposit test NEAR, split a P/N pair and show the series reserve.
3. Transfer/sell N to another account using a funded quote.
4. Acquire the proportional P basket and mint vault shares.
5. Execute a bounded roll into another approved series using competing makers.
6. Inject a labelled crash; show tracking loss and conserved collateral accounting.
7. Remove liquidity; show ROLL_DEFERRED and an in-kind exit.
8. Propose a committed observation, challenge, finalize and redeem both legs.
9. Demonstrate failed and UNKNOWN withdrawals using deterministic fault fixtures;
   label these fixtures distinctly from successful live testnet receipts.
10. Withdraw redeemed test NEAR and reconcile all custody categories.
11. Restart UI/indexer; recover with CLI and prove valid exits work without hosting.
12. Run the stress report; separate solvency from tracking, delay and liquidity risk.

Record evidence, scenario seed/hash, source/Wasm/config/deployment hashes and
costs. Fresh-clone reproduction is required. Package a locally runnable UI,
walkthrough, limitations, architecture and research attribution. Submission track
is `open`; do not claim audit, explorer verification or production readiness
without evidence. Prepare public-post/form text separately; posting/submitting
requires the user's instruction.

# Demo acceptance narrative — public release pending

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

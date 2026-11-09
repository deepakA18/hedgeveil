# Open Innovation submission draft — not submitted

**Project:** Hedgeveil

**Track:** `open` — Open Innovation

**Pitch:** Options-backed index exposure on NEAR: fully collateralized
complementary claims, transparent settlement, funded RFQs and an experimental
tracking-vault prototype.

**Implemented engineering:** native NEAR custody with separate storage/operating
funds; public internal P/N ledger; signed all-or-nothing funded trades; committed
synthetic settlement with disputes; proportional in-kind basket issuance/exits;
Sandbox-only one-shot keeper guards; exact-integer SDK, durable receipt recovery,
PostgreSQL reconciliation and a local browser desk. The local rehearsal exercises
two funded makers and a real CLI exit while the frontend is offline.

**Economic result:** the frozen synthetic research experiment selects no passing
rolling strategy. Collateral conservation does not guarantee a peg, principal
protection, liquidity, honest prices or tracking performance. Maker capital and
prices are explicitly synthetic/subsidized. Local maker processes and oracle
roles share one test operator and are not independent production actors.

**Current evidence:** use the generated package's `evidence/acceptance.json`,
receipt reports and source/artifact manifest. Sandbox receipts are real local
execution, not public testnet receipts. The toolkit uses an internal ledger;
complete token-standard conformance is not claimed. Independent review and
production readiness are not claimed.

**Research attribution:** this implementation builds on the options-based index
asset construction discussed in
[Building index-tracking assets on top of options instead of debt](https://ethresear.ch/t/building-index-tracking-assets-on-top-of-options-instead-of-debt/25036).
The implementation plan records the original discussion and critiques. Hedgeveil's
contribution is the NEAR accounting, execution, settlement, recovery and economic
evaluation work; it does not claim invention of the underlying construction.

**Still required before submission:** an actual public repository/release commit
URL, public wallet/testnet demo and deployment/receipt links, review disposition,
the unresolved policy scope decision, and a walkthrough video URL. No placeholder
deployment URL is presented as live. Fill these fields only with verified records.

## Draft public post

> Building Hedgeveil: a NEAR prototype for collateral-backed P/N claims, funded
> quotes and transparent settlement. Our local demo uses labelled synthetic prices
> and shows in-kind exits plus CLI recovery when the frontend is down. The stress
> results also show why solvency is not the same as tracking performance. Public
> wallet/testnet acceptance and independent review are still in progress.

This is draft copy only. Posting, submitting forms or publishing artifacts requires
the user's separate instruction. The local rehearsal does none of those actions.

# Public data and ordinary secret handling

The Open Innovation revision removes confidential balances, private AI and
shielded transfers from scope. This document replaces the prior privacy matrix;
it makes no anonymity or amount-confidentiality promise.

| Information | Treatment |
|---|---|
| Accounts, balances, P/N positions, transfers and fills | Public on-chain |
| Series, reserves/supplies, prices, challenges and oracle evidence | Public on-chain or published evidence |
| Vault holdings, shares, policy, rolls and entry/exit amounts | Public |
| Deposits, withdrawals, tickets, fees and receipt history | Public |
| RFQs and maker quotes | Ordinary authenticated transport; no encrypted-RFQ guarantee |
| Wallet/maker/test signer secrets, local credentials | Remain outside committed source, public APIs, browser analytics and logs |

The indexer may store public chain-derived positions and trade history, with
finalized receipt links and replayable cursors. It is not custody authority.
Do not request real financial documents for the demo. No AI conversation,
attestation badge or special AI-retention infrastructure is part of the release.
Use HTTPS where appropriate, safe client dependencies and normal secret hygiene.
The ignored local `.env` and `.local` state remain user-managed; old credentials
are not required or consumed by active build/test commands.

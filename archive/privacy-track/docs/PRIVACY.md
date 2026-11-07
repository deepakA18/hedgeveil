# Privacy boundary v0.1

Status: requirements, not implemented guarantees. No private balances or verified
inference exist in this baseline.

| Data | Intended visibility | Boundary / leak |
|---|---|---|
| Spend/view keys, openings, witnesses | Local device and user backup | Never sent to AI, relay or hosted prover; compromised client can steal them |
| Financial profile, AI output | Client and accepted encrypted TEE path | Device/TEE trust; current path and retention need verification |
| P/N/collateral/share ownership and internal amounts | Note recipients | Commitments/proofs must hide them; traffic and small anonymity sets still leak |
| Series, strikes, maturity, action type, final result | Public | Not claimed secret |
| Roots, nullifiers, output commitments/ciphertexts | Public | Timing and transaction structure; ciphertext availability required |
| Deposit / withdrawal | Public account, amount, timing | Funding correlation; direct submission reveals submitting account |
| RFQ limits and amounts | Selected makers | Relay sees routing metadata; counterparties know executed trade |
| Vault inventory, supply, policy, join/exit deltas | Public | Individual flow amounts/linkage can be inferred; shares alone have private ownership |
| Fees and recipients in public inputs | Public | Correlation and fee fingerprinting |
| IP, RPC calls, size, timing | Network providers / relayers | Relaying is optional, not anonymity proof |

No public per-user balances, spent leaf indices, note openings, or exact
per-series supply/reserve deltas for internal private operations. Do not put them
in calldata, errors, receipts, logs or public analytics. Private-state visibility
must be audited at all these surfaces, not just a frontend view.

Server persistence permits public chain data and bounded-lived RFQ ciphertext.
It excludes plaintext financial profiles, AI conversations, note ownership,
openings and witnesses. Disable payload tracing, session replay, disk spooling,
request caching and sensitive error reporting. Client-held backup and persistent
public ciphertext are intentional exceptions to application no-retention.
Maker-local retention and provider TEE caches need separate disclosure.

AI assurance must separately report hardware/nonce, measurement policy,
encryption key binding, gateway/model response binding and any endpoint binding.
Each status is pass/fail/unavailable. Missing evidence and gateway-only checks
cannot imply model verification. No badges are implemented in this increment.


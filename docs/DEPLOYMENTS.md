# Deployment records

There are **no active Open Innovation deployments**. `deploy/deployments.json`
is the empty active registry. Example configs are disabled planning templates;
no deployment loader or contract currently consumes them. Mainnet stays disabled.

The historical noncustodial verifier deployment is preserved in
[the privacy-track archive](../archive/privacy-track/README.md). Its account and
Wasm must never be used as the current clearinghouse, oracle or token deployment.
No chain state or access key was changed by this repository reconciliation.

G1 must pin a tested SDK/Sandbox/client/toolchain combination. Each later release
record must include network and contract identities, source commit, compiler and
dependency locks, Wasm SHA-256, actual deployment receipt/transaction, public
access-key inventory and permissions, oracle/policy config hashes, initial caps,
storage/operating allocation and test evidence. Never commit secret keys.

SDK/services must reject network/contract mismatches. Sandbox, faucet-funded
testnet and optional observation-only live data need isolated configuration.
Testnet may retain disclosed upgrade keys; block upgrades with unsettled
operations. A missing upgrade method is not evidence of immutability: audit the
actual full-access/deploy/delete/transfer authority before a production claim.
New core versions require opt-in migration and preserve active series terms.

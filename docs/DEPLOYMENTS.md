# Deployment records

There are **no active Open Innovation deployments**. `deploy/deployments.json`
is the empty active registry. G1/G3/G4/G5 create temporary local Sandbox deployments,
record receipts/artifact hashes and remove the node after each run; these are
not persistent testnet/product deployments. Example configs are disabled planning templates;
no deployment loader or contract currently consumes them. Mainnet stays disabled.

The historical noncustodial verifier deployment is preserved in
[the privacy-track archive](../archive/privacy-track/README.md). Its account and
Wasm must never be used as the current clearinghouse, oracle or token deployment.
No chain state or access key was changed by this repository reconciliation.

G1 pins its local SDK/Sandbox/client/toolchain in `research/g1` and
`tests/sandbox`; `contracts` pins the same SDK/toolchain for the G3 core and G4
oracle. Their runners query storage byte cost from the node and pin it in initialization.
The normal core has no upgrade method; raw full-access deployment authority still
exists in Sandbox and is not constrained by contract-level pause flags. Each later public release
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

The G4 oracle is a separate contract using `demo-v1` and predetermined synthetic
observations. Its registrar, six publisher accounts and adjudicator are local test
roles under one operator. There is no production historical-source deployment.
The G4 workspace lock change adds only the new oracle package; the clearinghouse
Wasm at that recorded revision is identical to the G3 artifact. Original G3 source manifests remain evidence
for their recorded revision; G4 records the updated workspace manifest separately.

G5 changes the clearinghouse state layout to retain maker registries and their
separate storage allocation. It runs on fresh ephemeral accounts only; there is
no migration from G3/G4 state. The normal/fault artifact hashes and complete G3
regression on the new binary are recorded in [G5 evidence](../research/reports/G5_FUNDED_MARKET.md).
Historical receipt manifests are preserved, not relabeled as tests of the new
artifact. Both maker account keys and separate RFQ keys are ephemeral and remain
in memory; only public keys and signatures are evidence. No testnet deployment
or production authority claim follows from these local runs.

G6 VLT-01 adds optional vault state and again requires fresh core deployment.
The contract rejects experimental vault creation in a testnet domain. Local
G6 receipts and G3/G5 regressions are saved in new reports; historical reports
and the empty active deployment registry are preserved. No strategy is approved
and no keeper is enabled by this accounting increment.

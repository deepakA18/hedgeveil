# Threat model v0.1

Assets: collateral custody; spend authority; confidential financial data; note
availability; immutable finalization; recoverable exits; truthful AI evidence.
Trust boundaries are the user device, proof verifier/setup, chain runtime,
historical oracle, selected makers, public vault policy, accepted TEE route, and
client/artifact distribution. AI has no signing, settlement or allocation authority.

| Adversary / failure | Required defense | Evidence gate |
|---|---|---|
| Malicious spender forges ownership or values | Membership + key knowledge, deterministic nullifier, range constraints | G1-ZK / G4 adversarial witnesses |
| Replay / malicious relayer changes network or recipient | Domain, action, output, fees, expiry and state binding | Cross-domain/substitution/stale-root tests |
| Malicious payer emits undecryptable output | Proved encryption or reviewed recipient acknowledgment | G1-ZK output recovery |
| Verifier or setup compromise drains shared pool | Reviewed circuits, setup provenance, immutable artifact hashes, caps | Independent review of shipped artifacts |
| RPC/indexer omits or lies about records | Public rescan, authenticated chain data, retained old artifacts | Clean-device and direct-exit recovery |
| Maker front-runs fill/cancel or withholds liquidity | Funded lock, atomic proof, single nullifier, bounded all-or-nothing order | G5 race/no-fill tests |
| Oracle lies, loses history, or stalls | Precommitted historical evidence, independent sources and dispute policy | G1-OPS reproducible old observation; delayed resolution |
| Successful payout loses callback | Quarantine unknown outcome; authenticated outcome; one refund only | Success/callback-failure and failure/retry injection |
| Vault keeper changes policy or consumes user assets | Public constrained aggregate execution, in-kind exit | Rounding, donation, no-bid and stale-state tests |
| Model/provider/evidence attacker | Verify complete pinned encrypted route, exact response bytes and signer | G1-AI live result plus negative evidence cases |
| Prompt injection in profile | Treat content as data; no tools; deterministic constraints; user approval | Fictional malicious-profile tests |
| Compromised frontend / third-party script | Supply-chain control, CSP, local key isolation, reproducible distribution | G8 client review; encryption alone is insufficient |
| Observer correlates funding, traffic, tiny vault batches | Explicit disclosure, bounded shapes, metadata minimization | Public surface audit; no universal anonymity claim |

Anonymity against global traffic analysis, protection after endpoint key theft,
guaranteed dollar value, continuous liquidity and a universally available emergency
exit after arbitrary verifier compromise are not provided. Testnet functionality
is not evidence of production economic security.


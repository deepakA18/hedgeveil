# Archived privacy-track experiment — not active product scope

The Open Innovation revision in [the current plan](../../IMPLEMENTATION_PLAN.md)
supersedes this entire directory. It preserves previous source, specs, tests,
proofs, attestation evidence and deployment records for historical reference.
Its G1-AI/G1-ZK tasks and credentials are no longer release requirements.

The root Cargo workspace excludes this independent historical workspace. Active
test/demo commands must not import its libraries, run its scripts or request its
credentials. `ORIGINAL_README.md` contains historical commands, not current setup
instructions. Relative paths inside the snapshot are relative to this directory.
No `.env`, spend/testnet key, `.local` state or build target was copied here.

`snapshot-sha256.json` records the original bytes of the source/evidence files
captured during migration. Source and artifact manifests retain their original
paths relative to this snapshot. The old implementation plan was recovered from
the repository's base commit; the revised root plan remains authoritative.

The historical verifier account `hv-zk-fcc9e3e143585953.testnet` is a noncustodial
experiment, not a clearinghouse, oracle or share token. Archiving does not delete
that on-chain deployment or revoke its locally held test key. No current runtime
configuration points at it. Its timing/gas results do not establish public-core
feasibility, token compatibility, collateral safety or completion of the new G1.

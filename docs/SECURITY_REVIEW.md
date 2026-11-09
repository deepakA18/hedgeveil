# SEC-02 review handoff

9 November 2026. The local review package is prepared. **Independent review,
finding disposition and release approval are pending.** This package does not
complete SEC-02, G8 or G9. No reviewer has been assigned or contacted.

## Candidate and integrity

The first package pins existing commit
`544192849af2ad63bf995b25ea8b675402a5bede`. It contains 253 committed active
source/document/evidence files, two normal Wasm contracts, four fault/test
artifacts, a handoff and an embedded verifier: 261 files plus the manifest.
The new packaging tool and this documentation are preparation work outside that
candidate commit; the tool's bytes are included separately under `tooling/`.
Later source commits require a new package and digest.

The local output is `target/reviews/sec02-544192849af2/`. Its manifest SHA-256 is:

```text
3b2e2dff75c540803a49134d85f9aa2eec5281ff052faf51d0209e42b3e0e50b
```

Keep this digest independently of the bundle when handing it to a reviewer.
Hashes detect changes relative to that trusted digest; they do not authenticate
who supplied it or prove that tests, dependencies or contracts are correct.
The bundle stays under ignored `target/`; public preparation metadata is in
[sec02-preparation.json](../research/reports/sec02-preparation.json).

```sh
python3 scripts/build-core.py
python3 scripts/build-oracle.py
# Use a new output path; existing packages are never overwritten.
python3 verification/review_bundle.py create --commit 544192849af2ad63bf995b25ea8b675402a5bede --out target/reviews/sec02-copy
python3 verification/review_bundle.py verify target/reviews/sec02-copy --sha256 3b2e2dff75c540803a49134d85f9aa2eec5281ff052faf51d0209e42b3e0e50b
python3 -m unittest discover -s tests/security -v
```

The digest reproduces with the same committed snapshot, artifact bytes and
packaging tool bytes. After changing the tool, use its newly generated digest.
The embedded `tooling/review_bundle.py verify` command also works without Git,
Node, the original workspace or network access. Creation needs Git and already
built artifacts; it does not deploy, sign transactions or contact a reviewer.

The generator reads selected regular blobs from the specified Git commit and
checks compiled worktree inputs against that commit. It rejects modified or
untracked compiled inputs, stale SEC-01 source/report/query/artifact hashes, and
a normal oracle without matching recorded-input evidence. It keeps the six
Wasm files under `wasm/normal/` or `wasm/fixtures/`. Normal contracts have been
rebuilt and checked to exclude fault exports; their hashes match prior evidence.
No fresh Sandbox execution is claimed for this packaging increment.

Environment files, local wallets, native node/database state, dependency caches,
the Git directory and `archive/privacy-track/` are excluded. `.env.example` is
included as the public configuration template. A limited private-key-content
guard rejects PEM private keys and key-labelled NEAR private-key strings. Public
receipt signatures are preserved. This guard is **not a comprehensive secrets
audit**; reviewers must inspect committed source and dependencies themselves.

The manifest inventories 22 reports with source bindings: eight match their
recorded inputs, and fourteen have historical source/artifact differences.
Matching inputs do not establish complete candidate coverage or independent
review. Original reports remain byte-for-byte unchanged. The SEC-01 summary,
three stateful runs, model report, symbolic report and every retained SMT query
must form a consistent hash graph.

Verification requires the external manifest digest and rejects altered/missing/
extra files, traversal paths, symlinks, nonregular files and approval claims.
Existing destinations are preserved. Integrity is checked at invocation time;
reverify before using a transferred package. Do not execute untrusted tooling
merely because it arrived inside a bundle.

## Independent review scope

Dependencies: SEC-01, committed candidate source, rebuilt normal/fault Wasm and
retained G3–G7 evidence. Invariant: review claims and remediation must refer to
the exact bytes reviewed. Failure path: any changed input invalidates the package
or creates a new candidate; no stale approval can authorize deployment.
Reviewer: independent security reviewer **pending**.

| Review area | Starting points | Required challenge |
|---|---|---|
| Custody and asynchronous payouts | `accounting.rs`, `withdrawals.rs`, `events.rs`, oracle credits | Storage/operating isolation, actual transfer versus callback outcome, UNKNOWN quarantine, single restoration and account deletion |
| Settlement | `series.rs`, oracle `lib.rs`, `lifecycle.rs`, `types.rs` | Authentication, immutable configuration, source commitments, deadline boundaries, arbitration failure and stale import callbacks |
| Trading and authorization | `rfq.rs`, signing codec, maker worker | Exact signed domains/fees, shared inventory, nonce/epoch/key consumption, cancellation orderings and restart nonce retention |
| Basket and keeper | `vault.rs`, `keeper.rs`, planner | Rounding, first/last holder behavior, donations, in-kind exits, authority, freshness, fee/loss bounds and deferred actions |
| Application boundaries | SDK journal/receipt classifier, indexer, web gateway, demo workspace | Unknown attempts, signer/network binding, provider failures, durable state, API authorization and local-key custody |
| Verification/build/deployment | `verification/`, lockfiles, build scripts, deployment records | Model assumptions and exclusions, solver boundaries, untested concurrency/load, reproducible Wasm, actual access-key/upgrade authority |

The review must distinguish local synthetic Sandbox behavior from public-wallet,
testnet and production acceptance. A build or integrity check cannot close the
economic-policy, source-independence, recovery or release gates.

## Findings and remediation records

No finding list or sign-off has been supplied. Do not interpret `NOT_SUPPLIED`
as zero vulnerabilities. Keep reviewer output outside the immutable bundle and
record:

1. Reviewer identity, independence, date, exact commit and external bundle digest;
   normal Wasm hashes, scope, exclusions and methods used.
2. Each finding's stable ID, reviewer-assigned severity, affected paths/invariant,
   impact, preconditions, reproduction and expected versus actual behavior.
3. The remediation commit and new Wasm hashes, any required SPEC change before
   financial behavior changes, and regression command/evidence hashes.
4. Reviewer retest and disposition. An author declaring a fix is not independent
   closure. Unresolved critical/high findings block the G8 exit decision.
5. An explicit scoped review conclusion; public deployment/authority evidence and
   broader G7–G9 gates remain separate. Production stays disabled.

Any code change requires a new bundle. Retain the old digest, findings and
counterexamples so a reviewer can compare candidates and verify fixes.

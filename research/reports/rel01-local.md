# REL-01 local release rehearsal — 9 November 2026

**Local rehearsal passed; REL-01/G9 public release remains incomplete.** No
public deployment, independent sign-off, publication or submission occurred.

## Reproduction and scope

```sh
python3 scripts/rehearse-release.py run rel01-20261109-v2
```

The successful run used project base commit
`d305605f41727ccc4b55310a7ef12765a1861d92` plus the recorded working-tree inputs.
The runner committed those inputs only into a temporary repository, then made a
fresh local clone at temporary commit
`970d288ae1a2ca437da49ed4d12d1bdbbc0a01fc`. This is not a public release commit or
an independent developer's reproduction. Use a new name to rerun; existing
workspaces are preserved.

The checkout started without project dependencies, compiled artifacts, wallet
keys, journals or databases. Locked dependencies and normal/fault Wasm were built
there. Host download caches, toolchains and runtime/browser caches were available;
this is not a cold-machine or offline-install measurement. No paid API key or
public funds were used. The two maker processes and synthetic oracle roles share
one local operator; they are not independent economic actors.

[Result and twelve-step acceptance map](rel01-release.json) and
[source hashes and executed commands](rel01-provenance.json) pin 263 input files.
Subsequent status/report documentation describes this frozen run; it is not part
of its input snapshot. Historical reports remain unchanged.

## Measured evidence

| Local phase | Checks | Recorded execution | Evidence |
|---|---:|---|---|
| Same-deployment walkthrough | 18 | 40 transactions | [walkthrough](rel01-walkthrough.json) |
| Actual Chromium browser | 35 | 43 transactions | [browser](rel01-browser.json) |
| Experimental bounded keeper | 13 | 136 transactions, 119 events | [keeper](rel01-keeper.json) |
| SDK/CLI payout faults | 19 | 31 transactions, 31 events | [payout](rel01-payout.json) |
| Retained deployment restart | 24 | Four user-operation receipts | [resume](rel01-resume.json) |

All **109** checks passed. The walkthrough registers a fresh local signer,
separates storage funding from collateral, splits P/N, sells N against competing
funded quotes, mints and exits the basket after maker removal, disputes and
finalizes synthetic settlement, and redeems both claim legs. An actual failed
native withdrawal restores collateral. The HTTP listener then closes: fresh CLI
processes recover an actually sent deposit with a lost response, withdraw the
user's remaining free collateral and reject a duplicate send. Core and oracle
snapshots reconcile afterward. The separate fault suite keeps paid-but-
unacknowledged payouts UNKNOWN; timeout does not authorize restoration or resend.

The twelve-step map distinguishes these scopes: local generated signing is not a
public wallet; the bounded roll is a separate one-shot fixture; crash/loss is an
offline synthetic experiment, not an integrated browser crash injection; restart
uses another retained deployment. The frozen 9,180-case economics rerun still
selects no passing recurring policy. The testnet vault remains disabled.

Required reference/vector, locked Rust workspace, format/Clippy, generated-schema
and schema-test checks passed, as did finite models, 32 bounded SMT obligations,
economics tests and frozen scenarios. Nine release-package tests and 12 review-
bundle tests passed in the fresh checkout. Another 21 SDK/browser-model/retained-
state tests passed in the original working tree. All 59 archived source/evidence
checksums remain unchanged. These checks are not independent security review.

## Fresh-checkout defects corrected

The first run, `rel01-20261109`, failed and produced no successful release result
or package. Its longer checkout path exceeded the PostgreSQL Unix-socket path
limit. Local test databases now disable Unix sockets and use the existing
loopback TCP clients. The runner also requires a passed, nonempty evidence file
before declaring a runtime phase successful; exit status zero alone is
insufficient.

The source allowlist also omitted `services/indexer/schema.sql`, preventing a
fresh retained demo from starting. SQL sources are now included and covered by
a regression check. The synthetic PEM marker in the secret-guard test is built
from two strings so that packaging the test source does not falsely identify it
as a private key; its runtime rejection assertion remains intact. Existing
SEC-02 packages are historical and must be regenerated for a new candidate.

## Public artifact integrity

The designated artifact is
`target/releases/rel01-20261109-v2/hedgeveil-local-rehearsal.tar.gz`: 5,055,069 bytes,
278 manifest-listed files plus the manifest. It contains selected source,
public evidence, provenance, draft submission text, two normal Wasm contracts and
four separately labelled fault/test artifacts. Native state, generated signer
keys, logs, environment files, dependency caches and the historical archive are
excluded. Never publish the enclosing private rehearsal workspace.

```sh
python3 scripts/rehearse-release.py verify target/releases/rel01-20261109-v2/hedgeveil-local-rehearsal.tar.gz --sha256 bb23ae359ed21ed6c3b210be879c8bdcd519580dbc9f84598a7f5170a91acb27
```

Verification passed without extracting. The source-map digest is
`84ee014cd69f64d25c772bf79b50a90c835d388f22c09aa4e334b08fc8bafac7`.

| Normal artifact | Bytes | SHA-256 |
|---|---:|---|
| Clearinghouse | 614,677 | `34ae13f042db69af989636d398189cb1f78ca6539b1a24d90f914af7d65a6736` |
| Settlement oracle | 384,252 | `d90a3a7db53f3939e3971407fdf07f33bfde30fa5a69fef8536c0045fd2e0049` |

## Remaining acceptance

Public wallet/testnet conformance and lifecycle receipts, actual deployment and
access-key/upgrade-authority records, the policy scope decision, independent
SEC-02 findings/disposition, a published-candidate reproduction and a walkthrough
video remain pending. Production remains disabled. The submission and public
post are drafts only; see [release usage](../../docs/RELEASE.md) and
[submission draft](../../docs/SUBMISSION.md).

Dependencies: available G7/G8 local implementations, DEM-01 and pinned runtimes.
Invariant: evidence describes actual execution within its recorded scope, without
promoting local tests to public release approval. Failure paths: missing phase
evidence, source drift, invalid package, unknown outcomes or unmet public gates
leave acceptance open. Reviewer: Release/QA and independent security reviewer —
pending; no sign-off supplied.

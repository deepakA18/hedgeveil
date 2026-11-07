# Open Innovation scope reconciliation

Date: 7 November 2026. Authority: the user's revised root
[IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md), SHA-256
`e5732bf358b474893777abc67c9149113759f36550ac5001faf9fedb76e4a623`.
The user's plan was preserved; this change aligns the repository with it.

| Previous work | Disposition | Revised scope / remaining evidence |
|---|---|---|
| Rational payoff model, checked Rust library, 565 vectors | Retained byte-for-byte | FIN-01 baseline; full economic simulation and independent review remain |
| Confidential note/proof-input schema v0.1 | Archived and replaced | Public transaction/quote/event/withdrawal draft v0.2 with strict offline validation |
| Real proof generation, circuit/setup fixtures and verifier | Archived with source/artifacts | Excluded from active workspace and new G1; no cryptographic privacy claim |
| Historical noncustodial verifier deployment and measurements | Preserved only as historical evidence | No current product deployment; old gas measurements do not estimate the new core |
| AI client/completion tooling, attestation evidence and tests | Archived | No AI API keys, completion, TEE or retention gate in active workflow |
| Old SPEC, threat/privacy model, status and assumptions | Archived originals; rewritten active versions | Public accounting, atomic funded RFQs, proportional baskets, oracle authentication and payout quarantine |
| Old setup and release gates | Replaced | No-paid-key local/testnet boundary; G9 hackathon complete, G10 pilot/G11 expansion separate |
| Future tasks and runtime setup | Reconciled | All 20 plan epics, four G1 tasks, reviewer/evidence/dependency fields; disabled deployment templates and future-session instructions |

The archive has its own historical Cargo workspace, original README and base
commit's earlier plan. Its checksum manifest covers 59 original source/evidence
files. Do not use its commands as current setup. Active Cargo metadata contains
only `payoff-math`. Existing `.env` and private local state were not rewritten or
copied. No deployment, key revocation, inference, transfer or public post occurred.

## Validation performed

- `python3 -m unittest discover -s research/reference-model -p 'test_*.py' -v`:
  all five financial tests passed.
- `python3 research/reference-model/generate_vectors.py --check`: 565 vectors
  reproduced byte-for-byte.
- `cargo test --workspace --locked --offline`: two unit tests and the shared
  differential test passed; no contract-Wasm claim.
- `cargo fmt --all -- --check` and
  `cargo clippy --workspace --all-targets --locked --offline -- -D warnings`: passed.
- `UV_CACHE_DIR=/private/tmp/hedgeveil-uv-cache uv run --offline --with jsonschema==4.23.0 python -m unittest discover -s tests/schemas -v`:
  all nine public-schema groups passed.
- `python3 packages/shared-schemas/build_schema.py --check`: schema reproducible.
- Archive integrity: all 59 SHA-256 entries match; financial source/vector bytes
  match the archive; no `.env` or `.local` directory was copied.
- Deployment JSON parses; all three example configs are disabled templates;
  active registry is empty. Cargo metadata excludes the archive.

The installed dependency cache allowed offline verification. A fresh checkout
still needs ordinary dependency downloads; it does not need paid API credentials.
This validates the reconciled foundation, not the unimplemented contracts, market,
oracle, vault, application or production safety. See [STATUS](../../docs/STATUS.md)
and [BACKLOG](../../docs/BACKLOG.md) for remaining work.

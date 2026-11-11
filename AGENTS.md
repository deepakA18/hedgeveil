# Working on Hedgeveil

Read `IMPLEMENTATION_PLAN.md`, `docs/STATUS.md` and the relevant ticket in
`docs/BACKLOG.md` before implementation. The root plan is authoritative; update
status and acceptance evidence as work lands. Planned is not implemented/reviewed.

- Target Open Innovation (`open`): public native NEAR collateral, P/N claims,
  funded all-or-nothing RFQs, one transparent tracking vault and versioned oracle.
- Preserve rational/Rust payoff agreement and shared units/statuses. Revise
  `docs/SPEC.md` before changing financial behavior.
- `archive/privacy-track/` is historical evidence, excluded from active builds.
  Do not use its commands, dependencies, credentials or gates for current work.
  Preserve archived evidence and its checksum manifest.
- Core development and deterministic tests must work locally without paid API keys.
  Public testnet/release requires authenticated external market data and real
  receipts; synthetic prices and fixed fixture maker marks are test-only. Missing
  live data blocks the affected action; never substitute fixtures or mock success.
- Separate storage/operating funds from collateral. UNKNOWN payouts remain
  quarantined; timeouts never authorize refund or resend.
- Use an internal ledger until complete token interfaces and callback semantics
  pass conformance tests. Do not claim standards support from stubs.
- G9 completes the hackathon release; G10 production and G11 expansions are
  separate. Keep production disabled and historical deployments separate.
- Never print/commit `.env`, `.local` keys or wallet secrets. Preserve user
  settings; document configuration names/defaults in `.env.example` only.
- Run relevant reference/vector checks, locked workspace tests, format/Clippy
  and schema tests from README. Regenerate schemas via `build_schema.py` and
  verify with `--check`. Add compiled-Wasm/Sandbox evidence as contracts land.
- Every task needs dependencies, invariant, failure path, evidence and reviewer.
  Independent review stays pending until supplied; never invent sign-off,
  market observations, benchmarks or deployment records.

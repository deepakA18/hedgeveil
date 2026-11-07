# G1 initial measurement budgets

Frozen before accepting the first benchmark results on 7 November 2026.
These are developer-spike limits, not production or browser feasibility claims.

| Measurement | Initial budget |
|---|---|
| Depth-20, one-input/one-output note-spend proof | <= 60 seconds native proving, excluding setup |
| Local process peak resident memory | <= 4 GiB on the named development machine |
| Uncompressed proof / public inputs | <= 512 / 1,024 bytes |
| Verifier Wasm | <= 2 MiB |
| Valid deployed verifier call | <= 250 Tgas, and below the observed runtime limit |
| AI preflight age at submission | <= 180 seconds; never allow more than 300 |
| AI completion / signature retries | One completion, at most three signature reads |

Record device, toolchains, circuit and artifact hashes, setup method, actual
runtime configuration and receipt gas. A native verifier result does not establish
NEAR host compatibility. No resource result for this 1→1 circuit extrapolates to
four-input joins, funded trades or the largest vault transition. Freeze budgets
for those circuits and a named browser device before accepting G1-ZK in full.

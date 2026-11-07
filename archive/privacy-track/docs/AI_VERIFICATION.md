# Encrypted AI feasibility

The local CLI supports the NEAR Ed25519 E2EE v2 path with one fictional profile.
No hosted relay, UI badge, transaction signing or financial authority is added.
The complete G1-AI gate requires an actual encrypted completion and its accepted
evidence; offline tests and public hardware reports alone cannot satisfy it.

## Sources and reviewed integration choices

Read the official [near-ai-cloud skill](https://github.com/near/agent-skills/blob/main/skills/near-ai-cloud/SKILL.md)
and reviewed `nearai-cloud-verifier` at commit
`94554726fd548676842b7ea603a8173a60c31341`. Its walkthrough prints some unsuccessful
checks without rejecting and decodes GPU JWTs without signature validation.
It is not used as our acceptance wrapper. This implementation uses pinned
`dcap-qvl` 0.3.12 for quote/collateral cryptography and explicit application policy
checks based on the current [quote/nonce/signer rules](https://docs.near.ai/cloud/verification/reference/quote-nonce-signer).

Encryption uses PyNaCl/cryptography primitives implementing the documented
[Ed25519 E2EE v2 format](https://docs.near.ai/cloud/guides/e2ee-chat-completions).
NVIDIA JWT validation uses PyJWT, a fixed NVIDIA JWKS endpoint, ES384, issuer and
time checks, nonce binding, the overall verdict, detached-token digests and every
GPU token's signature/nonce/measurement/secure-boot/debug claims. The
[NVIDIA claims reference](https://docs.nvidia.com/attestation/advanced-documentation/latest/claims-guide/gpu_claims.html)
distinguishes overall claims from detached GPU claims. No custom JWT or TDX parser
is implemented. Independent review of the glue code remains required.

## Commands

Requires uv and Python 3.12 (uv can manage the interpreter).

```sh
uv run --python 3.12 --with-requirements packages/ai-client/requirements.lock \
  python -m unittest discover -s tests/evidence-verification -v

# Public evidence only: no API key, prompt or inference charge.
uv run --python 3.12 --with-requirements packages/ai-client/requirements.lock \
  python scripts/inspect-ai-evidence.py z-ai/glm-5.3-flash

# After configuring a reviewed policy and local key:
uv run --python 3.12 --with-requirements packages/ai-client/requirements.lock \
  python scripts/verify-private-completion.py --policy .local/ai-policy.json --save-fictional-output
```

Use `policy.example.json` as the shape for `.local/ai-policy.json`. Set its
canonical model ID, allowed TCB statuses/advisories and reviewed gateway/model
measurement hashes. An empty allowlist fails. The inspection command reports
observed hashes without accepting them: **do not automatically trust a measurement
merely because a valid device produced it**. Review measured images/configuration
and their provenance before adding an entry. The measurement fingerprint hashes
MRTD, MRCONFIGID, RTMR0–3 in that order.

Put `NEAR_AI_CLOUD_API_KEY` in the ignored root `.env`, with `NEAR_AI_MODEL` matching
the policy's canonical model. The CLI reads values as data, never sources a shell
script, and does not print the key. The current public catalog includes the
candidate `z-ai/glm-5.3-flash`; future runs must recheck availability and compatibility.

## Acceptance and failure behavior

Fetch gateway and every returned NEAR model report before inference, with a fresh
32-byte nonce and explicit `provider=near`, `ed25519`, no aliasing and no TLS
fingerprint request. Verify DCAP, debug mode, nonce/signer binding, echoed report
data, complete configuration measurement, RTMR3 replay, applicable GPU evidence
and explicit measurement policy. The model encryption key must equal the
quote-bound Ed25519 signer. Missing or ambiguous candidates fail closed.

Encrypt the complete fictional prompt locally, preserve exact sent/received
bytes, pin the accepted key, disable streaming/tools, and request at most 256
output tokens. Fetch signatures with bounded retries. Apply the current
[signature classification rules](https://docs.near.ai/cloud/verification/cloud-api/response-signatures):
unknown kind, absent signature, altered bytes, wrong model/key/algorithm or ambiguous
preflight match fail. A gateway-only signature cannot pass the required
`provider_tee` policy. Same-key matching does not establish the same serving instance.

Only decrypt after response verification. Default output contains status and
ciphertext hashes/lengths, never the profile, conversation or key. The test suite
uses synthetic signing keys and quote-result objects explicitly as unit fixtures;
it does not fabricate a live verified result. The live CLI always invokes DCAP.
The optional `--save-fictional-output` flag writes the actual verified fictional
completion to a mode-0600 file under ignored `.local/ai-spike`, for local review.
It does not send that output to a server log or print it by default.

TLS endpoint attestation binding is **unavailable**, even though HTTPS certificate
validation is enabled. Gateway response binding remains unavailable on a model-
signed response. Do not combine these into a stronger model-to-gateway-to-client
chain claim. GPU service availability, hardware roots and the user's device remain
trust boundaries. Native libraries and managed buffers do not establish physical
erasure. Full proxy/browser/crash retention testing is still G7/G8 work.

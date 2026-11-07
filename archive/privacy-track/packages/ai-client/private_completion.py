"""Local-only NEAR AI feasibility check. Synthetic tests cannot pass the live gate."""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import struct
import time

import dcap_qvl
import jwt
import requests
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from nacl.bindings import (crypto_aead_xchacha20poly1305_ietf_encrypt,
                          crypto_aead_xchacha20poly1305_ietf_decrypt,
                          crypto_sign_ed25519_pk_to_curve25519,
                          crypto_sign_ed25519_sk_to_curve25519)
from nacl.signing import SigningKey, VerifyKey

BASE = "https://cloud-api.near.ai/v1"
NRAS = "https://nras.attestation.nvidia.com"
ROOT = Path(__file__).resolve().parents[2]
MEASUREMENTS = ("mr_td", "mr_config_id", "rt_mr0", "rt_mr1", "rt_mr2", "rt_mr3")


class Rejected(ValueError):
    """Messages are static codes; never include provider bodies or user payloads."""


def require(condition, code):
    if not condition:
        raise Rejected(code)


def parse_json(value):
    def pairs(items):
        result = {}
        for key, item in items:
            require(key not in result, "duplicate_json_key")
            result[key] = item
        return result
    def bad_constant(_):
        raise Rejected("nonfinite_json")
    return json.loads(value, object_pairs_hook=pairs, parse_constant=bad_constant)


def hex_bytes(value, size):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]+", value) is not None,
            "invalid_hex")
    require(len(value) == size * 2, "invalid_hex_length")
    return bytes.fromhex(value)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encrypt(plaintext, ed25519_public):
    recipient = crypto_sign_ed25519_pk_to_curve25519(ed25519_public)
    ephemeral = X25519PrivateKey.generate()
    shared = ephemeral.exchange(X25519PublicKey.from_public_bytes(recipient))
    key = HKDF(hashes.SHA256(), 32, None, b"ed25519_encryption").derive(shared)
    nonce = secrets.token_bytes(24)
    ciphertext = crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, None, nonce, key)
    return ephemeral.public_key().public_bytes_raw() + nonce + ciphertext


def decrypt(ciphertext, client_key):
    require(len(ciphertext) >= 72, "short_ciphertext")
    secret = crypto_sign_ed25519_sk_to_curve25519(bytes(client_key) + bytes(client_key.verify_key))
    shared = X25519PrivateKey.from_private_bytes(secret).exchange(
        X25519PublicKey.from_public_bytes(ciphertext[:32]))
    key = HKDF(hashes.SHA256(), 32, None, b"ed25519_encryption").derive(shared)
    return crypto_aead_xchacha20poly1305_ietf_decrypt(ciphertext[56:], None, ciphertext[32:56], key)


def replay_rtmr3(events):
    if isinstance(events, str):
        events = parse_json(events)
    require(isinstance(events, list), "missing_event_log")
    result = bytes(48)
    for event in events:
        if event.get("imr") != 3:
            continue
        payload = event.get("event_payload") or ""
        require(isinstance(payload, str) and re.fullmatch(r"(?:[0-9a-fA-F]{2})*", payload) is not None,
                "event_payload_encoding")
        value = hashlib.sha384(struct.pack("<I", event["event_type"]) + b":" +
                               event["event"].encode() + b":" + bytes.fromhex(payload)).digest()
        if event.get("digest"):
            require(hex_bytes(event["digest"], 48) == value, "event_digest_mismatch")
        result = hashlib.sha384(result + value).digest()
    return result


def measurement_id(quote):
    return digest(b"".join(hex_bytes(quote[field], 48) for field in MEASUREMENTS))


def check_bindings(report, quote, nonce, role):
    """Call only with a quote returned by DCAP verification, never raw decoded TDX."""
    require(report.get("signing_algo") == "ed25519", "unsupported_signing_algorithm")
    signer = hex_bytes(report["signing_address"], 32)
    require(not (hex_bytes(quote["td_attributes"], 8)[0] & 1), "debug_enclave")
    require(not report.get("tls_cert_fingerprint"), "unexpected_tls_binding")
    expected = signer + hex_bytes(nonce, 32)
    require(hex_bytes(quote["report_data"], 64) == expected, "quote_nonce_or_signer_mismatch")
    require(hex_bytes(report["request_nonce"], 32) == hex_bytes(nonce, 32), "echoed_nonce_mismatch")
    if role == "gateway" or "report_data" in report:
        require(hex_bytes(report["report_data"], 64) == expected, "echoed_report_data_mismatch")
    tcb = report["info"]["tcb_info"]
    if isinstance(tcb, str): tcb = parse_json(tcb)
    compose = tcb["app_compose"]
    require(isinstance(compose, str), "missing_raw_compose")
    expected_config = b"\x01" + hashlib.sha256(compose.encode()).digest() + bytes(15)
    require(hex_bytes(quote["mr_config_id"], 48) == expected_config, "configuration_mismatch")
    require(replay_rtmr3(report["event_log"]) == hex_bytes(quote["rt_mr3"], 48), "event_log_mismatch")
    if role == "model":
        require(hex_bytes(report["signing_public_key"], 32) == signer, "encryption_key_not_bound")
        crypto_sign_ed25519_pk_to_curve25519(signer)
    return {"role": role, "signer": signer.hex(), "signing_algo": "ed25519",
            "measurement_id": measurement_id(quote)}


def http(session, method, url, **kwargs):
    # No body logging, redirect following, payload caches, or sensitive errors.
    response = session.request(method, url, timeout=(10, 45), allow_redirects=False, **kwargs)
    require(200 <= response.status_code < 300, "http_" + str(response.status_code))
    require(len(response.content) <= 8*1024*1024, "response_too_large")
    return response


def verify_gpu(report, nonce, session):
    require(report.get("nvidia_payload"), "missing_gpu_evidence")
    payload = report["nvidia_payload"]
    if isinstance(payload, str): payload = parse_json(payload)
    require(hex_bytes(payload["nonce"], 32) == hex_bytes(nonce, 32), "gpu_nonce_mismatch")
    body = parse_json(http(session, "POST", NRAS + "/v3/attest/gpu", json=payload).content)
    require(isinstance(body, list) and len(body) == 2 and body[0][0] == "JWT", "invalid_nras_result")
    require(isinstance(body[1], dict) and body[1], "missing_gpu_tokens")
    # Fixed NVIDIA trust endpoint, never a key URL from a token header.
    keyset = jwt.PyJWKClient(NRAS + "/.well-known/jwks.json", timeout=15)
    verify_nras_tokens(body, nonce, keyset)


def verify_nras_tokens(body, nonce, keyset):
    def verified_claims(token):
        key = keyset.get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=["ES384"], issuer=NRAS,
                            options={"require": ["exp", "iat"]})
        require(claims.get("eat_nonce", "").lower() == nonce.lower(), "gpu_token_nonce_mismatch")
        return claims
    overall = verified_claims(body[0][1])
    require(overall.get("x-nvidia-overall-att-result") is True, "gpu_verdict_not_pass")
    require(isinstance(overall.get("submods"), dict) and set(overall["submods"]) == set(body[1]),
            "gpu_detached_set_mismatch")
    require(bool(body[1]), "missing_gpu_tokens")
    for name, token in body[1].items():
        require(overall["submods"][name] == ["DIGEST", ["SHA-256", digest(token.encode())]],
                "gpu_detached_digest_mismatch")
        claims = verified_claims(token)
        require(claims.get("x-nvidia-gpu-attestation-report-nonce-match") is True, "gpu_report_nonce_mismatch")
        require(claims.get("measres") == "success", "gpu_measurements_failed")
        require(claims.get("secboot") is True and claims.get("dbgstat") == "disabled", "gpu_boot_or_debug_policy")


async def verify_report(report, nonce, role, policy, session):
    # All hardware quote parsing, collateral validation and signatures stay in DCAP QVL.
    raw_quote = report["intel_quote"]
    require(isinstance(raw_quote, str) and len(raw_quote) <= 2*1024*1024, "quote_size")
    verified = await dcap_qvl.get_collateral_and_verify(bytes.fromhex(raw_quote))
    require(verified.status in policy["accepted_tcb_statuses"], "tcb_policy_rejected")
    require(set(verified.advisory_ids).issubset(policy["accepted_advisories"]), "unaccepted_advisory")
    quote = parse_json(verified.to_json())["report"]["TD10"]
    result = check_bindings(report, quote, nonce, role)
    if role == "model" or report.get("nvidia_payload"):
        verify_gpu(report, nonce, session)
    require(result["measurement_id"] in policy[role + "_measurements"], "measurement_not_accepted")
    return result


def verify_response(signature, request_bytes, response_bytes, model, gateway, candidates, selected_key):
    require(isinstance(signature, dict) and not signature.get("error_code"), "signature_unavailable")
    require(signature.get("signing_algo") == "ed25519", "unsupported_signature_algorithm")
    kind = signature.get("signature_kind")
    require(kind in ("gateway", "provider_tee"), "signature_kind_unavailable")
    signer = hex_bytes(signature["signing_address"], 32).hex()
    matches = [x for x in (candidates if kind == "provider_tee" else [gateway])
               if x["signer"] == signer and x["signing_algo"] == "ed25519"]
    require(len(matches) == 1, "ambiguous_or_unattested_signer")
    expected = digest(request_bytes) + ":" + digest(response_bytes)
    if kind == "provider_tee":
        expected = model + ":" + expected
        require(signer == selected_key, "response_key_route_changed")
    require(signature.get("text") == expected, "exact_bytes_mismatch")
    VerifyKey(bytes.fromhex(signer)).verify(expected.encode(), hex_bytes(signature["signature"], 64))
    return kind


def load_env():
    path = ROOT / ".env"
    if not path.exists(): return
    # Data-only dotenv reader. Never source shell commands or print file contents.
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"): continue
        name, separator, value = line.partition("=")
        name = name.strip()
        if separator and name in ("NEAR_AI_CLOUD_API_KEY", "NEAR_AI_MODEL"):
            os.environ.setdefault(name, value.strip().strip("\"'"))


async def run(policy, preflight_only=False, save_fictional_output=False):
    load_env()
    model = os.environ.get("NEAR_AI_MODEL") or policy["model"]
    require(bool(model) and "/" in model, "canonical_model_not_configured")
    require(policy["model"] == model, "policy_model_mismatch")
    require(policy["required_response_kind"] == "provider_tee", "model_binding_required")
    require(policy["gpu_verification"] == "nras_jwt", "gpu_policy_unsupported")
    require(0 < policy["max_preflight_age_seconds"] <= 300, "unsafe_preflight_age")
    key = os.environ.get("NEAR_AI_CLOUD_API_KEY")
    if not preflight_only: require(bool(key), "api_key_not_configured")
    require(policy["gateway_measurements"] and policy["model_measurements"], "measurement_policy_not_configured")
    session = requests.Session()
    session.trust_env = False
    session.headers.update({"Accept-Encoding": "identity", "Cache-Control": "no-store"})
    nonce = secrets.token_hex(32)
    started = time.monotonic()
    # Public evidence request sends no billing credential or financial content.
    body = parse_json(http(session, "GET", BASE + "/attestation/report",
        params=dict(model=model, provider="near", signing_algo="ed25519", nonce=nonce, include_tls_fingerprint="false"),
        headers={"x-no-aliasing":"true"}).content)
    require(body.get("gateway_attestation"), "missing_gateway_evidence")
    require(body.get("model_attestations"), "missing_model_evidence")
    gateway = await verify_report(body["gateway_attestation"], nonce, "gateway", policy, session)
    candidates = []
    for candidate in body["model_attestations"]:
        candidates.append(await verify_report(candidate, nonce, "model", policy, session))
    selected_key = candidates[0]["signer"]
    require(sum(x["signer"] == selected_key for x in candidates) == 1, "ambiguous_model_key")
    require(time.monotonic()-started <= policy["max_preflight_age_seconds"], "stale_preflight")
    result = dict(mode="live", policy_version=policy["version"], model=model,
                  hardware_nonce="pass", measurements="pass", encryption_key_binding="pass",
                  gateway_response_binding="unavailable", model_response_binding="unavailable",
                  endpoint_binding="unavailable", completion="not_requested")
    if preflight_only: return result
    client = SigningKey.generate()
    profile = parse_json((ROOT / "fixtures/fictional-finances/saver.json").read_bytes())
    require(profile.get("fictional") is True, "fictional_input_required")
    prompt = ("Explain this fictional hedge scenario without external tools. Do not execute actions. "
              "Discuss the collateral cap and delayed settlement. Profile data: " + json.dumps(profile))
    encrypted = encrypt(prompt.encode(), bytes.fromhex(selected_key)).hex()
    request_bytes = json.dumps(dict(model=model, messages=[dict(role="user",content=encrypted)],
                                   stream=False, max_tokens=256), separators=(",", ":")).encode()
    require(profile["canary"].encode() not in request_bytes, "plaintext_canary_in_request")
    headers = {"Authorization":"Bearer " + key, "Content-Type":"application/json",
               "X-Signing-Algo":"ed25519", "X-Client-Pub-Key":bytes(client.verify_key).hex(),
               "X-Model-Pub-Key":selected_key, "X-Encryption-Version":"2", "x-no-aliasing":"true"}
    response_bytes = http(session, "POST", BASE + "/chat/completions", data=request_bytes, headers=headers).content
    response = parse_json(response_bytes)
    require(response.get("model") == model, "completion_model_mismatch")
    chat_id = response["id"]
    require(re.fullmatch(r"[a-zA-Z0-9_-]{1,200}", chat_id) is not None, "invalid_completion_id")
    signature = None
    for attempt in range(3):
        reply = session.get(BASE + "/signature/" + chat_id, params={"signing_algo":"ed25519"},
                            headers={"Authorization":"Bearer " + key}, timeout=(10,30), allow_redirects=False)
        if reply.status_code == 200:
            candidate = parse_json(reply.content)
            if "error_code" not in candidate:
                signature = candidate
                break
        elif reply.status_code != 404:
            raise Rejected("signature_endpoint_failed")
        if attempt < 2: time.sleep(1)
    kind = verify_response(signature, request_bytes, response_bytes, model, gateway, candidates, selected_key)
    result[kind.replace("provider_tee", "model") + "_response_binding"] = "pass"
    require(kind == policy["required_response_kind"], "model_response_binding_unavailable")
    message = response["choices"][0]["message"]
    require(not message.get("tool_calls"), "unexpected_tools")
    require(message.get("content"), "missing_encrypted_content")
    content = decrypt(bytes.fromhex(message["content"]), client).decode()
    for field in ("reasoning", "reasoning_content"):
        if message.get(field): decrypt(bytes.fromhex(message[field]), client)
    require(bool(content.strip()), "empty_completion")
    # Tampering the exact response must fail even though the signature still verifies by itself.
    try:
        verify_response(signature, request_bytes, response_bytes+b" ", model, gateway, candidates, selected_key)
    except Rejected:
        result["tampered_response_rejected"] = True
    else:
        raise Rejected("tampered_response_accepted")
    result.update(completion="verified_and_decrypted", completion_characters=len(content),
                  request_ciphertext_sha256=digest(request_bytes), response_ciphertext_sha256=digest(response_bytes))
    if save_fictional_output:
        directory=ROOT/".local/ai-spike"
        directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        destination=directory/"fictional-completion.txt"
        fd=os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,"w") as stream:
            stream.write(content)
        os.chmod(destination,0o600)
        result["fictional_output_file"]=".local/ai-spike/fictional-completion.txt"
    # Deliberately return no conversation or credentials to the default log.
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", type=Path, default=ROOT/".local/ai-policy.json")
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--save-fictional-output", action="store_true")
    args = parser.parse_args()
    try:
        require(args.policy.exists(), "policy_file_missing")
        result = asyncio.run(run(parse_json(args.policy.read_bytes()), args.preflight_only, args.save_fictional_output))
        print(json.dumps(result, indent=2))
    except Exception as error:
        # Third-party exception messages can contain request bodies or auth headers.
        code = str(error) if isinstance(error, Rejected) else type(error).__name__
        print(json.dumps({"mode":"live", "status":"not_verified", "reason":code}))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


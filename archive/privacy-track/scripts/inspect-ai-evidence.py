#!/usr/bin/env python3
"""Public hardware evidence discovery only; never approves a measurement policy."""
import asyncio
import json
from pathlib import Path
import secrets
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/"packages/ai-client"))
from private_completion import (BASE, Rejected, check_bindings, dcap_qvl, http,
                                parse_json, requests, verify_gpu)


async def main():
    model = sys.argv[1] if len(sys.argv)>1 else "z-ai/glm-5.3-flash"
    session = requests.Session()
    session.trust_env = False
    nonce = secrets.token_hex(32)
    report = dict(mode="live_public_evidence_only", model=model, observed_unix=int(time.time()),
                  inference_requested=False, measurement_policy="NOT_ACCEPTED", candidates=[])
    try:
        body = parse_json(http(session,"GET",BASE+"/attestation/report",
            params=dict(model=model,provider="near",signing_algo="ed25519",nonce=nonce,include_tls_fingerprint="false"),
            headers={"x-no-aliasing":"true"}).content)
        entries = [("gateway",body["gateway_attestation"])]
        entries += [("model",c) for c in body.get("model_attestations",[])]
        if len(entries)==1: raise Rejected("missing_model_evidence")
        for role, evidence in entries:
            result = {"role":role,"accepted":False}
            try:
                verified = await dcap_qvl.get_collateral_and_verify(bytes.fromhex(evidence["intel_quote"]))
                result.update(tcb_status=verified.status, advisory_ids=list(verified.advisory_ids))
                quote=parse_json(verified.to_json())["report"]["TD10"]
                result.update(check_bindings(evidence,quote,nonce,role),quote_and_bindings="pass")
                wrong_nonce=(bytes([int(nonce[:2],16)^1])+bytes.fromhex(nonce[2:])).hex()
                try:
                    check_bindings(evidence,quote,wrong_nonce,role)
                except Rejected:
                    result["wrong_nonce_rejected"]=True
                else:
                    raise Rejected("wrong_nonce_accepted")
                # Corrupt a byte inside the signed quote, not an HTTP echo.
                corrupt=bytearray.fromhex(evidence["intel_quote"])
                if len(corrupt)<=100: raise Rejected("short_quote")
                corrupt[100]^=1
                try:
                    await dcap_qvl.get_collateral_and_verify(bytes(corrupt))
                except ValueError:
                    result["tampered_quote_rejected"]=True
                else:
                    raise Rejected("tampered_quote_accepted")
                if role=="model":
                    verify_gpu(evidence,nonce,session)
                    result["gpu_jwt"]="pass"
            except Exception as error:
                result["failure"]=str(error) if isinstance(error,Rejected) else type(error).__name__
            report["candidates"].append(result)
    except Exception as error:
        report["failure"]=str(error) if isinstance(error,Rejected) else type(error).__name__
    directory=ROOT/".local/ai-spike"
    directory.mkdir(parents=True,exist_ok=True)
    (directory/"public-evidence-report.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
    return 2 if report.get("failure") or any(c.get("failure") for c in report["candidates"]) else 0


raise SystemExit(asyncio.run(main()))


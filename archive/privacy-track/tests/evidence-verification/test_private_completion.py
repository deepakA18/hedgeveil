"""Synthetic rejection tests, never evidence of a live TEE or completion."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch, AsyncMock
import jwt
from cryptography.hazmat.primitives.asymmetric import ec

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"packages/ai-client"))
from private_completion import (MEASUREMENTS, Rejected, SigningKey, check_bindings,
    decrypt, digest, encrypt, parse_json, replay_rtmr3, verify_response, verify_nras_tokens,
    verify_report, NRAS)


def fixture():
    key=SigningKey.generate()
    signer=bytes(key.verify_key).hex()
    nonce="11"*32
    compose='{"fictional_test_only":true}'
    quote={name:"00"*48 for name in MEASUREMENTS}
    quote.update(td_attributes="00"*8, report_data=signer+nonce,
                 mr_config_id=(b"\x01"+hashlib.sha256(compose.encode()).digest()+bytes(15)).hex())
    report=dict(signing_algo="ed25519",signing_address=signer,signing_public_key=signer,
                request_nonce=nonce,report_data=quote["report_data"],event_log="[]",
                info=dict(tcb_info=dict(app_compose=compose)))
    return key,report,quote,nonce


class EvidenceTests(unittest.TestCase):
    def test_encryption_roundtrip_and_tampering(self):
        recipient=SigningKey.generate()
        canary=b"HEDGEVEIL_FICTIONAL_PRIVATE_CANARY"
        encrypted=encrypt(canary,bytes(recipient.verify_key))
        self.assertNotIn(canary,encrypted)
        self.assertEqual(decrypt(encrypted,recipient),canary)
        self.assertNotEqual(encrypted,encrypt(canary,bytes(recipient.verify_key)))
        mutated=bytearray(encrypted); mutated[-1]^=1
        with self.assertRaises(Exception): decrypt(bytes(mutated),recipient)
        with self.assertRaises(Exception): decrypt(encrypted,SigningKey.generate())
        with self.assertRaises(Rejected): decrypt(b"short",recipient)

    def test_nonce_key_measurement_and_event_binding_negatives(self):
        _,report,quote,nonce=fixture()
        check_bindings(report,quote,nonce,"model")
        for field in ("request_nonce","signing_address","signing_public_key","report_data"):
            bad=copy.deepcopy(report); bad[field]="00"*(64 if field=="report_data" else 32)
            with self.assertRaises(Rejected): check_bindings(bad,quote,nonce,"model")
        with self.assertRaises(Rejected): check_bindings(report,quote,"22"*32,"model")
        for field in ("mr_config_id","rt_mr3","report_data"):
            bad=copy.deepcopy(quote); bad[field]="ff"*(64 if field=="report_data" else 48)
            with self.assertRaises(Rejected): check_bindings(report,bad,nonce,"model")
        bad=copy.deepcopy(quote); bad["td_attributes"]="01"+"00"*7
        with self.assertRaises(Rejected): check_bindings(report,bad,nonce,"model")
        bad=copy.deepcopy(report); bad["info"]["tcb_info"]["app_compose"] += " "
        with self.assertRaises(Rejected): check_bindings(bad,quote,nonce,"model")
        bad=copy.deepcopy(report); bad["signing_algo"]="ecdsa"
        with self.assertRaises(Rejected): check_bindings(bad,quote,nonce,"model")

    def test_event_digest_and_order(self):
        event=dict(imr=3,event_type=1,event="test",event_payload="01")
        second=dict(imr=3,event_type=2,event="next",event_payload="02")
        self.assertNotEqual(replay_rtmr3([event,second]),replay_rtmr3([second,event]))
        bad=dict(event,digest="ff"*48)
        with self.assertRaises(Rejected): replay_rtmr3([bad])

    def test_exact_response_binding_and_signer_classification(self):
        key,report,quote,nonce=fixture()
        model="fictional/model"
        candidate=check_bindings(report,quote,nonce,"model")
        gateway_key,gateway_report,gateway_quote,gateway_nonce=fixture()
        gateway=check_bindings(gateway_report,gateway_quote,gateway_nonce,"gateway")
        request=b'{"model":"fictional/model"}'
        response=b'{"fictional":true}'
        text=model+":"+digest(request)+":"+digest(response)
        signature=dict(signature_kind="provider_tee",signing_algo="ed25519",
                       signing_address=candidate["signer"],text=text,
                       signature=key.sign(text.encode()).signature.hex())
        args=(request,response,model,gateway,[candidate],candidate["signer"])
        self.assertEqual(verify_response(signature,*args),"provider_tee")
        for field in ("signature_kind","signing_algo","signing_address","signature","text"):
            bad=dict(signature); del bad[field]
            with self.assertRaises((Rejected,KeyError)): verify_response(bad,*args)
        with self.assertRaises(Rejected): verify_response(None,*args)
        with self.assertRaises(Rejected): verify_response({"error_code":"missing"},*args)
        with self.assertRaises(Rejected): verify_response(signature,request+b" ",response,model,gateway,[candidate],candidate["signer"])
        with self.assertRaises(Rejected): verify_response(signature,request,response+b" ",model,gateway,[candidate],candidate["signer"])
        with self.assertRaises(Rejected): verify_response(signature,request,response,model,gateway,[candidate,candidate],candidate["signer"])
        with self.assertRaises(Rejected): verify_response(signature,request,response,"other/model",gateway,[candidate],candidate["signer"])
        bad=dict(signature,signature="00"*64)
        with self.assertRaises(Exception): verify_response(bad,*args)
        gateway_text=digest(request)+":"+digest(response)
        gateway_sig=dict(signature_kind="gateway",signing_algo="ed25519",signing_address=gateway["signer"],
                         text=gateway_text,signature=gateway_key.sign(gateway_text.encode()).signature.hex())
        self.assertEqual(verify_response(gateway_sig,*args),"gateway")

    def test_strict_json(self):
        for raw in ('{"a":1,"a":2}', '{"a":NaN}'):
            with self.assertRaises(Rejected): parse_json(raw)

    def test_gpu_signed_tokens_and_detached_binding(self):
        key=ec.generate_private_key(ec.SECP384R1())
        keyset=SimpleNamespace(get_signing_key_from_jwt=lambda _:SimpleNamespace(key=key.public_key()))
        nonce="11"*32
        def token(claims):
            base=dict(iss=NRAS,iat=int(time.time()),exp=int(time.time())+60,eat_nonce=nonce)
            return jwt.encode(dict(base,**claims),key,algorithm="ES384")
        gpu=token({"measres":"success","secboot":True,"dbgstat":"disabled",
                   "x-nvidia-gpu-attestation-report-nonce-match":True})
        summary={"x-nvidia-overall-att-result":True,"submods":{"GPU-0":["DIGEST",["SHA-256",digest(gpu.encode())]]}}
        body=[["JWT",token(summary)],{"GPU-0":gpu}]
        verify_nras_tokens(body,nonce,keyset)
        with self.assertRaises(Rejected): verify_nras_tokens(body,"22"*32,keyset)
        bad=copy.deepcopy(body); bad[1]["GPU-0"] += "A"
        with self.assertRaises(Rejected): verify_nras_tokens(bad,nonce,keyset)
        bad_summary=copy.deepcopy(summary); bad_summary["x-nvidia-overall-att-result"]=False
        with self.assertRaises(Rejected): verify_nras_tokens([["JWT",token(bad_summary)],body[1]],nonce,keyset)
        with self.assertRaises(Rejected): verify_nras_tokens([body[0],{}],nonce,keyset)
        wrong_key=ec.generate_private_key(ec.SECP384R1())
        wrong_keyset=SimpleNamespace(get_signing_key_from_jwt=lambda _:SimpleNamespace(key=wrong_key.public_key()))
        with self.assertRaises(jwt.InvalidSignatureError): verify_nras_tokens(body,nonce,wrong_keyset)

    def test_hardware_failure_or_unaccepted_measurements_cannot_pass(self):
        import asyncio
        _,report,quote,nonce=fixture()
        report["intel_quote"]="00"
        policy=dict(accepted_tcb_statuses=["UpToDate"],accepted_advisories=[],gateway_measurements=[])
        verified=SimpleNamespace(status="UpToDate",advisory_ids=[],to_json=lambda:json.dumps({"report":{"TD10":quote}}))
        with patch('private_completion.dcap_qvl.get_collateral_and_verify',AsyncMock(return_value=verified)):
            with self.assertRaisesRegex(Rejected,"measurement_not_accepted"):
                asyncio.run(verify_report(report,nonce,"gateway",policy,None))
        with patch('private_completion.dcap_qvl.get_collateral_and_verify',AsyncMock(side_effect=ValueError('bad quote'))):
            with self.assertRaises(ValueError): asyncio.run(verify_report(report,nonce,"gateway",policy,None))


if __name__=="__main__": unittest.main()

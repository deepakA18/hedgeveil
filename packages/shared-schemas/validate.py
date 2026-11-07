"""Offline review/test validator, not contract or proof verification."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator

SCHEMA = json.loads(Path(__file__).with_name("public-inputs.schema.json").read_text())
MAX_U128 = 2**128-1
Q = 10**24


def loads_strict(raw):
    def reject_constant(value):
        raise ValueError("non-finite JSON")

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique, parse_constant=reject_constant)


def validate(data):
    Draft202012Validator(SCHEMA).validate(data)
    numeric = [data["expiry_ns"], data["fee"]["amount"]]
    for key in ("amount", "coefficient"):
        if key in data["context"]:
            numeric.append(data["context"][key])
    if any(int(value) > MAX_U128 for value in numeric):
        raise ValueError("u128 overflow")
    if int(data["context"].get("coefficient", "0")) > Q:
        raise ValueError("coefficient exceeds Q")
    commitments = [output["commitment"] for output in data["outputs"]]
    if len(set(commitments)) != len(commitments):
        raise ValueError("duplicate output commitment")


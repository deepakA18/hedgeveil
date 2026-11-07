import copy
import sys
import unittest
from pathlib import Path
from jsonschema import Draft202012Validator, ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages/shared-schemas"))
from validate import SCHEMA, loads_strict, validate


def example(operation):
    """Synthetic shape fixture. Hex values are not cryptographic artifacts."""
    contexts = {
        "deposit": {"amount": "100"},
        "transfer": {"asset_kind": "P", "asset_id": "a"*64},
        "pair_split": {"series_id": "a"*64, "series_state_digest": "b"*64},
        "pair_merge": {"series_id": "a"*64, "series_state_digest": "b"*64},
        "redeem": {"series_id": "a"*64, "finalization_digest": "b"*64, "leg": "P", "coefficient": str(10**24)},
        "withdraw": {"amount": "100", "recipient": "alice.testnet", "recovery_commitment": "c"*64},
    }
    outputs = [{"commitment": "d"*64, "ciphertext_digest": "e"*64}]
    if operation == "pair_split":
        outputs.append({"commitment": "f"*64, "ciphertext_digest": "1"*64})
    return dict(schema_version="0.1.0", domain=dict(protocol_version="1", network="testnet",
                pool_id="2"*64, deployment_id="3"*64), verifier_key_hash="4"*64,
                operation=operation, root=None if operation == "deposit" else "5"*64,
                nullifiers=[] if operation == "deposit" else (["6"*64, "7"*64] if operation == "pair_merge" else ["6"*64]),
                outputs=outputs, expiry_ns="1000", fee=dict(amount="0", recipient_commitment="8"*64),
                context=contexts[operation])


class PublicInputTests(unittest.TestCase):
    def reject(self, value):
        with self.assertRaises((ValueError, ValidationError)):
            validate(value)

    def test_schema_and_all_supported_shapes(self):
        Draft202012Validator.check_schema(SCHEMA)
        for operation in ("deposit", "transfer", "pair_split", "pair_merge", "redeem", "withdraw"):
            validate(example(operation))

    def test_private_data_and_unknown_fields_rejected(self):
        for field in ("amount", "owner", "spend_key", "leaf_index", "reserve_delta", "witness"):
            for path in ((), ("context",), ("domain",)):
                data = example("transfer")
                target = data
                for key in path: target = target[key]
                target[field] = "123"
                self.reject(data)

    def test_amount_encoding_and_bounds(self):
        for value in (1, 1.5, True, "-1", "01", "1e2", " 1", "1.0", "1\n", str(2**128), "0"):
            data = example("withdraw")
            data["context"]["amount"] = value
            self.reject(data)
        data = example("redeem")
        data["context"]["coefficient"] = str(10**24+1)
        self.reject(data)

    def test_missing_binding_and_wrong_operation(self):
        for field in example("withdraw"):
            data = example("withdraw")
            del data[field]
            self.reject(data)
        data = example("redeem")
        del data["context"]["finalization_digest"]
        self.reject(data)
        data = example("withdraw")
        data["operation"] = "transfer"
        self.reject(data)
        data = example("transfer")
        data["domain"]["network"] = "mainnet"
        self.reject(data)

    def test_duplicates_arity_and_deposit_restrictions(self):
        data = example("transfer")
        data["nullifiers"] *= 2
        self.reject(data)
        data = example("transfer")
        second = copy.deepcopy(data["outputs"][0])
        second["ciphertext_digest"] = "9"*64
        data["outputs"].append(second)
        self.reject(data)
        data = example("transfer")
        data["nullifiers"] = [str(i)*64 for i in range(5)]
        self.reject(data)
        data = example("deposit")
        data["fee"]["amount"] = "1"
        self.reject(data)
        data = example("pair_split")
        data["outputs"].pop()
        self.reject(data)

    def test_duplicate_json_keys_and_nonfinite_values(self):
        for raw in ('{"amount":"1","amount":"2"}', '{"value":NaN}'):
            with self.assertRaises(ValueError): loads_strict(raw)


if __name__ == "__main__":
    unittest.main()

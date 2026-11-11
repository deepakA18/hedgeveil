import copy
import json
from pathlib import Path
import sys
import unittest
from jsonschema import Draft202012Validator
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'packages/shared-schemas'))
from build_expiry_schema import build

class ExpiryOracleSchema(unittest.TestCase):
    def test_generation(self):
        schema = build()
        Draft202012Validator.check_schema(schema)
        self.assertEqual(schema, json.loads((ROOT/'packages/shared-schemas/expiry-oracle.schema.json').read_text()))

    def test_compiled_records_and_profile_isolation(self):
        report = json.loads((ROOT/'research/reports/orc04-expiry-resolver-sandbox.json').read_text())
        self.assertTrue(report['passed'])
        v = Draft202012Validator(build())
        case = report['final_case']
        v.validate(case)
        v.validate({'config': case['config']})
        for change in [lambda c: c['config'].update(oracle_version='native-sampled-v1'),
                       lambda c: c['accepted'].update(price=3000000000000),
                       lambda c: c['accepted'].update(evidence_sha256='unverified'),
                       lambda c: c.update(pending='1'),
                       lambda c: c.update(last_result='REJECTED')]:
            bad = copy.deepcopy(case)
            change(bad)
            self.assertFalse(v.is_valid(bad))
        events = [json.loads(log[11:]) for tx in report['transactions'] for receipt in tx['receipts']
                  for log in receipt.get('logs', []) if log.startswith('EVENT_JSON:')
                  and json.loads(log[11:]).get('standard') == 'hedgeveil_expiry_oracle']
        self.assertGreater(len(events), 10)
        for event in events:
            v.validate(event)
        wrong = copy.deepcopy(events[0])
        wrong['standard'] = 'hedgeveil_external_oracle'
        self.assertFalse(v.is_valid(wrong))

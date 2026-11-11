import copy
import json
from pathlib import Path
import sys
import unittest
from jsonschema import Draft202012Validator
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'packages/shared-schemas'))
from build_external_schema import build

class ExternalOracleSchema(unittest.TestCase):
    def test_generation(self):
        schema = build()
        Draft202012Validator.check_schema(schema)
        self.assertEqual(schema, json.loads((ROOT/'packages/shared-schemas/external-oracle.schema.json').read_text()))

    def test_actual_compiled_case_and_unsafe_mutations(self):
        report = json.loads((ROOT/'research/reports/orc03-native-resolver-sandbox.json').read_text())
        self.assertTrue(report['passed'])
        validator = Draft202012Validator(build())
        case = report['case']
        validator.validate(case)
        validator.validate({'config': case['config'], 'source': case['source']})
        for mutate in [lambda c: c['samples'].pop(),
                       lambda c: c['source'].update(asset='other'),
                       lambda c: c['config'].update(oracle_version='demo-v1'),
                       lambda c: c['samples'][0].update(price=0),
                       lambda c: c.update(pending={'id': '1', 'slot': 3, 'requested_ns': '1'})]:
            bad = copy.deepcopy(case)
            mutate(bad)
            self.assertFalse(validator.is_valid(bad))

    def test_actual_events_have_strict_domain_sequence_and_commitment(self):
        report = json.loads((ROOT/'research/reports/orc03-native-resolver-sandbox.json').read_text())
        self.assertTrue(report['passed'])
        events = [json.loads(log[11:]) for tx in report['transactions'] for receipt in tx['receipts']
                  for log in receipt.get('logs', []) if log.startswith('EVENT_JSON:')
                  and json.loads(log[11:]).get('standard') == 'hedgeveil_external_oracle']
        self.assertGreater(len(events), 10)
        validator = Draft202012Validator(build())
        for event in events:
            validator.validate(event)
        validator.validate(report['indexer']['snapshot']['state'])
        for mutate in [lambda e: e['data'][0].update(network='mainnet'),
                       lambda e: e['data'][0].update(sequence=1),
                       lambda e: e['data'][0].update(state_hash='unverified'),
                       lambda e: e.update(event='UNKNOWN'),
                       lambda e: e['data'].append(e['data'][0])]:
            bad = copy.deepcopy(events[0])
            mutate(bad)
            self.assertFalse(validator.is_valid(bad))

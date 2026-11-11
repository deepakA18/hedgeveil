"""Candidate native sampled resolver records, generated via build_schema.py."""
import json
from pathlib import Path
from build_schema import build as public_build, ref, obj, const, array
DESTINATION = Path(__file__).with_name('external-oracle.schema.json')

def build():
    public = public_build()['$defs']
    defs = {k: public[k] for k in ('uint128', 'uint64', 'positive', 'account', 'id', 'hash256', 'series_terms')}
    terms = json.loads(json.dumps(defs['series_terms']))
    terms['properties']['oracle_version'] = const('native-sampled-v1')
    defs['series_terms'] = terms
    defs['source'] = obj({'account': ref('account'), 'reporter': ref('account'),
                          'asset': const('wrap.near'), 'min_price': ref('positive'), 'max_price': ref('positive')})
    defs['sample'] = obj({'report_ns': ref('uint64'), 'request_ns': ref('uint64'),
                          'accepted_ns': ref('uint64'), 'price': ref('positive'), 'response_hash': ref('hash256')})
    defs['pending'] = obj({'id': ref('uint64'), 'slot': {'type': 'integer', 'minimum': 0, 'maximum': 2}, 'requested_ns': ref('uint64')})
    nullable = lambda name: {'anyOf': [ref(name), {'type': 'null'}]}
    defs['registration'] = obj({'config': ref('series_terms'), 'source': ref('source')})
    defs['case'] = obj({'config': ref('series_terms'), 'source': ref('source'),
                        'samples': array(nullable('sample'), 3, 3),
                        'pending': nullable('pending'), 'price': nullable('positive')})
    defs['event'] = obj({'standard': const('hedgeveil_external_oracle'), 'version': const('1.0.0'),
                         'event': {'enum': ['INITIALIZED', 'SERIES_REGISTERED', 'SAMPLE_REQUESTED', 'SAMPLE_ACCEPTED', 'SAMPLE_REJECTED', 'FINALIZED', 'PAUSE_CHANGED']},
                         'data': array(obj({'network': {'enum': ['sandbox', 'testnet']}, 'contract_id': ref('account'), 'sequence': ref('uint64'), 'state_hash': ref('hash256')}), 1, 1)})
    defs['snapshot'] = obj({'network': {'enum': ['sandbox', 'testnet']}, 'contract_id': ref('account'),
                            'sequence': ref('uint64'), 'version': const('native-sampled-v1'),
                            'registrar': ref('account'), 'guardian': ref('account'), 'request_sequence': ref('uint64'),
                            'paused': {'type': 'boolean'}, 'cases': {'type': 'object', 'maxProperties': 16,
                              'propertyNames': ref('id'), 'additionalProperties': ref('case')}})
    return {'$schema': 'https://json-schema.org/draft/2020-12/schema',
            '$id': 'https://hedgeveil.invalid/schemas/external-oracle/native-sampled-v1',
            'title': 'Candidate native sampled resolver, not deployment approval',
            'oneOf': [ref('registration'), ref('case'), ref('event'), ref('snapshot')], '$defs': defs}

def write(check=False):
    content = json.dumps(build(), indent=2)+'\n'
    if check:
        if not DESTINATION.exists() or DESTINATION.read_text() != content:
            raise SystemExit('External oracle schema differs; regenerate and review.')
        print('External oracle schema is reproducible.')
    else:
        DESTINATION.write_text(content)

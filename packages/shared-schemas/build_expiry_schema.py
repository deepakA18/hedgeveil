"""Isolated historical trade TWAP resolver ABI; not deployment approval."""
import json
from pathlib import Path
from build_schema import build as public_build, ref, obj, const, array
DESTINATION = Path(__file__).with_name('expiry-oracle.schema.json')

def build():
    public = public_build()['$defs']
    defs = {k: public[k] for k in ('uint128', 'uint64', 'positive', 'account', 'id', 'hash256', 'series_terms')}
    terms = json.loads(json.dumps(defs['series_terms']))
    terms['properties']['oracle_version'] = const('native-trade-twap-v1')
    defs['series_terms'] = terms
    nullable = lambda name: {'anyOf': [ref(name), {'type': 'null'}]}
    defs['accepted'] = obj({'price': ref('positive'), 'evidence_sha256': ref('hash256'),
                            'response_sha256': ref('hash256'), 'accepted_ns': ref('uint64')})
    defs['registration'] = obj({'config': ref('series_terms')})
    defs['case'] = obj({'config': ref('series_terms'), 'pending': nullable('uint64'),
                        'accepted': nullable('accepted'), 'price': nullable('positive'),
                        'last_result': {'enum': ['NOT_REQUESTED', 'PENDING', 'REJECTED', 'ACCEPTED']}})
    defs['case']['allOf'] = [
        {'if': {'properties': {'last_result': const('ACCEPTED')}},
         'then': {'properties': {'pending': {'type': 'null'}, 'accepted': ref('accepted')}},
         'else': {'properties': {'accepted': {'type': 'null'}, 'price': {'type': 'null'}}}},
        {'if': {'properties': {'last_result': const('PENDING')}},
         'then': {'properties': {'pending': ref('uint64')}},
         'else': {'properties': {'pending': {'type': 'null'}}}}
    ]
    defs['event'] = obj({'standard': const('hedgeveil_expiry_oracle'), 'version': const('1.0.0'),
                         'event': {'enum': ['INITIALIZED', 'SERIES_REGISTERED', 'EVIDENCE_REQUESTED',
                                            'EVIDENCE_ACCEPTED', 'EVIDENCE_REJECTED', 'FINALIZED', 'PAUSE_CHANGED']},
                         'data': array(obj({'network': {'enum': ['sandbox', 'testnet']}, 'contract_id': ref('account'),
                                            'sequence': ref('uint64'), 'state_hash': ref('hash256')}), 1, 1)})
    defs['snapshot'] = obj({'network': {'enum': ['sandbox', 'testnet']}, 'contract_id': ref('account'),
                            'sequence': ref('uint64'), 'version': const('native-trade-twap-v1'),
                            'registrar': ref('account'), 'guardian': ref('account'), 'source': ref('account'),
                            'worker_sha256': const('86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43'),
                            'request_sequence': ref('uint64'), 'paused': {'type': 'boolean'},
                            'cases': {'type': 'object', 'maxProperties': 16, 'propertyNames': ref('id'),
                                      'additionalProperties': ref('case')}})
    return {'$schema': 'https://json-schema.org/draft/2020-12/schema',
            '$id': 'https://hedgeveil.invalid/schemas/expiry-oracle/native-trade-twap-v1',
            'title': 'Candidate historical trade TWAP resolver; production disabled',
            'oneOf': [ref('registration'), ref('case'), ref('event'), ref('snapshot')], '$defs': defs}

def write(check=False):
    content = json.dumps(build(), indent=2)+'\n'
    if check:
        if not DESTINATION.exists() or DESTINATION.read_text() != content:
            raise SystemExit('Expiry oracle schema differs; regenerate and review.')
        print('Expiry oracle schema is reproducible.')
    else:
        DESTINATION.write_text(content)

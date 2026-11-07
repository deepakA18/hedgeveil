"""G4 wire records and receipt-event schema. Generated through build_schema.py."""
import json
from pathlib import Path
from build_schema import build as public_build, ref, obj, const, array

DESTINATION=Path(__file__).with_name('oracle.schema.json')


def build():
    public=public_build()['$defs']
    defs={k:public[k] for k in ('uint128','uint64','positive','account','id','hash256','series_terms')}
    source=obj({'source_id':ref('id'),'publisher':ref('account'),'evidence_hash':ref('hash256')})
    window=obj({'start_ns':ref('uint64'),'end_ns':ref('uint64')})
    observation=obj({'label':const('DEMO ORACLE — SYNTHETIC PRICES'),'asset':const('NEAR'),
                     'quote':const('USD'),'price_scale':const('1000000000000'),'dataset_hash':ref('hash256'),
                     'window':window,'sample_step_ns':ref('uint64'),'min_price':ref('positive'),'max_price':ref('positive'),
                     'primary':array(source,3,3),'fallback':array(source,3,3)})
    policy=obj({**{k:ref('uint64') for k in ('primary_ns','fallback_ns','arbitration_ns','challenge_ns')},
                'proposal_bond':ref('positive'),'challenge_bond':ref('positive'),'arbitrator':ref('account')})
    evidence=obj({'series_id':ref('id'),'dataset_hash':ref('hash256'),'source_id':ref('id'),
                  'asset':const('NEAR'),'quote':const('USD'),'price_scale':const('1000000000000'),
                  'samples':array(obj({'timestamp_ns':ref('uint64'),'price':ref('positive')}),12,2)})
    data=obj({'sequence':ref('uint64'),'series_id':{'anyOf':[ref('id'),{'type':'null'}]},'state_hash':ref('hash256'),
              **{k:ref('uint128') for k in ('received','paid','locked','credits','in_flight')}})
    event=obj({'standard':const('hedgeveil_oracle'),'version':const('1.0.0'),
               'event':{'enum':['INITIALIZED','ACCOUNT_REGISTERED','SERIES_REGISTERED','OBSERVATION_PUBLISHED',
                                'PROPOSED','DISPUTED','FINALIZED','RESOLUTION_DELAYED','CREDIT_REQUESTED',
                                'CREDIT_RESULT','CREDIT_UNKNOWN','TICKET_CLOSED']},'data':array(data,1,1)})
    defs.update({'evidence':evidence,'registration':obj({'config':ref('series_terms'),'observation':observation,'policy':policy}),'event':event})
    return {'$schema':'https://json-schema.org/draft/2020-12/schema',
            '$id':'https://hedgeveil.invalid/oracle-v1.schema.json',
            'oneOf':[ref('evidence'),ref('registration'),ref('event')],'$defs':defs}


def write(check=False):
    content=json.dumps(build(),indent=2)+'\n'
    if check:
        if not DESTINATION.exists() or DESTINATION.read_text()!=content:
            raise SystemExit('Oracle schema differs; regenerate and review.')
        print('Oracle schema is reproducible.')
    else:
        DESTINATION.write_text(content)

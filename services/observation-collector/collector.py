#!/usr/bin/env python3
"""Committed synthetic observations only. No network, credentials, or latest spot."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT/'fixtures/synthetic-prices/g4-demo.json'
LABEL = 'DEMO ORACLE — SYNTHETIC PRICES'


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def uint(value, bits=128):
    if not isinstance(value, str) or not re.fullmatch(r'0|[1-9][0-9]*', value) or int(value)>=2**bits:
        raise ValueError('canonical unsigned decimal required')
    return int(value)


def materialize(request):
    raw = TEMPLATE.read_bytes()
    data = json.loads(raw)
    start = uint(request['start_ns'], 64)
    step = uint(data['sample_step_ns'], 64)
    end = start+len(data['sources'][0]['prices'])*step
    dataset = hashlib.sha256(raw).hexdigest()
    sources, evidence = {'PRIMARY':[], 'FALLBACK':[]}, []
    for i, source in enumerate(data['sources']):
        e = {'series_id': request['series_id'], 'dataset_hash': dataset,
             'source_id': source['source_id'], 'asset': data['asset'], 'quote':data['quote'],
             'price_scale': data['price_scale'],
             'samples': [{'timestamp_ns': str(start+j*step), 'price': p} for j,p in enumerate(source['prices'])]}
        evidence.append(e)
        sources[source['route']].append({'source_id':source['source_id'],
                                         'publisher':request['publishers'][i], 'evidence_hash':digest(e)})
    observation = {'label':LABEL, 'asset':'NEAR', 'quote':'USD', 'price_scale':data['price_scale'],
                   'dataset_hash':dataset,'window':{'start_ns':str(start),'end_ns':str(end)},
                   'sample_step_ns':str(step),'min_price':'10000000000','max_price':'1000000000000000',
                   'primary':sources['PRIMARY'],'fallback':sources['FALLBACK']}
    policy = {'primary_ns':'600000000000','fallback_ns':'600000000000',
              'arbitration_ns':'600000000000','challenge_ns':'120000000000',
              'proposal_bond':'100000000000000000000000','challenge_bond':'100000000000000000000000',
              'arbitrator':request['arbitrator']}
    config = {'series_id':request['series_id'],'version':'1','collateral_kind':'NATIVE_NEAR',
              'index_definition_hash':digest({'asset':'NEAR','quote':'USD','payoff':'CAPPED_USD_COMPLEMENT'}),
              'payoff_kind':'CAPPED_USD_COMPLEMENT','strike':'2000000000000','price_scale':data['price_scale'],
              'maturity_ns':str(end),'mint_cutoff_ns':str(start),'observation_window':observation['window'],
              'oracle_account_id':request['oracle'],'oracle_version':'demo-v1',
              'oracle_config_hash':digest(observation),'finalization_policy_hash':digest(policy),
              'max_supply':str(100*10**24)}
    result = {'registration':{'config':config,'observation':observation,'policy':policy},'evidence':evidence}
    verify(result)
    return result


def verify(bundle):
    registration = bundle['registration']
    config, obs, policy = [registration[k] for k in ('config','observation','policy')]
    if digest(obs)!=config['oracle_config_hash'] or digest(policy)!=config['finalization_policy_hash']:
        raise ValueError('configuration commitment mismatch')
    if (obs['label']!=LABEL or obs['asset']!='NEAR' or obs['quote']!='USD'
        or obs['price_scale']!='1000000000000' or obs['window']!=config['observation_window']
        or obs['window']['end_ns']!=config['maturity_ns']):
        raise ValueError('units/window mismatch')
    start,end,step = uint(obs['window']['start_ns'],64),uint(obs['window']['end_ns'],64),uint(obs['sample_step_ns'],64)
    if not step or end<=start or (end-start)%step or not 2<=(end-start)//step<=12:
        raise ValueError('sample grid')
    items = bundle['evidence']
    ids = [e['source_id'] for e in items]
    if len(ids)!=6 or len(set(ids))!=6:
        raise ValueError('missing/duplicate evidence')
    by_id = {e['source_id']:e for e in items}
    results = {}
    for route in ('PRIMARY','FALLBACK'):
        sources=obs[route.lower()]
        if len(sources)!=3:
            raise ValueError('source coverage')
        prices=[]
        for source in sources:
            e=by_id[source['source_id']]
            if (digest(e)!=source['evidence_hash'] or e['series_id']!=config['series_id']
                or e['dataset_hash']!=obs['dataset_hash'] or e['asset']!='NEAR'
                or e['quote']!='USD' or e['price_scale']!=obs['price_scale']):
                raise ValueError('source commitment/binding mismatch')
            if len(e['samples'])!=(end-start)//step:
                raise ValueError('incomplete coverage')
            values=[]
            for i,s in enumerate(e['samples']):
                if uint(s['timestamp_ns'],64)!=start+i*step:
                    raise ValueError('stale/duplicate/future timestamp')
                p=uint(s['price'])
                if not uint(obs['min_price'])<=p<=uint(obs['max_price']):
                    raise ValueError('price bounds/zero')
                values.append(p)
            prices.append(sum(values)//len(values))
        price=str(sorted(prices)[1])
        results[route]={'price':price,'evidence_hash':digest({'series_id':config['series_id'],
                        'route':route,'price':price,'source_hashes':[s['evidence_hash'] for s in sources]})}
    return results


def store_immutable(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open('xb') as stream:
            stream.write(raw)
    except FileExistsError:
        if path.read_bytes()!=raw:
            raise ValueError('archive conflict; will not overwrite evidence')


def archive(bundle, directory):
    verify(bundle)
    # Content-addressed objects plus a manifest with complete immutable terms.
    for e in bundle['evidence']:
        store_immutable(directory/(digest(e)+'.json'), canonical(e))
    manifest={'registration':bundle['registration'], 'evidence_hashes':[digest(e) for e in bundle['evidence']]}
    path=directory/(digest(manifest)+'.manifest.json')
    store_immutable(path, canonical(manifest))
    return path


def replay(manifest_path):
    raw=manifest_path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=manifest_path.name.removesuffix('.manifest.json'):
        raise ValueError('manifest hash mismatch')
    manifest=json.loads(raw)
    items=[]
    for h in manifest['evidence_hashes']:
        if not re.fullmatch('[0-9a-f]{64}',h):
            raise ValueError('invalid object hash')
        blob=(manifest_path.parent/(h+'.json')).read_bytes()
        if hashlib.sha256(blob).hexdigest()!=h:
            raise ValueError('archive object hash mismatch')
        items.append(json.loads(blob))
    bundle={'registration':manifest['registration'],'evidence':items}
    return {'bundle':bundle,'observations':verify(bundle)}


def main():
    p=argparse.ArgumentParser()
    sub=p.add_subparsers(dest='command',required=True)
    m=sub.add_parser('materialize');m.add_argument('--request',type=Path,required=True);m.add_argument('--archive',type=Path,required=True)
    r=sub.add_parser('replay');r.add_argument('manifest',type=Path)
    args=p.parse_args()
    if args.command=='materialize':
        b=materialize(json.loads(args.request.read_text()));manifest=archive(b,args.archive)
        print(json.dumps({'manifest':str(manifest),'bundle':b,'observations':verify(b)}))
    else:
        print(json.dumps(replay(args.manifest)))


if __name__=='__main__':
    main()

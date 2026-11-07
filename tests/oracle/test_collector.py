import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'services/observation-collector'))
from collector import archive, digest, materialize, replay, verify, canonical

REQUEST={'series_id':'alpha','start_ns':'2000000000000','oracle':'oracle.sandbox',
         'publishers':[f'source-{i}.sandbox' for i in range(6)],'arbitrator':'judge.sandbox'}


class CollectorTests(unittest.TestCase):
    def test_independent_historical_mean_median(self):
        bundle=materialize(REQUEST)
        result=verify(bundle)
        self.assertEqual(result['PRIMARY']['price'],'4000000000000')
        self.assertEqual(result['FALLBACK']['price'],'2400000000000')
        self.assertEqual(len(bundle['evidence'][0]['samples']),12)
        self.assertNotEqual(result['PRIMARY']['evidence_hash'],result['FALLBACK']['evidence_hash'])

    def test_process_restart_replay_without_template(self):
        bundle=materialize(REQUEST)
        with tempfile.TemporaryDirectory() as directory:
            path=archive(bundle,Path(directory))
            self.assertEqual(archive(bundle,Path(directory)),path)
            raw=subprocess.check_output([sys.executable,str(ROOT/'services/observation-collector/collector.py'),'replay',str(path)])
            self.assertEqual(json.loads(raw),{'bundle':bundle,'observations':verify(bundle)})

    def test_missing_corrupt_and_conflicting_archive_rejected(self):
        bundle=materialize(REQUEST)
        with tempfile.TemporaryDirectory() as directory:
            path=archive(bundle,Path(directory))
            obj=Path(directory)/(digest(bundle['evidence'][0])+'.json')
            obj.write_text('{}')
            with self.assertRaises(ValueError):replay(path)
            with self.assertRaises(ValueError):archive(bundle,Path(directory))
            obj.unlink()
            with self.assertRaises(FileNotFoundError):replay(path)

    def test_semantic_failures_even_with_rehashed_commitment(self):
        for mutation in ('inverse','zero','timestamp','duplicate','coverage','wrong_series','scale'):
            bundle=materialize(REQUEST);e=bundle['evidence'][0]
            if mutation=='inverse':e['asset'],e['quote']='USD','NEAR'
            if mutation=='zero':e['samples'][0]['price']='0'
            if mutation=='timestamp':e['samples'][0]['timestamp_ns']='1'
            if mutation=='duplicate':e['samples'][1]['timestamp_ns']=e['samples'][0]['timestamp_ns']
            if mutation=='coverage':e['samples'].pop()
            if mutation=='wrong_series':e['series_id']='different'
            if mutation=='scale':e['price_scale']='1000000'
            obs=bundle['registration']['observation']
            obs['primary'][0]['evidence_hash']=digest(e)
            bundle['registration']['config']['oracle_config_hash']=digest(obs)
            with self.assertRaises(ValueError,msg=mutation):verify(bundle)

    def test_window_binding_and_no_latest_spot_substitution(self):
        a=materialize(REQUEST)
        b=materialize(dict(REQUEST,start_ns='3000000000000'))
        self.assertNotEqual(a['registration']['config']['oracle_config_hash'],b['registration']['config']['oracle_config_hash'])
        a['evidence']=b['evidence']
        with self.assertRaises(ValueError):verify(a)

    def test_generated_schema(self):
        # Optional dependency is the same pinned jsonschema as existing schema tests.
        import jsonschema
        schema=json.loads((ROOT/'packages/shared-schemas/oracle.schema.json').read_text())
        jsonschema.Draft202012Validator.check_schema(schema)
        bundle=materialize(REQUEST)
        for record in [bundle['registration']]+bundle['evidence']:
            jsonschema.validate(record,schema)
        bad=copy.deepcopy(bundle['evidence'][0]);bad['samples'][0]['price']='01'
        with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(bad,schema)
        bad=copy.deepcopy(bundle['evidence'][0]);bad['unexpected']=1
        with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(bad,schema)


if __name__=='__main__':unittest.main()

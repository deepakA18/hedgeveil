#!/usr/bin/env python3
"""Replay the committed synthetic window without a feed, API key or wall clock."""
import hashlib
import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'fixtures/synthetic-prices/g1-usd-near.json'
raw = path.read_bytes()
data = json.loads(raw)
assert data['units'] == 'USD/NEAR' and data['price_scale'] == '1000000000000'
assert data['aggregation'] == 'equal-duration-mean-floor'
start, end, step = (int(data[k]) for k in ('window_start_ns', 'window_end_ns', 'sampling_interval_ns'))
assert step > 0 and start < end and (end-start) % step == 0
samples = data['samples']
assert [int(s['timestamp_ns']) for s in samples] == list(range(start, end, step))
assert all(0 < int(s['price']) < 2**128 for s in samples)
config = {k: v for k, v in data.items() if k != 'samples'}
print(json.dumps({'price': str(sum(int(s['price']) for s in samples)//len(samples)),
    'terms': {'request_id': 'g1-observation', 'series_id': 'g1-series', 'scenario_id': data['scenario_id'],
    'source_hash': hashlib.sha256(raw).hexdigest(),
    'config_hash': hashlib.sha256(json.dumps(config, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
    **data['policy'], 'oracle_version': 'synthetic-g1-v1', 'start_ns': str(start), 'end_ns': str(end),
    'units': data['units'], 'price_scale': data['price_scale']}}))

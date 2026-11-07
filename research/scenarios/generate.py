#!/usr/bin/env python3
"""Deterministic synthetic daily scenarios; no external data or credentials."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[2]
NAMES = ('normal', 'high_volatility', 'jumps', 'crash_30', 'crash_50', 'crash_80',
         'slow_decline', 'v_recovery', 'source_outage', 'delay_1', 'delay_7',
         'delay_14', 'no_bids', 'concentration', 'maker_exit', 'disagreement',
         'resolution_loss')
SEEDS = {'train': [101, 202], 'held_out': [1001, 2002]}


def scenario(name, seed, days=84):
    # Same seed starts from the same shocks in each stress variant.
    rng = random.Random(seed)
    spot = 2.0
    rows = []
    for day in range(days + 1):
        if day:
            sigma = 1.8 if name == 'high_volatility' else 0.65
            spot *= math.exp(-0.5 * sigma * sigma / 365 + sigma * rng.gauss(0, 1) / math.sqrt(365))
            if name.startswith('crash_') and day == 21:
                spot *= 1 - int(name.split('_')[1]) / 100
            if name == 'jumps' and day in (18, 42, 61):
                spot *= {18: 1.45, 42: 0.55, 61: 1.3}[day]
            if name == 'slow_decline':
                spot *= 0.985
            if name == 'v_recovery':
                if day == 21:
                    spot *= 0.25
                if 21 < day <= 49:
                    spot *= 4 ** (1 / 28)
        outage = name == 'source_outage' and 18 <= day <= 49
        disagreement = name == 'disagreement' and 20 <= day <= 35
        lost = name == 'resolution_loss' and day >= 18
        delay = int(name.split('_')[1]) if name.startswith('delay_') else 0
        if outage:
            delay = 50 - day
        if disagreement:
            delay = 36 - day
        active = [True, True]
        if name == 'concentration' or (name == 'maker_exit' and day >= 21):
            active[1] = False
        if name == 'maker_exit' and day >= 35:
            active[0] = False
        rows.append({'day': day, 'spot': str(max(1, round(spot * 10**12))),
                     'reference_fresh': not (outage or disagreement or lost),
                     'observation_available': not (outage or disagreement or lost),
                     'resolution_delay_days': None if lost else delay,
                     'bids': not (name == 'no_bids' and day >= 14),
                     'maker_active': active,
                     'spread_multiplier': 4 if (name.startswith('crash_') and 21 <= day <= 28) else 1})
    return {'name': name, 'seed': seed, 'rows': rows}


def bundle():
    return {'label': 'SYNTHETIC RESEARCH DATA — NOT MARKET OBSERVATIONS',
            'days': 84, 'price_scale': str(10**12), 'splits': SEEDS,
            'generator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'paths': [dict(scenario(name, seed), split=split)
                      for split, seeds in SEEDS.items() for seed in seeds for name in NAMES]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    path = ROOT / 'fixtures/market-scenarios/g2-paths.json'
    encoded = json.dumps(bundle(), sort_keys=True, separators=(',', ':')) + '\n'
    if args.check:
        if not path.exists() or path.read_text() != encoded:
            raise SystemExit('Synthetic scenario fixture is stale')
        print('68 synthetic paths match generator and frozen seeds')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(encoded)
        print(path.relative_to(ROOT))

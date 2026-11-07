#!/usr/bin/env python3
"""Generate/check source-bound synthetic G2 research evidence. Standard library only."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import statistics
import sys

from engine import run, PRICE_SCALE
from metrics import aggregate, debt_benchmark, performance, summarize
from pricing import call_usd, binomial_call

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'research/scenarios'))
from generate import bundle


def selection(training, cfg):
    """Only training data enters this function; holdout cannot select a policy."""
    grouped = defaultdict(list)
    for row in training:
        assert row['split'] == 'train'
        if row['scenario'] == 'normal' and row['policy'] != 'hold':
            grouped[(row['wealth_usd'], row['configuration'])].append(row)
    winners = {}
    screening = []
    for (size, candidate), rows in sorted(grouped.items()):
        friction = statistics.mean(r['annual_friction'] for r in rows)
        total = sum(r['roll_windows'] for r in rows)
        completion = sum(r['roll_completed'] for r in rows)/total if total else 0
        passed = (all(r['acquired'] for r in rows) and total>0
                  and friction <= cfg['selection']['annual_friction_max']
                  and completion >= cfg['selection']['window_completion_min'])
        score = (statistics.mean(r['tracking_volatility'] for r in rows),
                 statistics.mean(abs(r['terminal_return']) for r in rows), candidate)
        screening.append({'wealth_usd': size, 'configuration': candidate, 'passed': passed,
                          'annual_friction': friction, 'completion': completion})
        if passed and (size not in winners or score < winners[size][0]):
            winners[size] = (score, candidate)
    return {str(size): winners[size][1] if size in winners else None for size in cfg['initial_wealth_usd']}, screening


def compute():
    config = json.loads((HERE/'config.json').read_text())
    fixture = ROOT/'fixtures/market-scenarios/g2-paths.json'
    paths = json.loads(fixture.read_text())
    if paths != bundle():
        raise SystemExit('Regenerate scenarios first; fixture/generator mismatch')
    configurations = [(policy, tenor, strike) for policy, tenors in config['policies'].items()
                      for tenor in tenors for strike in config['strike_bps']]
    rows, benchmarks, details = [], [], {}
    # Train first, freeze choice before any held-out simulation is evaluated.
    selected = screening = None
    for split in ('train', 'held_out'):
        for path in paths['paths']:
            if path['split'] != split:
                continue
            for wealth in config['initial_wealth_usd']:
                identity = {'split': split, 'scenario': path['name'], 'seed': path['seed'], 'wealth_usd': wealth}
                near = [wealth*int(row['spot'])/int(path['rows'][0]['spot']) for row in path['rows']]
                debt = debt_benchmark(config, path, wealth)
                benchmarks.extend([{**identity, 'name': 'hold_near', **performance(near, wealth)},
                                   {**identity, 'name': 'ideal_usd', **performance([wealth]*len(near), wealth)},
                                   {**identity, **{k: v for k, v in debt.items() if k != 'values'}}])
                for policy, tenor, strike in configurations:
                    cid = f'{policy}-d{tenor}-k{strike}'
                    result = run(config, path, policy, tenor, strike, wealth)
                    rows.append({**identity, 'configuration': cid, 'policy': policy, 'tenor_days': tenor,
                                 'strike_bps': strike, **summarize(result, config, wealth)})
                    if split == 'held_out' and path['seed'] == 1001 and wealth == 100 and tenor == 7 and strike == 4000 and policy in ('hold', 'short', 'hybrid'):
                        details[f"{path['name']}/{cid}"] = result['daily']
        if split == 'train':
            selected, screening = selection(rows, config)
            print('Training complete; frozen research candidates:', selected, flush=True)
        else:
            print('Held-out simulation complete', flush=True)
    grouped = defaultdict(list)
    for row in rows:
        if row['split'] == 'held_out':
            grouped[(row['scenario'], row['policy'], row['wealth_usd'])].append(row)
    summaries = [{'scenario': key[0], 'policy': key[1], 'wealth_usd': key[2], **aggregate(group)}
                 for key, group in sorted(grouped.items())]
    pricing = []
    for spot in (0.5, 2, 8):
        for days in (4, 30, 60):
            for sigma in (0.2, 0.8, 1.8):
                for rate in (0.0, 0.03, 0.1):
                    a = call_usd(spot, 2, days, sigma, rate)
                    b = binomial_call(spot, 2, days, sigma, rate)
                    assert abs(a-b)<0.003, (spot, days, sigma, rate, a, b)
                    pricing.append({'spot': spot, 'strike': 2, 'days': days, 'sigma': sigma, 'rate': rate,
                                    'analytic_call_usd': a, 'binomial_call_usd': b, 'absolute_error': abs(a-b)})
    files = [*HERE.glob('*.py'), HERE/'config.json', HERE/'PROTOCOL.md',
             ROOT/'research/scenarios/generate.py', fixture, ROOT/'research/reference-model/payoff.py',
             *sorted((ROOT/'tests/economics').glob('*.py'))]
    sources = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
    return {'label': 'SYNTHETIC ECONOMIC SIMULATION; NO TRANSACTION RECEIPTS OR MARKET DATA',
            'protocol': 'g2-v1', 'sources': sources, 'seeds': paths['splits'],
            'configuration_count': len(configurations), 'path_count': len(paths['paths']),
            'run_count': len(rows), 'selected_training_candidates': selected, 'training_screening': screening,
            'pricing_crosschecks': pricing, 'held_out_summaries': summaries, 'runs': rows,
            'benchmarks': benchmarks, 'failure_paths': details,
            'independent_review': 'PENDING', 'production_enabled': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    output = ROOT/'research/reports/g2-economics.json'
    result = compute()
    encoded = json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n'
    if args.check:
        if not output.exists() or output.read_text() != encoded:
            raise SystemExit('G2 evidence is stale; regenerate and review differences')
        print('G2 evidence reproduces byte-for-byte')
    else:
        output.write_text(encoded)
        print(f"Wrote {result['run_count']} runs, {len(result['benchmarks'])} benchmarks, {len(result['pricing_crosschecks'])} pricing checks")


if __name__ == '__main__':
    main()

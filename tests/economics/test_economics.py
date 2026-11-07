import copy
from dataclasses import replace
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'research/policy-comparison'))
sys.path.insert(0, str(ROOT/'research/scenarios'))
from engine import Market, Q, PRICE_SCALE, run
from generate import scenario, bundle
from metrics import debt_benchmark, performance, aggregate
from pricing import call_usd, binomial_call, p_ratio
from run import selection

CONFIG = json.loads((ROOT/'research/policy-comparison/config.json').read_text())


def snapshot(market):
    return copy.deepcopy((market.user, market.makers, market.series, market.sinks, market.revision))


class EconomicsTests(unittest.TestCase):
    def market(self, wealth=100):
        market = Market(CONFIG, wealth, 2*PRICE_SCALE)
        row = scenario('normal', 101)['rows'][0]
        return market, row

    def acquire(self, market, row, tenor=7):
        self.assertTrue(market.charge_gas(row))
        quote, reason = market.quote(0, row, 8*PRICE_SCALE//10, row['day']+tenor)
        self.assertIsNone(reason)
        self.assertTrue(market.execute(quote, row))
        return quote

    def test_independent_pricing_and_not_intrinsic(self):
        for days in (4, 30, 60):
            for rate in (0, 0.03, 0.1):
                for sigma in (0.2, 0.8, 1.8):
                    self.assertAlmostEqual(call_usd(2, 2, days, sigma, rate),
                                           binomial_call(2, 2, days, sigma, rate), delta=0.003)
        self.assertLess(p_ratio(2*PRICE_SCALE, 2*PRICE_SCALE, 60), Q)
        self.assertEqual(p_ratio(2*PRICE_SCALE, PRICE_SCALE, 0), Q//2)
        self.assertEqual(call_usd(2, 1, 0), 1)

    def test_atomic_funded_roll_conserves_inventory(self):
        market, row = self.market()
        quote = self.acquire(market, row)
        self.assertEqual(market.series[0].reserve, quote.quantity)
        day = dict(row, day=5)
        q, reason = market.quote(0, day, PRICE_SCALE, 12)
        self.assertIsNone(reason)
        self.assertTrue(market.execute(q, day))
        self.assertEqual(market.series[0].reserve, 0)
        self.assertEqual(market.series[0].merged, quote.quantity)
        self.assertEqual(market.user.position(0), [0, 0])
        market.check()

    def test_rejections_do_not_move_money(self):
        market, row = self.market()
        quote = self.acquire(market, row)
        before = snapshot(market)
        self.assertFalse(market.execute(quote, row))  # consumed revision
        self.assertFalse(market.execute(replace(quote, revision=market.revision, expires=-1), row))
        for changed in [dict(row, reference_fresh=False), dict(row, maker_active=[False, False]),
                        dict(row, bids=False)]:
            q, reason = market.quote(0, changed, PRICE_SCALE, 7)
            self.assertIsNone(q)
            self.assertIsNotNone(reason)
        self.assertEqual(snapshot(market), before)
        market.check()

    def test_funding_rechecked_after_quote(self):
        market, row = self.market()
        quote, _ = market.quote(0, row, PRICE_SCALE, 7)
        # Move inventory within the ledger after quote construction; never top up cash.
        moved = market.makers[0].cash
        market.makers[0].cash = 0
        market.makers[1].cash += moved
        before = snapshot(market)
        self.assertFalse(market.execute(quote, row))
        self.assertEqual(snapshot(market), before)
        market.check()

    def test_large_size_fails_depth_without_partial_fill(self):
        market, row = self.market(10000)
        before = snapshot(market)
        quote, reason = market.quote(0, row, PRICE_SCALE, 7)
        self.assertIsNone(quote)
        self.assertEqual(reason, 'DEPTH_LIMIT')
        self.assertEqual(snapshot(market), before)

    def test_settlement_uses_maturity_not_later_spot(self):
        market, row = self.market()
        quote = self.acquire(market, row)
        maturity = dict(row, day=7, spot=str(4*PRICE_SCALE), resolution_delay_days=7)
        market.settle(maturity)
        before = market.user.cash
        self.assertIsNone(market.cash_exit(maturity))
        self.assertEqual(market.quote(0, maturity, PRICE_SCALE, 14)[1], 'UNRESOLVED_SETTLEMENT')
        later = dict(row, day=14, spot=str(24*PRICE_SCALE//10))
        market.settle(later)
        expected = quote.quantity*(Q//5)//Q  # strike 0.8 / maturity 4
        self.assertEqual(market.user.cash-before, expected)
        self.assertEqual(market.series[0].observed, 4*PRICE_SCALE)
        market.settle(later)
        self.assertEqual(market.user.cash-before, expected)
        market.check()

    def test_permanent_source_loss_never_settles(self):
        market, row = self.market()
        self.acquire(market, row)
        market.settle(dict(row, day=7, resolution_delay_days=None, observation_available=False))
        market.settle(dict(row, day=100))
        self.assertFalse(market.series[0].final)
        self.assertGreater(market.user.position(0)[0], 0)
        market.check()

    def test_future_suffix_does_not_change_prior_actions(self):
        path = scenario('normal', 101)
        altered = copy.deepcopy(path)
        for row in altered['rows'][31:]:
            row['spot'] = str(100*PRICE_SCALE)
            row['maker_active'] = [False, False]
            row['resolution_delay_days'] = None
        a = run(CONFIG, path, 'hybrid', 7, 4000, 100)
        b = run(CONFIG, altered, 'hybrid', 7, 4000, 100)
        self.assertEqual(a['daily'][:31], b['daily'][:31])

    def test_scenarios_have_disjoint_seeds_and_extreme_gap(self):
        data = bundle()
        self.assertFalse(set(data['splits']['train']) & set(data['splits']['held_out']))
        normal = scenario('normal', 101)['rows']
        crash = scenario('crash_80', 101)['rows']
        self.assertAlmostEqual(int(crash[21]['spot'])/int(normal[21]['spot']), 0.2, places=10)
        self.assertEqual(len(data['paths']), 68)

    def test_debt_gap_latency_and_equal_wealth(self):
        path = scenario('crash_80', 101)
        debt = debt_benchmark(CONFIG, path, 100)
        self.assertEqual(debt['values'][0], 100)
        self.assertGreaterEqual(debt['liquidation_day'], 23)
        self.assertGreater(debt['lender_bad_debt_usd'], 0)
        self.assertGreater(debt['interest_usd'], 0)
        fast = copy.deepcopy(CONFIG)
        fast['debt']['oracle_lag_days'] = 0
        self.assertEqual(debt_benchmark(fast, path, 100)['liquidation_day'], 21)

    def test_selection_rejects_holdout_and_free_cash_false_success(self):
        row = {'split':'train','scenario':'normal','policy':'short','wealth_usd':100,
               'configuration':'candidate','annual_friction':0.01,'roll_windows':10,
               'roll_completed':10,'acquired':True,'tracking_volatility':0.1,'terminal_return':-0.01}
        selected, _ = selection([row], CONFIG)
        self.assertEqual(selected['100'], 'candidate')
        selected, _ = selection([dict(row, acquired=False)], CONFIG)
        self.assertIsNone(selected['100'])
        selected, _ = selection([dict(row, roll_completed=9)], CONFIG)
        self.assertIsNone(selected['100'])
        with self.assertRaises(AssertionError):
            selection([dict(row, split='held_out')], CONFIG)

    def test_metric_definitions(self):
        p = performance([100, 50, 75], 100)
        self.assertEqual(p['terminal_return'], -0.25)
        self.assertEqual(p['max_drawdown'], 0.5)
        a = aggregate([p, performance([100, 100], 100)])
        self.assertEqual(a['terminal_shortfall_frequency'], 0.5)
        self.assertEqual(a['tail_expected_shortfall_5pct'], 0.25)

    def test_no_bid_is_missing_cash_exit_not_zero(self):
        market, row = self.market()
        self.acquire(market, row)
        self.assertGreater(market.value(market.user, row), 0)
        before = snapshot(market)
        self.assertIsNone(market.cash_exit(dict(row, bids=False)))
        self.assertEqual(snapshot(market), before)

    def test_failed_entry_remains_deferred_and_maker_capital_is_finite(self):
        result = run(CONFIG, scenario('normal', 101), 'short', 7, 4000, 10000)
        self.assertFalse(result['acquired'])
        self.assertTrue(all(d['state'] == 'ROLL_DEFERRED' for d in result['daily']))
        market, row = self.market()
        # Transfer maker funds to its peer to keep total funding constant.
        market.makers[1].cash += market.makers[0].cash-Q
        market.makers[0].cash = Q
        market.cfg = dict(CONFIG, maker_loss_stop_bps=10000)
        before = snapshot(market)
        quote, reason = market.quote(0, row, PRICE_SCALE, 7)
        self.assertIsNone(quote)
        self.assertEqual(reason, 'MAKER_CAPITAL')
        self.assertEqual(snapshot(market), before)
        market.check()

    def test_all_stress_paths_conserve_and_costs_remain_explicit(self):
        for name in ('crash_80', 'no_bids', 'maker_exit', 'source_outage', 'resolution_loss'):
            result = run(CONFIG, scenario(name, 1001), 'short', 7, 4000, 100)
            self.assertGreater(result['costs_usd']['gas'], 0)
            self.assertEqual(result['maker_topups_near'], 0)
            self.assertEqual(result['operating_subsidy_usd'], 0)
            if name == 'resolution_loss':
                self.assertGreater(result['unresolved'][-1], 0)


if __name__ == '__main__':
    unittest.main()

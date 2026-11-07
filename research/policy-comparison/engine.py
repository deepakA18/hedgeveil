"""Bounded synthetic market. No chain interaction, signed RFQs or vault shares."""
from collections import Counter
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'reference-model'))
from payoff import Q, PRICE_SCALE, coefficients, redeem
from pricing import p_ratio

BPS = 10000


def ceildiv(n, d):
    return (n+d-1)//d


def atomic(value):
    return int(Decimal(str(value))*Q)


def usd(amount, spot):
    # Reporting only; funding never consumes this float.
    return amount*spot/(Q*PRICE_SCALE)


@dataclass
class Account:
    cash: int
    positions: dict = field(default_factory=dict)

    def position(self, sid):
        return self.positions.get(sid, [0, 0])

    def add(self, sid, leg, amount):
        p = self.positions.setdefault(sid, [0, 0])
        p[leg] += amount
        assert p[leg] >= 0
        if p == [0, 0]:
            del self.positions[sid]


@dataclass
class Series:
    strike: int
    maturity: int
    minted: int
    reserve: int
    p: int
    n: int
    paid: int = 0
    dust: int = 0
    merged: int = 0
    observed: int = None
    final_day: int = None
    final: bool = False
    observation_available: bool = True


@dataclass(frozen=True)
class Quote:
    maker: int
    day: int
    expires: int
    revision: int
    old_id: int
    old_amount: int
    old_bid: int
    quantity: int
    new_cost: int
    fee: int
    oracle: int
    strike: int
    maturity: int
    spread_cost: int
    roll_mark_change: int


class Market:
    def __init__(self, config, wealth_usd, first_spot):
        self.cfg = config
        self.user = Account(wealth_usd*Q*PRICE_SCALE//first_spot)
        self.makers = [Account(x*Q) for x in config['maker_capital_near']]
        self.initial_maker = [x.cash for x in self.makers]
        self.initial = self.user.cash + sum(self.initial_maker)
        self.series = {}
        self.revision = 0
        self.sinks = Counter()
        self.costs_usd = Counter()
        self.fills = Counter()
        self.max_locked = [0, 0]
        self.peak_cash_used = [0, 0]
        self.roll_changes = []

    def mark_ratio(self, sid, row):
        s = self.series[sid]
        if s.observed is not None and (s.observation_available or s.final):
            return coefficients(s.strike, s.observed)[0]
        return p_ratio(int(row['spot']), s.strike, max(0, s.maturity-row['day']))

    def value(self, account, row):
        total = account.cash
        for sid, (p, n) in account.positions.items():
            ratio = self.mark_ratio(sid, row)
            total += p*ratio//Q + n*(Q-ratio)//Q
        return total

    def settle(self, row):
        day = row['day']
        for sid, s in self.series.items():
            if day == s.maturity:
                s.observed = int(row['spot'])
                s.observation_available = row['observation_available']
                delay = row['resolution_delay_days']
                s.final_day = None if delay is None else day+delay
            if not s.final and s.observed is not None and s.final_day is not None and day >= s.final_day:
                s.final = True
                pq, nq = coefficients(s.strike, s.observed)
                for account in [self.user]+self.makers:
                    p, n = account.position(sid)
                    payout = redeem(p, pq)[0]+redeem(n, nq)[0]
                    account.cash += payout
                    account.positions.pop(sid, None)
                    s.p -= p
                    s.n -= n
                    s.paid += payout
                    s.reserve -= payout
                s.dust += s.reserve
                self.sinks['dust'] += s.reserve
                s.reserve = 0
                self.revision += 1

    def charge_gas(self, row):
        gas = atomic(self.cfg['gas_near'])
        if self.user.cash < gas:
            return False
        self.user.cash -= gas
        self.sinks['gas'] += gas
        self.costs_usd['gas'] += usd(gas, int(row['spot']))
        self.revision += 1
        return True

    def holding(self):
        holdings = [(sid, p[0]) for sid, p in self.user.positions.items() if p[0]]
        assert len(holdings) <= 1
        return holdings[0] if holdings else (None, 0)

    def maker_gate(self, i, row):
        if not row['reference_fresh']:
            return 'STALE_REFERENCE'
        if not row['maker_active'][i]:
            return 'MAKER_WITHDRAWN'
        equity = self.value(self.makers[i], row)
        if equity*BPS < self.initial_maker[i]*(BPS-self.cfg['maker_loss_stop_bps']):
            return 'MAKER_LOSS_LIMIT'
        return None

    def half_spread(self, i, row):
        equity = self.value(self.makers[i], row)
        locked = max(0, equity-self.makers[i].cash)
        skew = locked*self.cfg['inventory_skew_bps']//max(1, equity)
        return self.cfg['half_spread_bps'][i]*row['spread_multiplier']+skew

    def quote(self, i, row, strike, maturity):
        failure = self.maker_gate(i, row)
        if failure:
            return None, failure
        sid, old = self.holding()
        if sid is not None and row['day'] >= self.series[sid].maturity:
            return None, 'UNRESOLVED_SETTLEMENT'
        if old and not row['bids']:
            return None, 'NO_BID'
        spread = self.half_spread(i, row)
        if spread > self.cfg['maximum_half_spread_bps']:
            return None, 'SPREAD_LIMIT'
        spot = int(row['spot'])
        new_mark = p_ratio(spot, strike, maturity-row['day'])
        ask = ceildiv(new_mark*(BPS+spread), BPS)
        if not ask:
            return None, 'ZERO_QUOTE'
        old_mark = self.mark_ratio(sid, row) if old else 0
        bid = old_mark*(BPS-spread)//BPS
        old_bid = old*bid//Q
        old_fee = ceildiv(old_bid*self.cfg['fee_bps'], BPS)
        oracle = atomic(self.cfg['oracle_near'])
        budget = self.user.cash*(BPS-self.cfg['cash_buffer_bps'])//BPS + old_bid - old_fee-oracle
        if budget <= 0:
            return None, 'USER_CASH'
        quantity = budget*Q*BPS//(ask*(BPS+self.cfg['fee_bps']))
        new_cost = ceildiv(quantity*ask, Q)
        fee = old_fee+ceildiv(new_cost*self.cfg['fee_bps'], BPS)
        if quantity <= 0 or self.user.cash+old_bid < new_cost+fee+oracle:
            return None, 'USER_CASH'
        if old_bid+new_cost > self.cfg['maker_quote_limit_near']*Q:
            return None, 'DEPTH_LIMIT'
        if self.makers[i].cash+new_cost < old_bid+quantity:
            return None, 'MAKER_CAPITAL'
        spread_cost = new_cost-quantity*new_mark//Q + old*old_mark//Q-old_bid
        change = quantity*new_mark//Q-old*old_mark//Q
        return Quote(i, row['day'], row['day']+self.cfg['quote_ttl_days'], self.revision,
                     sid, old, old_bid, quantity, new_cost, fee, oracle, strike,
                     maturity, spread_cost, change), None

    def execute(self, quote, row):
        # Revalidate before any mutation: outdated quotes cannot spend updated funds.
        if row['day'] > quote.expires or quote.revision != self.revision:
            return False
        fresh, _ = self.quote(quote.maker, row, quote.strike, quote.maturity)
        if fresh != quote:
            return False
        maker = self.makers[quote.maker]
        self.user.cash += quote.old_bid-quote.new_cost-quote.fee-quote.oracle
        maker.cash += quote.new_cost-quote.old_bid-quote.quantity
        self.sinks['fee'] += quote.fee
        self.sinks['oracle'] += quote.oracle
        spot = int(row['spot'])
        for name, value in [('fee', quote.fee), ('oracle', quote.oracle), ('spread', quote.spread_cost)]:
            self.costs_usd[name] += usd(value, spot)
        if quote.old_id is not None:
            self.costs_usd['roll_mark_change'] += usd(quote.roll_mark_change, spot)
            old = self.series[quote.old_id]
            old_mark = self.mark_ratio(quote.old_id, row)
            new_mark = p_ratio(spot, quote.strike, quote.maturity-row['day'])
            self.roll_changes.append({
                'day': row['day'],
                'unit_model_price_change': new_mark/old_mark-1 if old_mark else None,
                'target_notional_change': quote.quantity*quote.strike/(quote.old_amount*old.strike)-1,
            })
            self.user.add(quote.old_id, 0, -quote.old_amount)
            maker.add(quote.old_id, 0, quote.old_amount)
            # Equal old P/N may merge before finality, freeing actual backing.
            amount = min(maker.position(quote.old_id))
            if amount:
                s = self.series[quote.old_id]
                maker.add(quote.old_id, 0, -amount)
                maker.add(quote.old_id, 1, -amount)
                maker.cash += amount
                s.reserve -= amount
                s.p -= amount
                s.n -= amount
                s.merged += amount
        sid = len(self.series)
        self.series[sid] = Series(quote.strike, quote.maturity, quote.quantity,
                                  quote.quantity, quote.quantity, quote.quantity)
        self.user.add(sid, 0, quote.quantity)
        maker.add(sid, 1, quote.quantity)
        self.fills[quote.maker] += 1
        self.revision += 1
        self.check()
        return True

    def cash_exit(self, row):
        sid, amount = self.holding()
        if not amount:
            return self.user.cash
        if row['day'] >= self.series[sid].maturity or not row['bids']:
            return None
        bids = []
        for i, maker in enumerate(self.makers):
            if self.maker_gate(i, row):
                continue
            spread = self.half_spread(i, row)
            if spread > self.cfg['maximum_half_spread_bps']:
                continue
            bid = amount*self.mark_ratio(sid, row)*(BPS-spread)//(Q*BPS)
            fee, gas = ceildiv(bid*self.cfg['fee_bps'], BPS), atomic(self.cfg['gas_near'])
            if bid <= min(maker.cash, self.cfg['maker_quote_limit_near']*Q) and self.user.cash+bid >= fee+gas:
                bids.append(self.user.cash+bid-fee-gas)
        return max(bids) if bids else None

    def check(self):
        actors = [self.user]+self.makers
        assert all(a.cash >= 0 for a in actors)
        assert sum(a.cash for a in actors)+sum(s.reserve for s in self.series.values())+sum(self.sinks.values()) == self.initial
        for sid, s in self.series.items():
            assert sum(a.position(sid)[0] for a in actors) == s.p
            assert sum(a.position(sid)[1] for a in actors) == s.n
            assert s.reserve >= 0 and s.p >= 0 and s.n >= 0
            assert s.reserve+s.paid+s.dust+s.merged == s.minted
            if not s.final:
                assert s.p == s.n == s.reserve
        for i, maker in enumerate(self.makers):
            # Nominal claim inventory; not double-counted as liquid cash or reserve.
            self.max_locked[i] = max(self.max_locked[i], sum(max(p) for p in maker.positions.values()))
            self.peak_cash_used[i] = max(self.peak_cash_used[i], self.initial_maker[i]-maker.cash)


def run(config, path, policy, tenor, strike_bps, wealth):
    market = Market(config, wealth, int(path['rows'][0]['spot']))
    values, exits, unresolved, daily = [], [], [], []
    rejections = Counter()
    attempts = rolls = completed = 0
    times = []
    pending = (0, 2, 'initial')
    acquired = False
    last_entry = None
    last_fill = -1000
    armed = True
    costs_at_entry = 0.0
    deferred = False
    for row in path['rows']:
        day, spot = row['day'], int(row['spot'])
        market.settle(row)
        sid, amount = market.holding()
        if pending is not None and day > pending[1]:
            pending = None
            deferred = True
        if acquired and policy != 'hold' and pending is None:
            distance = abs(spot-last_entry)*BPS//last_entry
            if distance <= config['hybrid_rearm_bps']:
                armed = True
            trigger = policy == 'hybrid' and armed and distance >= config['hybrid_trigger_bps'] and day-last_fill >= config['hybrid_cooldown_days']
            scheduled = sid is None or day >= market.series[sid].maturity-config['roll_window_days']
            # No new request against the same unresolved maturity after its window failed.
            if (scheduled or trigger) and (sid is None or day < market.series[sid].maturity):
                end = day+config['roll_window_days']
                if sid is not None:
                    end = min(end, market.series[sid].maturity-1)
                pending = (day, end, 'roll')
                rolls += 1
                armed = False
        if pending is not None:
            deferred = True
            attempts += 1
            if not market.charge_gas(row):
                rejections['GAS_CASH'] += 1
            else:
                strike = spot*strike_bps//BPS
                quotes = []
                for i in range(len(market.makers)):
                    quote, reason = market.quote(i, row, strike, day+tenor)
                    if quote:
                        quotes.append(quote)
                    else:
                        rejections[reason] += 1
                if quotes:
                    chosen = max(quotes, key=lambda q: (q.quantity, -q.maker))
                    assert market.execute(chosen, row)
                    times.append(day-pending[0])
                    if pending[2] == 'roll':
                        completed += 1
                    else:
                        costs_at_entry = sum(v for k, v in market.costs_usd.items() if k != 'roll_mark_change')
                    pending = None
                    deferred = False
                    acquired = True
                    last_entry, last_fill = spot, day
                    armed = True
        market.check()
        value = usd(market.value(market.user, row), spot)
        cash = market.cash_exit(row)
        locked = sum(usd(p[0]*market.mark_ratio(s, row)//Q, spot)
                     for s, p in market.user.positions.items() if day >= market.series[s].maturity)
        values.append(value)
        exits.append(None if cash is None else usd(cash, spot))
        unresolved.append(locked)
        daily.append({'day': day, 'spot': row['spot'], 'model_value_usd': round(value, 8),
                      'cash_exit_usd': None if cash is None else round(usd(cash, spot), 8),
                      'unresolved_model_usd': round(locked, 8), 'cash_atomic': str(market.user.cash),
                      'claims': {str(s): [str(x) for x in p] for s, p in market.user.positions.items()},
                      'state': 'MATURED_PENDING' if locked else ('ROLL_DEFERRED' if deferred else 'HOLDING'),
                      'fills': sum(market.fills.values())})
    last = path['rows'][-1]
    maker_pl = [usd(market.value(m, last)-initial, int(last['spot'])) for m, initial in zip(market.makers, market.initial_maker)]
    maker_usd_pl = [usd(market.value(m, last), int(last['spot']))-usd(initial, int(path['rows'][0]['spot'])) for m, initial in zip(market.makers, market.initial_maker)]
    return {'values': values, 'exits': exits, 'unresolved': unresolved, 'daily': daily,
            'acquired': acquired, 'attempts': attempts, 'roll_windows': rolls,
            'roll_completed': completed, 'time_to_fill_days': times,
            'rejections': dict(rejections), 'costs_usd': dict(market.costs_usd),
            'initial_acquisition_cost_usd': costs_at_entry,
            'roll_changes': market.roll_changes,
            'maker_pl_vs_near_usd': maker_pl, 'maker_total_usd_pl': maker_usd_pl,
            'maker_initial_capital_near': config['maker_capital_near'],
            'maker_max_inventory_pairs_near': [x/Q for x in market.max_locked],
            'maker_peak_cash_used_near': [x/Q for x in market.peak_cash_used],
            'maker_fill_counts': [market.fills[i] for i in range(len(market.makers))],
            'maker_topups_near': 0, 'operating_subsidy_usd': 0,
            'maker_opportunity_cost_usd': sum(config['maker_capital_near'])*int(path['rows'][0]['spot'])/PRICE_SCALE*config['maker_opportunity_rate_bps']/BPS*config['days']/365,
            'final_sinks_atomic': {k: str(v) for k, v in market.sinks.items()}}

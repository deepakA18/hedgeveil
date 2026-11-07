"""Diagnostic prices only. Floating point never enters the funding ledger."""
from decimal import Decimal, ROUND_FLOOR
from functools import lru_cache
import math

Q = 10**24
PRICE_SCALE = 10**12


def call_usd(spot, strike, days, sigma=0.8, rate=0.03):
    if spot <= 0 or strike <= 0 or days < 0 or sigma < 0:
        raise ValueError('invalid model input')
    t = days / 365
    if t == 0:
        return max(spot - strike, 0.0)
    if sigma == 0:
        return max(spot - strike * math.exp(-rate * t), 0.0)
    v = sigma * math.sqrt(t)
    d1 = (math.log(spot / strike) + (rate + sigma * sigma / 2) * t) / v
    cdf = lambda x: 0.5 * math.erfc(-x / math.sqrt(2))
    return max(0.0, min(spot, spot * cdf(d1) - strike * math.exp(-rate*t) * cdf(d1-v)))


def binomial_call(spot, strike, days, sigma=0.8, rate=0.03, steps=1200):
    """Independent terminal binomial expectation, using log probabilities."""
    if days == 0:
        return max(spot-strike, 0.0)
    if sigma <= 0:
        return max(spot-strike*math.exp(-rate*days/365), 0.0)
    dt = days / 365 / steps
    u = math.exp(sigma * math.sqrt(dt))
    d = 1/u
    prob = (math.exp(rate * dt)-d)/(u-d)
    if not 0 < prob < 1:
        raise ValueError('invalid tree probability')
    result = 0.0
    for ups in range(steps+1):
        terminal = spot * math.exp((2*ups-steps)*math.log(u))
        if terminal > strike:
            logp = (math.lgamma(steps+1)-math.lgamma(ups+1)-math.lgamma(steps-ups+1)
                    + ups*math.log(prob)+(steps-ups)*math.log1p(-prob))
            result += math.exp(logp)*(terminal-strike)
    return math.exp(-rate*days/365)*result


@lru_cache(maxsize=250000)
def p_ratio(spot, strike, days):
    s, k = spot/PRICE_SCALE, strike/PRICE_SCALE
    value = max(0.0, min(1.0, (s-call_usd(s, k, days))/s))
    return min(Q, max(0, int((Decimal(str(value))*Q).to_integral_value(rounding=ROUND_FLOOR))))

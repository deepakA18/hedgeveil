"""Independent exact financial reference. No market quotes, secrets, or networking."""
from fractions import Fraction

Q = 10**24
PRICE_SCALE = 10**12
MAX_U128 = 2**128 - 1


def uint128(value):
    if type(value) is not int or not 0 <= value <= MAX_U128:
        raise ValueError("expected an unsigned 128-bit integer")
    return value


def ideal_fractions(strike, observed, allow_zero=False):
    uint128(strike)
    uint128(observed)
    if strike == 0:
        raise ValueError("strike must be positive")
    if type(allow_zero) is not bool:
        raise ValueError("zero-price policy must be explicit")
    if observed == 0 and not allow_zero:
        raise ValueError("zero observation rejected by policy")
    p = Fraction(1) if observed <= strike else Fraction(strike, observed)
    return p, 1 - p


def coefficients(strike, observed, allow_zero=False):
    p, _ = ideal_fractions(strike, observed, allow_zero)
    p_q = int(p * Q)
    return p_q, Q - p_q


def redeem(amount, coefficient):
    uint128(amount)
    uint128(coefficient)
    if coefficient > Q:
        raise ValueError("coefficient exceeds Q")
    exact = Fraction(amount * coefficient, Q)
    payout = int(exact)
    return payout, amount * coefficient - payout * Q


def settlement(amount, strike, observed, allow_zero=False):
    p_q, n_q = coefficients(strike, observed, allow_zero)
    p, p_rem = redeem(amount, p_q)
    n, n_rem = redeem(amount, n_q)
    return dict(p_q=p_q, n_q=n_q, p_payout=p, n_payout=n,
                p_remainder=p_rem, n_remainder=n_rem, dust=amount-p-n)


def inverse_price(near_per_usd):
    """Explicit conversion before price-scale quantization; never use floats."""
    if not isinstance(near_per_usd, Fraction) or near_per_usd <= 0:
        raise ValueError("expected a positive Fraction in NEAR/USD")
    return 1 / near_per_usd


def value_at_finalization(payout_atomic, final_price):
    uint128(payout_atomic)
    uint128(final_price)
    return Fraction(payout_atomic * final_price, Q * PRICE_SCALE)


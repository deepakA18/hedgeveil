import random
import unittest
from fractions import Fraction
from payoff import (MAX_U128, PRICE_SCALE, Q, coefficients, ideal_fractions,
                    inverse_price, redeem, settlement, value_at_finalization)


class PayoffTests(unittest.TestCase):
    def test_documented_examples(self):
        for price, expected in [(8, Q//4), (4, Q//2), (2, Q), (1, Q)]:
            r = settlement(Q, 2*PRICE_SCALE, price*PRICE_SCALE)
            self.assertEqual(r["p_payout"], expected)
            self.assertEqual(r["p_payout"] + r["n_payout"], Q)

    def test_exact_usd_identity(self):
        rng = random.Random(20261107)
        for _ in range(2000):
            amount, strike, observed = [rng.randrange(1, MAX_U128) for _ in range(3)]
            p, n = ideal_fractions(strike, observed)
            self.assertEqual(amount*p*observed, amount*min(strike, observed))
            self.assertEqual(amount*n*observed, amount*max(observed-strike, 0))
            self.assertEqual(p+n, 1)
            r = settlement(amount, strike, observed)
            self.assertIn(r["dust"], (0, 1))
            self.assertLess(r["p_remainder"], Q)
            self.assertLess(r["n_remainder"], Q)
            self.assertLessEqual(Fraction(r["p_q"], Q), p)
            self.assertLess(p-Fraction(r["p_q"], Q), Fraction(1, Q))

    def test_splitting_redemptions_cannot_increase_payout(self):
        rng = random.Random(71)
        for _ in range(1000):
            amount = rng.randrange(MAX_U128)
            first = rng.randrange(amount+1)
            coef = rng.randrange(Q+1)
            self.assertLessEqual(redeem(first, coef)[0] + redeem(amount-first, coef)[0],
                                 redeem(amount, coef)[0])

    def test_invalid_inputs_and_explicit_zero(self):
        for bad in (-1, MAX_U128+1, 1.5, True, "1"):
            with self.assertRaises(ValueError): coefficients(bad, 1)
            with self.assertRaises(ValueError): redeem(bad, Q)
        with self.assertRaises(ValueError): coefficients(0, 1)
        with self.assertRaises(ValueError): coefficients(1, 0)
        with self.assertRaises(ValueError): coefficients(1, 0, "allow")
        with self.assertRaises(ValueError): redeem(1, Q+1)
        self.assertEqual(coefficients(1, 0, True), (Q, 0))

    def test_inverse_units_and_delay_exposure(self):
        self.assertEqual(inverse_price(Fraction(1, 4)), 4)
        with self.assertRaises(ValueError): inverse_price(Fraction(0))
        r = settlement(Q, 2*PRICE_SCALE, 4*PRICE_SCALE)
        self.assertEqual(value_at_finalization(r["p_payout"], 24*PRICE_SCALE//10), Fraction(6, 5))


if __name__ == "__main__":
    unittest.main()

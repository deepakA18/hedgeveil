//! Deterministic arithmetic only. This crate does not authorize settlement or funds.
use primitive_types::U256;

pub const Q: u128 = 1_000_000_000_000_000_000_000_000;
/// USD per NEAR, with twelve decimal places. Both prices must use this scale.
pub const PRICE_SCALE: u128 = 1_000_000_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathError {
    ZeroStrike,
    ZeroPriceRejected,
    InvalidCoefficient,
    DivisionByZero,
    Overflow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZeroPricePolicy {
    Reject,
    /// Mathematical branch only; the caller must authenticate the oracle policy.
    AllowExplicit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Coefficients {
    p: u128,
    n: u128,
}

impl Coefficients {
    pub fn p(self) -> u128 {
        self.p
    }
    pub fn n(self) -> u128 {
        self.n
    }
}

/// Finalize complementary coefficients. Never use a current price as a substitute
/// for a missing historical observation. Oracle authentication is outside this crate.
pub fn coefficients(
    strike: u128,
    observed: u128,
    zero: ZeroPricePolicy,
) -> Result<Coefficients, MathError> {
    if strike == 0 {
        return Err(MathError::ZeroStrike);
    }
    if observed == 0 && zero == ZeroPricePolicy::Reject {
        return Err(MathError::ZeroPriceRejected);
    }
    let p = if observed <= strike {
        Q
    } else {
        mul_div_floor(strike, Q, observed)?
    };
    Ok(Coefficients { p, n: Q - p })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Redemption {
    pub payout: u128,
    pub remainder: u128,
}

pub fn redeem(amount: u128, coefficient: u128) -> Result<Redemption, MathError> {
    if coefficient > Q {
        return Err(MathError::InvalidCoefficient);
    }
    let product = wide_product(amount, coefficient)?;
    Ok(Redemption {
        payout: narrow(product / U256::from(Q))?,
        remainder: narrow(product % U256::from(Q))?,
    })
}

/// Checked wide intermediates; never saturate a financial result.
pub fn mul_div_floor(a: u128, b: u128, divisor: u128) -> Result<u128, MathError> {
    if divisor == 0 {
        return Err(MathError::DivisionByZero);
    }
    narrow(wide_product(a, b)? / U256::from(divisor))
}

/// Required basket inputs round up; outputs use `mul_div_floor`.
pub fn mul_div_ceil(a: u128, b: u128, divisor: u128) -> Result<u128, MathError> {
    if divisor == 0 {
        return Err(MathError::DivisionByZero);
    }
    let product = wide_product(a, b)?;
    let d = U256::from(divisor);
    let quotient = narrow(product / d)?;
    if product % d == U256::zero() {
        Ok(quotient)
    } else {
        quotient.checked_add(1).ok_or(MathError::Overflow)
    }
}

fn wide_product(a: u128, b: u128) -> Result<U256, MathError> {
    U256::from(a)
        .checked_mul(U256::from(b))
        .ok_or(MathError::Overflow)
}

fn narrow(value: U256) -> Result<u128, MathError> {
    if value > U256::from(u128::MAX) {
        Err(MathError::Overflow)
    } else {
        Ok(value.low_u128())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_inputs_fail_closed() {
        assert_eq!(
            coefficients(0, 1, ZeroPricePolicy::Reject),
            Err(MathError::ZeroStrike)
        );
        assert_eq!(
            coefficients(1, 0, ZeroPricePolicy::Reject),
            Err(MathError::ZeroPriceRejected)
        );
        assert_eq!(redeem(1, Q + 1), Err(MathError::InvalidCoefficient));
        assert_eq!(mul_div_floor(1, 1, 0), Err(MathError::DivisionByZero));
        assert_eq!(mul_div_ceil(1, 1, 0), Err(MathError::DivisionByZero));
        assert_eq!(
            mul_div_floor(u128::MAX, u128::MAX, 1),
            Err(MathError::Overflow)
        );
        assert_eq!(
            mul_div_ceil(u128::MAX, u128::MAX, 1),
            Err(MathError::Overflow)
        );
    }

    #[test]
    fn wide_intermediates_and_basket_rounding() {
        assert_eq!(
            mul_div_floor(u128::MAX, u128::MAX, u128::MAX),
            Ok(u128::MAX)
        );
        assert_eq!(mul_div_floor(7, 3, 4), Ok(5));
        assert_eq!(mul_div_ceil(7, 3, 4), Ok(6));
        assert_eq!(mul_div_ceil(8, 3, 4), Ok(6));
        assert_eq!(mul_div_ceil(0, u128::MAX, 3), Ok(0));
    }
}

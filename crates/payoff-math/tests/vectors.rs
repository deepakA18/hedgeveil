use payoff_math::{coefficients, redeem, ZeroPricePolicy, Q};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VectorFile {
    schema_version: u32,
    seed: u64,
    vectors: Vec<Vector>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Vector {
    id: String,
    amount: String,
    strike: String,
    observed: String,
    allow_zero: bool,
    p_q: String,
    n_q: String,
    p_payout: String,
    n_payout: String,
    p_remainder: String,
    n_remainder: String,
    dust: String,
}

#[test]
fn matches_independent_python_vectors() {
    let file: VectorFile =
        serde_json::from_str(include_str!("../../../fixtures/payoff-vectors.json")).unwrap();
    assert_eq!(file.schema_version, 1);
    assert_eq!(file.seed, 20261107);
    assert!(file.vectors.len() >= 500);
    for v in file.vectors {
        let amount: u128 = v.amount.parse().unwrap();
        let zero = if v.allow_zero {
            ZeroPricePolicy::AllowExplicit
        } else {
            ZeroPricePolicy::Reject
        };
        let c = coefficients(v.strike.parse().unwrap(), v.observed.parse().unwrap(), zero).unwrap();
        let p = redeem(amount, c.p()).unwrap();
        let n = redeem(amount, c.n()).unwrap();
        assert_eq!(c.p().to_string(), v.p_q, "{} P coefficient", v.id);
        assert_eq!(c.n().to_string(), v.n_q, "{} N coefficient", v.id);
        assert_eq!(p.payout.to_string(), v.p_payout, "{} P payout", v.id);
        assert_eq!(n.payout.to_string(), v.n_payout, "{} N payout", v.id);
        assert_eq!(
            p.remainder.to_string(),
            v.p_remainder,
            "{} P remainder",
            v.id
        );
        assert_eq!(
            n.remainder.to_string(),
            v.n_remainder,
            "{} N remainder",
            v.id
        );
        assert_eq!(
            (amount - p.payout - n.payout).to_string(),
            v.dust,
            "{} dust",
            v.id
        );
        assert_eq!(c.p() + c.n(), Q);
        assert!(p.remainder < Q && n.remainder < Q);
    }
}

//! Noncustodial Groth16 host compatibility spike.
use ark_bn254::{Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_ec::AffineRepr;
use ark_ff::{BigInt, PrimeField};
use near_sdk::{env, near, PanicOnDefault};

const INPUTS: usize = 9;

#[near(serializers = [json, borsh])]
#[serde(deny_unknown_fields)]
pub struct VerificationKey {
    pub alpha: String,
    pub beta: String,
    pub gamma: String,
    pub delta: String,
    pub ic: Vec<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct VerifierSpike {
    vk: VerificationKey,
    domain: String,
    asset: String,
    root: String,
}

fn bytes(s: &str, size: usize) -> Option<Vec<u8>> {
    if s.len() != size * 2
        || s.bytes()
            .any(|c| !c.is_ascii_digit() && !(b'a'..=b'f').contains(&c))
    {
        return None;
    }
    hex::decode(s).ok()
}
fn integer(raw: &[u8]) -> Option<BigInt<4>> {
    if raw.len() != 32 {
        return None;
    }
    Some(BigInt(std::array::from_fn(|i| {
        u64::from_le_bytes(raw[i * 8..i * 8 + 8].try_into().unwrap())
    })))
}
fn fq(raw: &[u8]) -> Option<Fq> {
    Fq::from_bigint(integer(raw)?)
}
fn scalar(raw: &[u8]) -> bool {
    integer(raw).and_then(Fr::from_bigint).is_some()
}
fn point1(raw: &[u8]) -> bool {
    if raw.len() != 64 {
        return false;
    }
    let Some(x) = fq(&raw[..32]) else {
        return false;
    };
    let Some(y) = fq(&raw[32..]) else {
        return false;
    };
    let p = G1Affine::new_unchecked(x, y);
    !p.is_zero() && p.is_on_curve() && p.is_in_correct_subgroup_assuming_on_curve()
}
fn point2(raw: &[u8]) -> bool {
    if raw.len() != 128 {
        return false;
    }
    let coords = raw.chunks(32).map(fq).collect::<Option<Vec<_>>>();
    let Some(c) = coords else {
        return false;
    };
    let p = G2Affine::new_unchecked(Fq2::new(c[0], c[1]), Fq2::new(c[2], c[3]));
    !p.is_zero() && p.is_on_curve() && p.is_in_correct_subgroup_assuming_on_curve()
}

#[near]
impl VerifierSpike {
    #[init]
    #[private]
    pub fn new(vk: VerificationKey, domain: String, asset: String, root: String) -> Self {
        assert_eq!(vk.ic.len(), INPUTS + 1, "wrong key arity");
        for p in std::iter::once(&vk.alpha).chain(vk.ic.iter()) {
            assert!(bytes(p, 64).is_some_and(|b| point1(&b)), "invalid G1 key");
        }
        for p in [&vk.beta, &vk.gamma, &vk.delta] {
            assert!(bytes(p, 128).is_some_and(|b| point2(&b)), "invalid G2 key");
        }
        for v in [&domain, &asset, &root] {
            assert!(bytes(v, 32).is_some_and(|b| scalar(&b)), "invalid scalar");
        }
        Self {
            vk,
            domain,
            asset,
            root,
        }
    }

    /// A view-only benchmark. Does not spend notes, hold deposits, or prevent ledger replay.
    pub fn verify(&self, proof: String, public_inputs: Vec<String>) -> bool {
        if public_inputs.len() != INPUTS
            || public_inputs[0] != self.domain
            || public_inputs[1] != self.asset
            || public_inputs[2] != self.root
        {
            return false;
        }
        let Some(proof) = bytes(&proof, 256) else {
            return false;
        };
        if !point1(&proof[..64]) || !point2(&proof[64..192]) || !point1(&proof[192..]) {
            return false;
        }
        let mut multiexp = Vec::with_capacity((INPUTS + 1) * 96);
        multiexp.extend(bytes(&self.vk.ic[0], 64).unwrap());
        multiexp.extend([1u8].into_iter().chain([0u8; 31]));
        for (value, point) in public_inputs.iter().zip(self.vk.ic.iter().skip(1)) {
            let Some(raw) = bytes(value, 32) else {
                return false;
            };
            if !scalar(&raw) {
                return false;
            }
            multiexp.extend(bytes(point, 64).unwrap());
            multiexp.extend(raw);
        }
        let accumulated = env::alt_bn128_g1_multiexp(&multiexp);
        // e(A,B) * e(-alpha,beta) * e(-acc,gamma) * e(-C,delta) == 1.
        let negate = |p: &[u8]| env::alt_bn128_g1_sum(&[vec![1], p.to_vec()].concat());
        let pairs = [
            proof[..192].to_vec(),
            negate(&bytes(&self.vk.alpha, 64).unwrap()),
            bytes(&self.vk.beta, 128).unwrap(),
            negate(&accumulated),
            bytes(&self.vk.gamma, 128).unwrap(),
            negate(&proof[192..]),
            bytes(&self.vk.delta, 128).unwrap(),
        ]
        .concat();
        env::alt_bn128_pairing_check(&pairs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_ff::BigInteger;
    #[test]
    fn malformed_encodings_fail() {
        assert!(bytes("00", 32).is_none());
        assert!(bytes(&"AA".repeat(32), 32).is_none());
        assert!(!scalar(&[255; 32]));
        assert!(!point1(&[0; 64]));
        assert!(!point1(&[255; 64]));
        assert!(!point2(&[0; 128]));
        assert!(!point2(&[255; 128]));
    }

    #[test]
    fn rejects_on_curve_g2_outside_prime_subgroup() {
        for i in 1u64..100 {
            if let Some(p) =
                G2Affine::get_point_from_x_unchecked(Fq2::new(Fq::from(i), Fq::from(1)), false)
            {
                if !p.is_in_correct_subgroup_assuming_on_curve() {
                    assert!(p.is_on_curve());
                    let raw = [p.x.c0, p.x.c1, p.y.c0, p.y.c1]
                        .iter()
                        .flat_map(|f| f.into_bigint().to_bytes_le())
                        .collect::<Vec<_>>();
                    assert!(!point2(&raw));
                    return;
                }
            }
        }
        panic!("no subgroup-adversary fixture found");
    }
}

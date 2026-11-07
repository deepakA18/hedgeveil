//! Test-only feasibility circuit; not an approved custody circuit.
use ark_bn254::Fr;
use ark_crypto_primitives::sponge::{
    constraints::CryptographicSpongeVar,
    poseidon::{constraints::PoseidonSpongeVar, PoseidonConfig, PoseidonSponge},
    CryptographicSponge,
};
use ark_ff::{AdditiveGroup, UniformRand};
use ark_r1cs_std::{
    alloc::AllocVar, boolean::Boolean, eq::EqGadget, fields::fp::FpVar, prelude::*,
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use rand::Rng;

pub const DEPTH: usize = 20;
pub const PUBLIC_INPUTS: usize = 9;

pub fn config() -> PoseidonConfig<Fr> {
    let p = light_poseidon::parameters::bn254_x5::get_poseidon_parameters::<Fr>(3).unwrap();
    PoseidonConfig::new(
        p.full_rounds,
        p.partial_rounds,
        p.alpha,
        p.mds,
        p.ark.chunks(3).map(|c| c.to_vec()).collect(),
        2,
        1,
    )
}

/// Domain-tagged Arkworks sponge with published BN254 x^5 constants.
/// This is not the circomlib hash wire format; approval remains a G1-ZK gate.
pub fn hash(tag: u64, values: &[Fr]) -> Fr {
    let mut sponge = PoseidonSponge::new(&config());
    sponge.absorb(&Fr::from(tag));
    sponge.absorb(&values.to_vec());
    sponge.squeeze_field_elements(1)[0]
}

fn hash_var(
    cs: ConstraintSystemRef<Fr>,
    tag: u64,
    values: &[FpVar<Fr>],
) -> Result<FpVar<Fr>, SynthesisError> {
    let mut sponge = PoseidonSpongeVar::new(cs, &config());
    sponge.absorb(&FpVar::Constant(Fr::from(tag)))?;
    sponge.absorb(&values.to_vec())?;
    Ok(sponge.squeeze_field_elements(1)?[0].clone())
}

#[derive(Clone)]
pub struct NoteSpend {
    pub public: [Fr; PUBLIC_INPUTS],
    pub spend_secret: Fr,
    pub amount: Fr,
    pub note_secret: Fr,
    pub blinding: Fr,
    pub output_owner: Fr,
    pub output_secret: Fr,
    pub output_blinding: Fr,
    pub siblings: [Fr; DEPTH],
    pub directions: [bool; DEPTH],
}

impl NoteSpend {
    pub fn sample(rng: &mut impl Rng) -> Self {
        let mut result = Self {
            public: [Fr::ZERO; PUBLIC_INPUTS],
            spend_secret: Fr::rand(rng),
            amount: Fr::from(1_000_000_000_000_000_000_000_000u128),
            note_secret: Fr::rand(rng),
            blinding: Fr::rand(rng),
            output_owner: hash(1, &[Fr::rand(rng)]),
            output_secret: Fr::rand(rng),
            output_blinding: Fr::rand(rng),
            siblings: std::array::from_fn(|_| Fr::rand(rng)),
            directions: std::array::from_fn(|_| rng.gen()),
        };
        // Domain and asset are test-only constants; production must derive deployment domains.
        result.public[0] = Fr::from(2026110701u64);
        result.public[1] = Fr::from(1u64);
        result.public[5] = Fr::from(rng.gen::<u128>());
        result.public[6] = Fr::from(rng.gen::<u128>());
        result.public[7] = Fr::rand(rng);
        result.refresh();
        result
    }

    pub fn output_opening(&self) -> [Fr; 6] {
        [
            self.public[0],
            self.public[1],
            self.amount,
            self.output_owner,
            self.output_secret,
            self.output_blinding,
        ]
    }

    pub fn refresh(&mut self) {
        let owner = hash(1, &[self.spend_secret]);
        let mut node = hash(
            2,
            &[
                self.public[0],
                self.public[1],
                self.amount,
                owner,
                self.note_secret,
                self.blinding,
            ],
        );
        for (sibling, right) in self.siblings.iter().zip(self.directions) {
            node = if right {
                hash(3, &[*sibling, node])
            } else {
                hash(3, &[node, *sibling])
            };
        }
        self.public[2] = node;
        self.public[3] = hash(4, &[self.public[0], self.spend_secret, self.note_secret]);
        self.public[4] = hash(2, &self.output_opening());
        self.public[8] = hash(6, &self.public[..8]);
    }
}

impl ConstraintSynthesizer<Fr> for NoteSpend {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        let p = self
            .public
            .iter()
            .map(|v| FpVar::new_input(cs.clone(), || Ok(*v)))
            .collect::<Result<Vec<_>, _>>()?;
        let witness = |v| FpVar::new_witness(cs.clone(), || Ok(v));
        let sk = witness(self.spend_secret)?;
        sk.enforce_not_equal(&FpVar::Constant(Fr::ZERO))?;
        let amount = witness(self.amount)?;
        for bit in amount.to_bits_le()?.iter().skip(128) {
            bit.enforce_equal(&Boolean::FALSE)?;
        }
        for digest_limb in [&p[5], &p[6]] {
            for bit in digest_limb.to_bits_le()?.iter().skip(128) {
                bit.enforce_equal(&Boolean::FALSE)?;
            }
        }
        let secret = witness(self.note_secret)?;
        let blind = witness(self.blinding)?;
        let owner = hash_var(cs.clone(), 1, std::slice::from_ref(&sk))?;
        let mut node = hash_var(
            cs.clone(),
            2,
            &[
                p[0].clone(),
                p[1].clone(),
                amount.clone(),
                owner,
                secret.clone(),
                blind,
            ],
        )?;
        for (sibling, direction) in self.siblings.iter().zip(self.directions) {
            let sibling = witness(*sibling)?;
            let right = Boolean::new_witness(cs.clone(), || Ok(direction))?;
            let left = right.select(&sibling, &node)?;
            let right_node = right.select(&node, &sibling)?;
            node = hash_var(cs.clone(), 3, &[left, right_node])?;
        }
        node.enforce_equal(&p[2])?;
        hash_var(cs.clone(), 4, &[p[0].clone(), sk, secret])?.enforce_equal(&p[3])?;
        let output = hash_var(
            cs.clone(),
            2,
            &[
                p[0].clone(),
                p[1].clone(),
                amount,
                witness(self.output_owner)?,
                witness(self.output_secret)?,
                witness(self.output_blinding)?,
            ],
        )?;
        output.enforce_equal(&p[4])?;
        hash_var(cs, 6, &p[..8])?.enforce_equal(&p[8])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_ff::Field;
    use ark_relations::r1cs::ConstraintSystem;
    use rand::{rngs::StdRng, SeedableRng};

    fn satisfied(circuit: NoteSpend) -> bool {
        let cs = ConstraintSystem::new_ref();
        circuit.generate_constraints(cs.clone()).is_ok() && cs.is_satisfied().unwrap_or(false)
    }

    #[test]
    fn rejects_adversarial_witnesses_and_public_substitution() {
        let c = NoteSpend::sample(&mut StdRng::seed_from_u64(20261107));
        assert!(satisfied(c.clone()));
        for i in 0..PUBLIC_INPUTS {
            let mut bad = c.clone();
            bad.public[i] += Fr::ONE;
            assert!(!satisfied(bad), "public input {i}");
        }
        let mut bad = c.clone();
        bad.spend_secret += Fr::ONE;
        assert!(!satisfied(bad));
        let mut bad = c.clone();
        bad.siblings[0] += Fr::ONE;
        assert!(!satisfied(bad));
        let mut bad = c.clone();
        bad.directions[0] = !bad.directions[0];
        assert!(!satisfied(bad));
        let mut bad = c.clone();
        bad.output_owner += Fr::ONE;
        assert!(!satisfied(bad));
        let mut bad = c.clone();
        bad.amount = -Fr::ONE;
        bad.refresh();
        assert!(!satisfied(bad));
        let mut bad = c.clone();
        bad.spend_secret = Fr::ZERO;
        bad.refresh();
        assert!(!satisfied(bad));
        let mut max = c;
        max.amount = Fr::from(u128::MAX);
        max.refresh();
        assert!(satisfied(max));
    }
}

use ark_bn254::{Bn254, Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_ff::{BigInt, Field, PrimeField};
use ark_groth16::{prepare_verifying_key, Groth16, Proof, VerifyingKey};
use ark_serialize::CanonicalDeserialize;
use sha2::{Digest, Sha256};

fn integer(bytes: &[u8]) -> BigInt<4> {
    BigInt(std::array::from_fn(|i| {
        u64::from_le_bytes(bytes[i * 8..i * 8 + 8].try_into().unwrap())
    }))
}
fn fq(bytes: &[u8]) -> Fq {
    Fq::from_bigint(integer(bytes)).unwrap()
}
fn g1(bytes: &[u8]) -> G1Affine {
    let p = G1Affine::new_unchecked(fq(&bytes[..32]), fq(&bytes[32..64]));
    assert!(p.is_on_curve() && p.is_in_correct_subgroup_assuming_on_curve());
    p
}

#[test]
fn independently_replays_committed_real_proof() {
    let vk = VerifyingKey::<Bn254>::deserialize_compressed(
        &include_bytes!("../../../fixtures/proof-vectors/note-spend-v1/verification-key.bin")[..],
    )
    .unwrap();
    let args: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/proof-vectors/note-spend-v1/verify.json"
    ))
    .unwrap();
    let raw = hex::decode(args["proof"].as_str().unwrap()).unwrap();
    assert_eq!(raw.len(), 256);
    let b = G2Affine::new_unchecked(
        Fq2::new(fq(&raw[64..96]), fq(&raw[96..128])),
        Fq2::new(fq(&raw[128..160]), fq(&raw[160..192])),
    );
    assert!(b.is_on_curve() && b.is_in_correct_subgroup_assuming_on_curve());
    let proof = Proof {
        a: g1(&raw[..64]),
        b,
        c: g1(&raw[192..]),
    };
    let inputs = args["public_inputs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| Fr::from_bigint(integer(&hex::decode(v.as_str().unwrap()).unwrap())).unwrap())
        .collect::<Vec<_>>();
    let key = prepare_verifying_key(&vk);
    assert!(Groth16::<Bn254>::verify_proof(&key, &proof, &inputs).unwrap());
    let mut changed = inputs.clone();
    changed[3] += Fr::ONE;
    assert!(!Groth16::<Bn254>::verify_proof(&key, &proof, &changed).unwrap());
    let ciphertext =
        include_bytes!("../../../fixtures/proof-vectors/note-spend-v1/output-ciphertext.bin");
    let digest = Sha256::digest(ciphertext);
    assert_eq!(
        inputs[5],
        Fr::from(u128::from_le_bytes(digest[..16].try_into().unwrap()))
    );
    assert_eq!(
        inputs[6],
        Fr::from(u128::from_le_bytes(digest[16..].try_into().unwrap()))
    );
}

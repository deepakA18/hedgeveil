use ark_bn254::{Bn254, Fq, Fr, G1Affine, G2Affine};
use ark_ff::{BigInteger, Field, PrimeField};
use ark_groth16::{prepare_verifying_key, Groth16};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystem};
use ark_serialize::CanonicalSerialize;
use note_spend_spike::{hash, NoteSpend, PUBLIC_INPUTS};
use rand::rngs::OsRng;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, time::Instant};

fn fq(value: Fq) -> Vec<u8> {
    value.into_bigint().to_bytes_le()
}
fn g1(p: G1Affine) -> Vec<u8> {
    [fq(p.x), fq(p.y)].concat()
}
fn g2(p: G2Affine) -> Vec<u8> {
    [fq(p.x.c0), fq(p.x.c1), fq(p.y.c0), fq(p.y.c1)].concat()
}
fn scalar(f: Fr) -> String {
    hex::encode(f.into_bigint().to_bytes_le())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = PathBuf::from(
        std::env::args()
            .nth(1)
            .unwrap_or_else(|| ".local/zk-spike".into()),
    );
    fs::create_dir_all(&dir)?;
    // Real OS randomness for both the local setup and the proof. Never persist toxic waste.
    let mut rng = OsRng;
    let mut circuit = NoteSpend::sample(&mut rng);
    let recipient = crypto_box::SecretKey::generate(&mut rng);
    // The spend owner is an independent shielded identity; encryption is a separate view key.
    let opening = circuit
        .output_opening()
        .iter()
        .map(|f| scalar(*f))
        .collect::<Vec<_>>();
    let plaintext = serde_json::to_vec(&opening)?;
    let ciphertext = recipient
        .public_key()
        .seal(&mut rng, &plaintext)
        .map_err(|_| "encryption failed")?;
    let recovered = recipient
        .unseal(&ciphertext)
        .map_err(|_| "decryption failed")?;
    assert_eq!(recovered, plaintext);
    let recovered_fields: Vec<String> = serde_json::from_slice(&recovered)?;
    assert_eq!(recovered_fields, opening);
    assert_eq!(hash(2, &circuit.output_opening()), circuit.public[4]);
    let digest = Sha256::digest(&ciphertext);
    circuit.public[5] = Fr::from(u128::from_le_bytes(digest[..16].try_into()?));
    circuit.public[6] = Fr::from(u128::from_le_bytes(digest[16..].try_into()?));
    circuit.refresh();
    let cs = ConstraintSystem::new_ref();
    circuit.clone().generate_constraints(cs.clone())?;
    assert!(cs.is_satisfied()?);
    let constraints = cs.num_constraints();
    let begin = Instant::now();
    let pk =
        Groth16::<Bn254>::generate_random_parameters_with_reduction(circuit.clone(), &mut rng)?;
    let setup_ms = begin.elapsed().as_millis();
    let begin = Instant::now();
    let proof =
        Groth16::<Bn254>::create_random_proof_with_reduction(circuit.clone(), &pk, &mut rng)?;
    let prove_ms = begin.elapsed().as_millis();
    let pvk = prepare_verifying_key(&pk.vk);
    let begin = Instant::now();
    assert!(Groth16::<Bn254>::verify_proof(
        &pvk,
        &proof,
        &circuit.public
    )?);
    let verify_ms = begin.elapsed().as_millis();
    for i in 0..PUBLIC_INPUTS {
        let mut bad = circuit.public;
        bad[i] += Fr::ONE;
        assert!(!Groth16::<Bn254>::verify_proof(&pvk, &proof, &bad)?);
    }
    let mut bad_proof = proof.clone();
    bad_proof.c = -bad_proof.c;
    assert!(!Groth16::<Bn254>::verify_proof(
        &pvk,
        &bad_proof,
        &circuit.public
    )?);
    let mut bad_ciphertext = ciphertext.clone();
    bad_ciphertext[40] ^= 1;
    assert!(recipient.unseal(&bad_ciphertext).is_err());
    let vk = json!({"alpha":hex::encode(g1(pk.vk.alpha_g1)), "beta":hex::encode(g2(pk.vk.beta_g2)),
        "gamma":hex::encode(g2(pk.vk.gamma_g2)), "delta":hex::encode(g2(pk.vk.delta_g2)),
        "ic":pk.vk.gamma_abc_g1.iter().map(|p| hex::encode(g1(*p))).collect::<Vec<_>>()});
    let proof_bytes = [g1(proof.a), g2(proof.b), g1(proof.c)].concat();
    let inputs = circuit
        .public
        .iter()
        .map(|v| scalar(*v))
        .collect::<Vec<_>>();
    let init = json!({"vk":vk,"domain":inputs[0],"asset":inputs[1],"root":inputs[2]});
    let args = json!({"proof":hex::encode(&proof_bytes),"public_inputs":inputs});
    let mut bad_args = args.clone();
    bad_args["public_inputs"][3] = json!(scalar(circuit.public[3] + Fr::ONE));
    let mut malformed = args.clone();
    malformed["proof"] = json!("ff".repeat(256));
    let mut vk_bytes = Vec::new();
    pk.vk.serialize_compressed(&mut vk_bytes)?;
    let mut pk_bytes = Vec::new();
    pk.serialize_compressed(&mut pk_bytes)?;
    let report = json!({"status":"local_real_proof_passed", "production_setup":false,
        "circuit":"note-spend-spike-v1-depth20-1in-1out", "constraints":constraints,
        "public_inputs":PUBLIC_INPUTS,"public_input_bytes":PUBLIC_INPUTS*32,"proof_bytes":proof_bytes.len(),
        "setup_ms":setup_ms,"prove_ms":prove_ms,"native_verify_ms":verify_ms,
        "proving_key_bytes":pk_bytes.len(),"verification_key_sha256":hex::encode(Sha256::digest(&vk_bytes)),
        "ciphertext_bytes":ciphertext.len(),"honest_recipient_recovery":true,
        "altered_public_inputs_rejected":PUBLIC_INPUTS,"altered_proof_rejected":true,
        "tampered_ciphertext_rejected":true,
        "malicious_ciphertext_prevention":"NOT IMPLEMENTED: digest binding is not proof of correct encryption",
        "largest_transition":"not benchmarked", "testnet_verification":"not run", "browser_proving":"not run"});
    for (name, value) in [
        ("init.json", init),
        ("verify.json", args),
        ("invalid-input.json", bad_args),
        ("malformed-proof.json", malformed),
        ("report.json", report.clone()),
    ] {
        fs::write(dir.join(name), serde_json::to_vec_pretty(&value)?)?;
    }
    fs::write(dir.join("verification-key.bin"), vk_bytes)?;
    fs::write(dir.join("proving-key.bin"), pk_bytes)?;
    fs::write(dir.join("output-ciphertext.bin"), ciphertext)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

//! One-observation synthetic oracle experiment; no production source security.
use g1_types::{Report, Terms};
use near_sdk::{
    env,
    json_types::{U128, U64},
    near, require, AccountId, PanicOnDefault,
};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Oracle {
    terms: Terms,
    proposer: AccountId,
    adjudicator: AccountId,
    challenge_ns: u64,
    arbitration_ns: u64,
    bond: u128,
    bonds_locked: u128,
    state: String,
    price: Option<U128>,
    deadline: u64,
    dispute_hash: Option<String>,
}
#[near]
impl Oracle {
    #[init]
    pub fn new(
        terms: Terms,
        proposer: AccountId,
        adjudicator: AccountId,
        challenge_ns: U64,
        arbitration_ns: U64,
        bond: U128,
    ) -> Self {
        terms.validate();
        require!(
            proposer == terms.proposer
                && adjudicator == terms.adjudicator
                && challenge_ns == terms.challenge_ns
                && arbitration_ns == terms.arbitration_ns
                && bond == terms.bond,
            "policy mismatch"
        );
        require!(
            challenge_ns.0 > 0 && arbitration_ns.0 > 0 && bond.0 > 0,
            "invalid policy"
        );
        Self {
            terms,
            proposer,
            adjudicator,
            challenge_ns: challenge_ns.0,
            arbitration_ns: arbitration_ns.0,
            bond: bond.0,
            bonds_locked: 0,
            state: "MATURED_PENDING".into(),
            price: None,
            deadline: 0,
            dispute_hash: None,
        }
    }
    #[payable]
    pub fn propose(&mut self, price: U128, source_hash: String) {
        require!(
            env::predecessor_account_id() == self.proposer,
            "proposer only"
        );
        require!(self.state == "MATURED_PENDING", "already proposed");
        require!(
            env::block_timestamp() >= self.terms.end_ns.0,
            "observation not ended"
        );
        require!(
            source_hash == self.terms.source_hash && price.0 > 0,
            "invalid observation"
        );
        require!(
            env::attached_deposit().as_yoctonear() == self.bond,
            "exact bond required"
        );
        self.bonds_locked += self.bond;
        self.price = Some(price);
        self.deadline = env::block_timestamp()
            .checked_add(self.challenge_ns)
            .expect("deadline overflow");
        self.state = "PROPOSED".into();
    }
    #[payable]
    pub fn challenge(&mut self, evidence_hash: String) {
        require!(
            self.state == "PROPOSED" && env::block_timestamp() < self.deadline,
            "challenge closed"
        );
        require!(
            evidence_hash.len() == 64
                && evidence_hash
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
                && evidence_hash != self.terms.source_hash,
            "invalid evidence"
        );
        require!(
            env::attached_deposit().as_yoctonear() == self.bond,
            "exact bond required"
        );
        self.bonds_locked += self.bond;
        self.dispute_hash = Some(evidence_hash);
        self.state = "DISPUTED".into();
    }
    pub fn adjudicate(&mut self, price: U128) {
        require!(
            env::predecessor_account_id() == self.adjudicator,
            "adjudicator only"
        );
        require!(
            self.state == "DISPUTED" && price.0 > 0,
            "not disputed or bad price"
        );
        require!(
            env::block_timestamp() >= self.deadline
                && env::block_timestamp()
                    < self
                        .deadline
                        .checked_add(self.arbitration_ns)
                        .expect("deadline overflow"),
            "outside arbitration window"
        );
        self.price = Some(price);
        self.state = "FINALIZED".into();
    }
    pub fn finalize(&mut self) {
        require!(
            self.state == "PROPOSED" && env::block_timestamp() >= self.deadline,
            "not finalizable"
        );
        self.state = "FINALIZED".into();
    }
    pub fn mark_delayed(&mut self) {
        require!(
            self.state == "DISPUTED"
                && env::block_timestamp()
                    >= self
                        .deadline
                        .checked_add(self.arbitration_ns)
                        .expect("deadline overflow"),
            "not overdue"
        );
        self.state = "RESOLUTION_DELAYED".into();
    }
    pub fn report(&self) -> Report {
        Report {
            terms: self.terms.clone(),
            state: self.state.clone(),
            price: if self.state == "FINALIZED" {
                self.price
            } else {
                None
            },
        }
    }
    pub fn bonds_locked(&self) -> U128 {
        U128(self.bonds_locked)
    }
    pub fn deadline(&self) -> U64 {
        U64(self.deadline)
    }
}

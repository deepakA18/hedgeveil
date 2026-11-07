use near_sdk::{env, near, require, serde::Serialize, AccountId};
use protocol_types::{Amount, Num64, SeriesConfig, Window};
use std::collections::BTreeMap;
pub const Q: u128 = 1_000_000_000_000_000_000_000_000;
pub const OPERATING: u128 = 20 * Q;
pub const ACCOUNT_BYTES: u128 = 4096;
pub const SERIES_BYTES: u128 = 32768;
#[near(serializers=[borsh,json])]
#[derive(Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub source_id: String,
    pub publisher: AccountId,
    pub evidence_hash: String,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ObservationSpec {
    pub label: String,
    pub asset: String,
    pub quote: String,
    pub price_scale: Amount,
    pub dataset_hash: String,
    pub window: Window,
    pub sample_step_ns: Num64,
    pub min_price: Amount,
    pub max_price: Amount,
    pub primary: Vec<Source>,
    pub fallback: Vec<Source>,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub primary_ns: Num64,
    pub fallback_ns: Num64,
    pub arbitration_ns: Num64,
    pub challenge_ns: Num64,
    pub proposal_bond: Amount,
    pub challenge_bond: Amount,
    pub arbitrator: AccountId,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Sample {
    pub timestamp_ns: Num64,
    pub price: Amount,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Evidence {
    pub series_id: String,
    pub dataset_hash: String,
    pub source_id: String,
    pub asset: String,
    pub quote: String,
    pub price_scale: Amount,
    pub samples: Vec<Sample>,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Route {
    Primary,
    Fallback,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Observation {
    pub price: Amount,
    pub evidence_hash: String,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Claim {
    pub owner: AccountId,
    pub price: Amount,
    pub evidence_hash: String,
    pub bond: Amount,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Proposal {
    pub claim: Claim,
    pub route: Route,
    pub challenge_end: Num64,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Case {
    pub config: SeriesConfig,
    pub observation: ObservationSpec,
    pub policy: Policy,
    pub evidence: BTreeMap<String, Evidence>,
    pub proposal: Option<Proposal>,
    pub challenge: Option<Claim>,
    pub state: String,
    pub price: Option<Amount>,
    pub final_evidence_hash: Option<String>,
    pub bonds_released: bool,
}
impl Case {
    pub fn deadlines(&self) -> (u64, u64, u64) {
        let p = self
            .config
            .maturity_ns
            .0
            .checked_add(self.policy.primary_ns.0)
            .expect("time overflow");
        let f = p
            .checked_add(self.policy.fallback_ns.0)
            .expect("time overflow");
        (
            p,
            f,
            f.checked_add(self.policy.arbitration_ns.0)
                .expect("time overflow"),
        )
    }
    pub fn sources(&self, route: Route) -> &[Source] {
        if route == Route::Primary {
            &self.observation.primary
        } else {
            &self.observation.fallback
        }
    }
    pub fn observation(&self, route: Route) -> Option<Observation> {
        let mut prices = Vec::new();
        for s in self.sources(route) {
            let e = self.evidence.get(&s.source_id)?;
            let total = e
                .samples
                .iter()
                .try_fold(0u128, |a, v| a.checked_add(v.price.0))
                .expect("sum overflow");
            prices.push(total / e.samples.len() as u128);
        }
        prices.sort_unstable();
        let price = Amount(prices[1]);
        Some(Observation {
            price,
            evidence_hash: hash(&near_sdk::serde_json::json!({
                "series_id":self.config.series_id,"route":route,"price":price,
                "source_hashes":self.sources(route).iter().map(|s|&s.evidence_hash).collect::<Vec<_>>()
            })),
        })
    }
    pub fn valid_proposal(&self) -> Option<Observation> {
        let p = self.proposal.as_ref()?;
        let o = self.observation(p.route)?;
        (p.claim.price == o.price && p.claim.evidence_hash == o.evidence_hash).then_some(o)
    }
    pub fn locked(&self) -> u128 {
        if self.bonds_released {
            return 0;
        }
        self.proposal.as_ref().map_or(0, |p| p.claim.bond.0)
            + self.challenge.as_ref().map_or(0, |c| c.bond.0)
    }
    pub fn live(&self) {
        require!(
            self.state != "FINALIZED" && self.state != "RESOLUTION_DELAYED",
            "terminal case"
        );
    }
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct BondAccount {
    pub credit: Amount,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Ticket {
    pub id: Num64,
    pub owner: AccountId,
    pub receiver: AccountId,
    pub amount: Amount,
    pub state: String,
    pub created_ns: Num64,
}
pub fn hash<T: Serialize>(value: &T) -> String {
    // SDK enables preserve_order; explicitly sort nested objects for the wire commitment.
    let mut value = near_sdk::serde_json::to_value(value).expect("json");
    value.sort_all_objects();
    let canonical = near_sdk::serde_json::to_vec(&value).expect("json");
    env::sha256(&canonical)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
pub fn valid_hash(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn validate(config: &SeriesConfig, obs: &ObservationSpec, policy: &Policy) {
    config.validate();
    require!(
        config.oracle_account_id == env::current_account_id() && config.oracle_version == "demo-v1",
        "oracle binding"
    );
    require!(
        config.observation_window.start_ns.0 > env::block_timestamp(),
        "commit before window"
    );
    require!(
        obs.label == "DEMO ORACLE — SYNTHETIC PRICES"
            && obs.asset == "NEAR"
            && obs.quote == "USD"
            && obs.price_scale == config.price_scale
            && obs.window == config.observation_window,
        "observation units/window"
    );
    require!(
        valid_hash(&obs.dataset_hash)
            && obs.min_price.0 > 0
            && obs.max_price.0 >= obs.min_price.0
            && obs.max_price.0 <= 1_000_000_000_000_000_000_000_000,
        "price bounds"
    );
    let duration = obs.window.end_ns.0 - obs.window.start_ns.0;
    require!(
        obs.sample_step_ns.0 > 0
            && duration.is_multiple_of(obs.sample_step_ns.0)
            && (2..=12).contains(&(duration / obs.sample_step_ns.0)),
        "sample grid"
    );
    require!(
        obs.primary.len() == 3 && obs.fallback.len() == 3,
        "three sources per group"
    );
    let mut ids = std::collections::BTreeSet::new();
    let mut accounts = std::collections::BTreeSet::new();
    for s in obs.primary.iter().chain(obs.fallback.iter()) {
        require!(
            protocol_types::valid_id(&s.source_id)
                && valid_hash(&s.evidence_hash)
                && ids.insert(&s.source_id)
                && accounts.insert(&s.publisher),
            "source identities"
        );
    }
    for duration in [
        policy.primary_ns,
        policy.fallback_ns,
        policy.arbitration_ns,
        policy.challenge_ns,
    ] {
        require!(
            (1_000_000_000..=604_800_000_000_000).contains(&duration.0),
            "duration bounds"
        );
    }
    require!(
        policy.challenge_ns.0 <= policy.primary_ns.0
            && policy.challenge_ns.0 <= policy.fallback_ns.0
            && policy.challenge_ns.0 <= policy.arbitration_ns.0,
        "challenge duration"
    );
    for b in [policy.proposal_bond, policy.challenge_bond] {
        require!((Q / 100..=Q).contains(&b.0), "bond bounds");
    }
    require!(
        config.oracle_config_hash == hash(obs) && config.finalization_policy_hash == hash(policy),
        "config hash"
    );
}

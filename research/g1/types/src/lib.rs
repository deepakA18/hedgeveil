use near_sdk::{
    json_types::{U128, U64},
    near, require,
};

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq)]
pub struct Terms {
    pub proposer: near_sdk::AccountId,
    pub adjudicator: near_sdk::AccountId,
    pub challenge_ns: U64,
    pub arbitration_ns: U64,
    pub bond: U128,
    pub request_id: String,
    pub series_id: String,
    pub scenario_id: String,
    pub source_hash: String,
    pub config_hash: String,
    pub oracle_version: String,
    pub start_ns: U64,
    pub end_ns: U64,
    pub units: String,
    pub price_scale: U128,
}
impl Terms {
    pub fn validate(&self) {
        require!(
            self.challenge_ns.0 > 0 && self.arbitration_ns.0 > 0 && self.bond.0 > 0,
            "invalid policy"
        );
        for id in [
            &self.request_id,
            &self.series_id,
            &self.scenario_id,
            &self.oracle_version,
        ] {
            require!(!id.is_empty() && id.len() <= 64, "invalid identity");
        }
        for hash in [&self.source_hash, &self.config_hash] {
            require!(
                hash.len() == 64
                    && hash
                        .bytes()
                        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()),
                "invalid hash"
            );
        }
        require!(self.start_ns.0 < self.end_ns.0, "invalid window");
        require!(
            self.units == "USD/NEAR" && self.price_scale.0 == 1_000_000_000_000,
            "invalid units"
        );
    }
}
#[near(serializers = [json])]
pub struct Report {
    pub terms: Terms,
    pub state: String,
    pub price: Option<U128>,
}

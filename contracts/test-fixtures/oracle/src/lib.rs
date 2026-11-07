//! Explicitly synthetic/admin-controlled G3 import fixture, never a product oracle.
use near_sdk::{
    env, near, require,
    serde_json::{json, Value},
    AccountId, PanicOnDefault,
};
use protocol_types::Resolution;
use std::collections::BTreeMap;
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OracleFixture {
    owner: AccountId,
    reports: BTreeMap<String, Resolution>,
    mode: String,
}
#[near]
impl OracleFixture {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            reports: BTreeMap::new(),
            mode: "normal".into(),
        }
    }
    pub fn set_report(&mut self, series_id: String, report: Resolution) {
        require!(
            env::predecessor_account_id() == self.owner,
            "fixture owner only"
        );
        require!(
            self.reports.len() < 16 || self.reports.contains_key(&series_id),
            "fixture cap"
        );
        self.reports.insert(series_id, report);
    }
    pub fn set_mode(&mut self, mode: String) {
        require!(
            env::predecessor_account_id() == self.owner,
            "fixture owner only"
        );
        require!(
            ["normal", "malformed", "failure"].contains(&mode.as_str()),
            "invalid mode"
        );
        self.mode = mode;
    }
    pub fn get_resolution(&self, series_id: String) -> Value {
        if self.mode == "failure" {
            env::panic_str("injected oracle failure");
        }
        if self.mode == "malformed" {
            return json!({"bad":"report"});
        }
        json!(self.reports.get(&series_id))
    }
}

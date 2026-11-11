//! Sandbox-only fault injection. Never an authenticated external price source.
use near_sdk::{env, near, require, AccountId, PanicOnDefault};
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Fixture {
    owner: AccountId,
    output: String,
    failure: bool,
}
#[near]
impl Fixture {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            output: "null".into(),
            failure: false,
        }
    }
    pub fn set(&mut self, output: String, failure: bool) {
        require!(env::predecessor_account_id() == self.owner, "owner");
        self.output = output;
        self.failure = failure;
    }
    #[payable]
    pub fn request_execution(&mut self, input_data: String, source: near_sdk::serde_json::Value) {
        require!(!self.failure, "injected source failure");
        env::log_str(&format!(
            "FIXTURE_REQUEST:{}",
            near_sdk::serde_json::json!({"input_data":input_data,"source":source})
        ));
        env::value_return(self.output.as_bytes());
    }
}

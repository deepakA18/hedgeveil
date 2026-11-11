//! Sandbox-only fault fixture, never an external price provider.
use near_sdk::{
    env, near, require,
    serde_json::{json, Value},
    AccountId, PanicOnDefault,
};
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Fixture {
    owner: AccountId,
    mode: String,
    price: String,
    stamp: Option<String>,
    refreshes: u32,
}
#[near]
impl Fixture {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            mode: "normal".into(),
            price: "300000000".into(),
            stamp: None,
            refreshes: 0,
        }
    }
    pub fn set(&mut self, mode: String, price: String, stamp: Option<String>) {
        require!(env::predecessor_account_id() == self.owner, "fixture owner");
        self.mode = mode;
        self.price = price;
        self.stamp = stamp;
    }
    pub fn get_asset(&self, asset_id: String) -> Value {
        require!(asset_id == "wrap.near", "asset");
        if self.mode == "failure" {
            env::panic_str("injected failure");
        }
        if self.mode == "null" {
            return Value::Null;
        }
        if self.mode == "malformed" {
            return json!({"wrong":true});
        }
        let report = json!({"oracle_id":env::current_account_id(),"timestamp":self.stamp.clone().unwrap_or_else(||env::block_timestamp().saturating_sub(2_000_000_000).to_string()),"price":{"multiplier":self.price,"decimals":8}});
        json!({"reports":if self.mode=="duplicate"{vec![report.clone(),report]}else{vec![report]},"emas":[]})
    }
    #[payable]
    pub fn request_price_data(&mut self, asset_ids: Vec<String>) -> Value {
        require!(asset_ids == vec!["wrap.near".to_string()], "fixture asset");
        require!(
            env::attached_deposit().as_yoctonear() == 20_000_000_000_000_000_000_000,
            "fixture deposit"
        );
        self.refreshes += 1;
        self.stamp = Some(env::block_timestamp().to_string());
        self.get_asset("wrap.near".to_string())
    }
    pub fn get_refresh_count(&self) -> u32 {
        self.refreshes
    }
}

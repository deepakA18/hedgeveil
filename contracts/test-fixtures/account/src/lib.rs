//! Sandbox-only account that deletes itself before its storage-refund request executes.
use near_sdk::{
    env, json_types::U128, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
};
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AccountFixture {
    owner: AccountId,
    core: AccountId,
}
#[near]
impl AccountFixture {
    #[init]
    pub fn new(owner: AccountId, core: AccountId) -> Self {
        Self { owner, core }
    }
    pub fn register(&self, amount: U128) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner,
            "fixture owner only"
        );
        Promise::new(self.core.clone()).function_call(
            "storage_deposit",
            b"{}".to_vec(),
            NearToken::from_yoctonear(amount.0),
            Gas::from_tgas(80),
        )
    }
    pub fn close_and_delete(&self) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner,
            "fixture owner only"
        );
        Promise::new(env::current_account_id())
            .delete_account(self.owner.clone())
            .then(Promise::new(self.core.clone()).function_call(
                "unregister",
                b"{}".to_vec(),
                NearToken::from_yoctonear(1),
                Gas::from_tgas(120),
            ))
    }
}

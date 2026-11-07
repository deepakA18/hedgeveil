//! Token namespace/resolver probe. MT is a candidate subset, not NEP-245 conformance.
use near_contract_standards::{
    fungible_token::{
        core::FungibleTokenCore,
        metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC},
        resolver::FungibleTokenResolver,
        FungibleToken,
    },
    storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement},
};
use near_sdk::{
    assert_one_yocto, env, json_types::U128, near, require, serde_json::json, AccountId, Gas,
    NearToken, PanicOnDefault, Promise, PromiseOrValue,
};
use std::collections::BTreeMap;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Tokens {
    owner: AccountId,
    ft: FungibleToken,
    mt: BTreeMap<AccountId, [u128; 2]>,
    mt_supply: [u128; 2],
}
#[near]
impl Tokens {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            ft: FungibleToken::new(b"shares".to_vec()),
            mt: BTreeMap::new(),
            mt_supply: [0; 2],
        }
    }
    pub fn fixture_register_mt(&mut self, account_id: AccountId) {
        require!(
            env::predecessor_account_id() == self.owner,
            "fixture owner only"
        );
        require!(
            self.mt.len() < 8 && !self.mt.contains_key(&account_id),
            "registration cap or duplicate"
        );
        self.mt.insert(account_id, [0; 2]);
    }
    pub fn fixture_seed(&mut self, account_id: AccountId, amount: U128) {
        require!(
            env::predecessor_account_id() == self.owner,
            "fixture owner only"
        );
        self.ft.internal_deposit(&account_id, amount.0);
        let balance = self.mt.get_mut(&account_id).expect("MT unregistered");
        for (b, supply) in balance.iter_mut().zip(self.mt_supply.iter_mut()) {
            *b = b.checked_add(amount.0).expect("overflow");
            *supply = supply.checked_add(amount.0).expect("overflow");
        }
    }
    #[payable]
    pub fn fixture_burn_ft(&mut self, amount: U128) {
        assert_one_yocto();
        self.ft
            .internal_withdraw(&env::predecessor_account_id(), amount.0);
    }
    #[payable]
    pub fn fixture_burn_mt(&mut self, token_id: String, amount: U128) {
        assert_one_yocto();
        let i = index(&token_id);
        let balance = self
            .mt
            .get_mut(&env::predecessor_account_id())
            .expect("MT unregistered");
        balance[i] = balance[i].checked_sub(amount.0).expect("insufficient MT");
        self.mt_supply[i] -= amount.0;
    }
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.mt.get(&account_id).unwrap_or(&[0; 2])[index(&token_id)])
    }
    pub fn mt_supply(&self, token_id: String) -> U128 {
        U128(self.mt_supply[index(&token_id)])
    }
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approval.is_none(), "approvals unsupported");
        let _ = memo;
        self.move_mt(
            &env::predecessor_account_id(),
            &receiver_id,
            index(&token_id),
            amount.0,
        );
    }
    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
    ) {
        assert_one_yocto();
        require!(
            !token_ids.is_empty() && token_ids.len() <= 2 && token_ids.len() == amounts.len(),
            "bad batch"
        );
        require!(
            token_ids.len() == 1 || token_ids[0] != token_ids[1],
            "duplicate ID"
        );
        for (token, amount) in token_ids.iter().zip(amounts) {
            self.move_mt(
                &env::predecessor_account_id(),
                &receiver_id,
                index(token),
                amount.0,
            );
        }
    }
    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        assert_one_yocto();
        require!(approval.is_none(), "approvals unsupported");
        let _ = memo;
        let sender = env::predecessor_account_id();
        self.move_mt(&sender, &receiver_id, index(&token_id), amount.0);
        Promise::new(receiver_id.clone()).function_call("mt_on_transfer", json!({"sender_id":sender,"previous_owner_ids":[sender],"token_ids":[token_id],"amounts":[amount],"msg":msg}).to_string().into_bytes(), NearToken::from_yoctonear(0), Gas::from_tgas(60))
            .then(Promise::new(env::current_account_id()).function_call("mt_resolve_transfer", json!({"sender_id":sender,"receiver_id":receiver_id,"token_id":token_id,"amount":amount}).to_string().into_bytes(), NearToken::from_yoctonear(0), Gas::from_tgas(15)))
    }
    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
    ) -> U128 {
        require!(env::promise_results_count() == 1, "bad callback");
        let unused = match env::promise_result_checked(0, 1024) {
            Ok(bytes) => near_sdk::serde_json::from_slice::<Vec<U128>>(&bytes)
                .ok()
                .filter(|v| v.len() == 1)
                .map(|v| v[0].0)
                .unwrap_or(amount.0),
            Err(_) => amount.0,
        }
        .min(amount.0);
        let i = index(&token_id);
        let refund = unused.min(self.mt.get(&receiver_id).expect("receiver missing")[i]);
        if refund > 0 {
            self.move_mt(&receiver_id, &sender_id, i, refund);
        }
        U128(amount.0 - refund)
    }
}
impl Tokens {
    fn move_mt(&mut self, sender: &AccountId, receiver: &AccountId, i: usize, amount: u128) {
        require!(amount > 0 && sender != receiver, "invalid transfer");
        let from = self.mt.get_mut(sender).expect("sender unregistered");
        from[i] = from[i].checked_sub(amount).expect("insufficient MT");
        let to = self.mt.get_mut(receiver).expect("receiver unregistered");
        to[i] = to[i].checked_add(amount).expect("overflow");
    }
}
fn index(id: &str) -> usize {
    match id {
        "P" => 0,
        "N" => 1,
        _ => env::panic_str("unknown token"),
    }
}
#[near]
impl FungibleTokenCore for Tokens {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.ft.ft_transfer(receiver_id, amount, memo);
    }
    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.ft.ft_transfer_call(receiver_id, amount, memo, msg)
    }
    fn ft_total_supply(&self) -> U128 {
        self.ft.ft_total_supply()
    }
    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.ft.ft_balance_of(account_id)
    }
}
#[near]
impl FungibleTokenResolver for Tokens {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        self.ft.ft_resolve_transfer(sender_id, receiver_id, amount)
    }
}
#[near]
impl StorageManagement for Tokens {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.ft.storage_deposit(account_id, registration_only)
    }
    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.ft.storage_withdraw(amount)
    }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        require!(!force.unwrap_or(false), "forced unregister disabled");
        require!(
            self.mt
                .get(&env::predecessor_account_id())
                .unwrap_or(&[0; 2])
                == &[0; 2],
            "MT balance remains"
        );
        self.ft.storage_unregister(Some(false))
    }
    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.ft.storage_balance_bounds()
    }
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.ft.storage_balance_of(account_id)
    }
}
#[near]
impl FungibleTokenMetadataProvider for Tokens {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.into(),
            name: "G1 fixture share".into(),
            symbol: "G1TEST".into(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 24,
        }
    }
}

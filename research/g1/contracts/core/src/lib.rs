//! Bounded sponsor-funded G1 custody/receipt experiment, not the clearinghouse.
use g1_types::{Report, Terms};
use near_sdk::{
    assert_one_yocto, env,
    json_types::{U128, U64},
    near, require,
    serde_json::json,
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};
use std::collections::BTreeMap;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Ticket {
    owner: AccountId,
    receiver: AccountId,
    amount: U128,
    state: String,
    created_ns: U64,
    version: u8,
    balance_restored: bool,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Core {
    owner: AccountId,
    balances: BTreeMap<AccountId, u128>,
    tickets: Vec<Ticket>,
    oracle: AccountId,
    terms: Terms,
    final_price: Option<U128>,
}
#[near]
impl Core {
    #[init]
    pub fn new(owner: AccountId, oracle: AccountId, terms: Terms) -> Self {
        terms.validate();
        Self {
            owner,
            oracle,
            terms,
            balances: BTreeMap::new(),
            tickets: vec![],
            final_price: None,
        }
    }
    pub fn register(&mut self, account_id: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        require!(
            self.balances.len() < 8 && !self.balances.contains_key(&account_id),
            "registration limit or duplicate"
        );
        self.balances.insert(account_id, 0);
    }
    #[payable]
    pub fn deposit_collateral(&mut self) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "positive deposit required");
        let balance = self
            .balances
            .get_mut(&env::predecessor_account_id())
            .expect("unregistered");
        *balance = balance.checked_add(amount).expect("overflow");
    }
    pub fn balance_of(&self, account_id: AccountId) -> U128 {
        U128(*self.balances.get(&account_id).unwrap_or(&0))
    }
    pub fn ticket(&self, id: u32) -> Ticket {
        self.tickets
            .get(id as usize)
            .expect("unknown ticket")
            .clone()
    }
    pub fn totals(&self) -> near_sdk::serde_json::Value {
        let free: u128 = self.balances.values().sum();
        let quarantined: u128 = self
            .tickets
            .iter()
            .filter(|t| t.state == "PENDING" || t.state == "UNKNOWN")
            .map(|t| t.amount.0)
            .sum();
        json!({"free": U128(free), "quarantined": U128(quarantined), "tickets": self.tickets.len(), "storage_bytes": U64(env::storage_usage())})
    }
    #[payable]
    pub fn request_withdrawal(&mut self, amount: U128, receiver: AccountId) -> Promise {
        assert_one_yocto();
        self.withdraw(amount, receiver, 0)
    }
    pub fn mark_unknown(&mut self, id: u32) {
        let ticket = self.tickets.get_mut(id as usize).expect("unknown ticket");
        require!(
            ticket.state == "PENDING"
                && env::block_timestamp()
                    >= ticket
                        .created_ns
                        .0
                        .checked_add(5_000_000_000)
                        .expect("time overflow"),
            "not overdue pending"
        );
        ticket.state = "UNKNOWN".into();
    }
    #[private]
    pub fn on_payout(&mut self, id: u32, version: u8, fault: u8) -> String {
        #[cfg(feature = "fault-injection")]
        if fault == 1 {
            env::panic_str("injected callback failure");
        }
        require!(fault == 0 || fault == 2, "bad fault mode");
        require!(
            env::promise_results_count() == 1 && version == 1,
            "bad callback"
        );
        let ticket = self.tickets.get_mut(id as usize).expect("unknown ticket");
        require!(ticket.version == version, "ticket version mismatch");
        if ticket.state != "PENDING" && ticket.state != "UNKNOWN" {
            return ticket.state.clone();
        }
        match env::promise_result_checked(0, 0) {
            Ok(_) => ticket.state = "SUCCEEDED".into(),
            Err(PromiseError::Failed) => {
                let balance = self.balances.get_mut(&ticket.owner).expect("owner missing");
                *balance = balance.checked_add(ticket.amount.0).expect("overflow");
                ticket.balance_restored = true;
                ticket.state = "FAILED_CONFIRMED".into();
            }
            Err(_) => ticket.state = "UNKNOWN".into(),
        }
        ticket.state.clone()
    }
    pub fn request_resolution(&self) -> Promise {
        require!(env::block_timestamp() >= self.terms.end_ns.0, "not matured");
        Promise::new(self.oracle.clone())
            .function_call(
                "report",
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(10),
            )
            .then(Promise::new(env::current_account_id()).function_call(
                "on_resolution",
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(15),
            ))
    }
    #[private]
    pub fn on_resolution(&mut self) -> bool {
        require!(env::promise_results_count() == 1, "bad callback");
        if let Ok(data) = env::promise_result_checked(0, 4096) {
            if let Ok(report) = near_sdk::serde_json::from_slice::<Report>(&data) {
                if report.terms == self.terms && report.state == "FINALIZED" {
                    if let Some(price) = report.price.filter(|p| p.0 > 0) {
                        if let Some(existing) = self.final_price {
                            return existing == price;
                        }
                        self.final_price = Some(price);
                        return true;
                    }
                }
            }
        }
        false
    }
    pub fn final_price(&self) -> Option<U128> {
        self.final_price
    }

    #[cfg(feature = "fault-injection")]
    #[payable]
    pub fn fault_withdrawal(&mut self, amount: U128, receiver: AccountId, fault: u8) -> Promise {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner && (1..=2).contains(&fault),
            "fixture owner only"
        );
        self.withdraw(amount, receiver, fault)
    }
    #[cfg(feature = "fault-injection")]
    pub fn fault_replay(&self, id: u32, malformed: bool) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner,
            "fixture owner only"
        );
        Promise::new(env::current_account_id())
            .function_call(
                if malformed {
                    "fault_data"
                } else {
                    "fault_empty"
                },
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(5),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_payout",
                    json!({"id": id,"version": 1,"fault": 0})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(15),
                ),
            )
    }
    #[cfg(feature = "fault-injection")]
    #[private]
    pub fn fault_data(&self) -> String {
        "malformed native result".into()
    }
    #[cfg(feature = "fault-injection")]
    #[private]
    pub fn fault_empty(&self) {}
}
impl Core {
    fn withdraw(&mut self, amount: U128, receiver: AccountId, fault: u8) -> Promise {
        require!(
            amount.0 > 0 && self.tickets.len() < 32,
            "amount or ticket cap"
        );
        let owner = env::predecessor_account_id();
        let balance = self.balances.get_mut(&owner).expect("unregistered");
        *balance = balance
            .checked_sub(amount.0)
            .expect("insufficient free balance");
        let id = self.tickets.len() as u32;
        self.tickets.push(Ticket {
            owner,
            receiver: receiver.clone(),
            amount,
            state: "PENDING".into(),
            created_ns: U64(env::block_timestamp()),
            version: 1,
            balance_restored: false,
        });
        Promise::new(receiver)
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_payout",
                    json!({"id": id,"version": 1,"fault": fault})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    if fault == 2 {
                        Gas::from_gas(1)
                    } else {
                        Gas::from_tgas(15)
                    },
                ),
            )
    }
}

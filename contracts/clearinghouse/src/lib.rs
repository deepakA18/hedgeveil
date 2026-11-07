mod accounting;
mod claims;
mod events;
mod permissions;
mod rfq;
mod rfq_types;
mod series;
mod types;
mod vault;
mod withdrawals;

use near_sdk::{env, near, require, AccountId, PanicOnDefault};
use protocol_types::{Amount, Num64};
use std::collections::BTreeMap;
use types::*;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Clearinghouse {
    network: String,
    guardian: AccountId,
    oracle: AccountId,
    oracle_version: String,
    storage_byte_cost: u128,
    accounts: BTreeMap<AccountId, LedgerAccount>,
    series: BTreeMap<String, Series>,
    tickets: BTreeMap<u64, Ticket>,
    next_ticket: u64,
    operation: u64,
    fees: u128,
    collateral: u128,
    series_storage: u128,
    pauses: Pauses,
    markets: BTreeMap<AccountId, rfq_types::MakerState>,
    market_storage: u128,
    market_paused: bool,
    vault: Option<vault::Vault>,
}
#[near]
impl Clearinghouse {
    #[init]
    pub fn new(
        network: String,
        guardian: AccountId,
        oracle: AccountId,
        oracle_version: String,
        storage_byte_cost: Amount,
    ) -> Self {
        require!(
            network == "sandbox" || network == "testnet",
            "unsupported network"
        );
        require!(
            protocol_types::valid_id(&oracle_version),
            "invalid oracle version"
        );
        require!(
            storage_byte_cost.0 > 0 && storage_byte_cost.0 <= 1_000_000_000_000_000_000_000,
            "invalid storage cost"
        );
        require!(
            env::account_balance().as_yoctonear() >= OPERATING,
            "separately funded operating reserve required"
        );
        let mut this = Self {
            network,
            guardian,
            oracle,
            oracle_version,
            storage_byte_cost: storage_byte_cost.0,
            accounts: BTreeMap::new(),
            series: BTreeMap::new(),
            tickets: BTreeMap::new(),
            next_ticket: 0,
            operation: 0,
            fees: 0,
            collateral: 0,
            series_storage: 0,
            pauses: Pauses::default(),
            markets: BTreeMap::new(),
            market_storage: 0,
            market_paused: false,
            vault: None,
        };
        this.finish("INITIALIZED", BTreeMap::new(), 0);
        this
    }
    pub fn get_account(&self, account_id: AccountId) -> Option<LedgerAccount> {
        self.accounts.get(&account_id).cloned()
    }
    pub fn get_series(&self, series_id: String) -> Series {
        self.series.get(&series_id).expect("unknown series").clone()
    }
    pub fn get_ticket(&self, ticket_id: Num64) -> Option<Ticket> {
        self.tickets.get(&ticket_id.0).cloned()
    }
    pub fn list_accounts(&self, from_index: u32, limit: u32) -> Vec<AccountId> {
        page(limit);
        self.accounts
            .keys()
            .skip(from_index as usize)
            .take(limit as usize)
            .cloned()
            .collect()
    }
    pub fn list_series(&self, from_index: u32, limit: u32) -> Vec<Series> {
        page(limit);
        self.series
            .values()
            .skip(from_index as usize)
            .take(limit as usize)
            .cloned()
            .collect()
    }
    pub fn list_tickets(&self, account_id: AccountId, from_index: u32, limit: u32) -> Vec<Ticket> {
        page(limit);
        self.tickets
            .values()
            .filter(|t| t.owner == account_id)
            .skip(from_index as usize)
            .take(limit as usize)
            .cloned()
            .collect()
    }
    pub fn get_pauses(&self) -> Pauses {
        self.pauses.clone()
    }
    pub fn series_state(&self, series_id: String) -> String {
        let s = self.series.get(&series_id).expect("unknown series");
        if s.closed {
            "CLOSED"
        } else if s.final_price.is_some() {
            "FINALIZED"
        } else if env::block_timestamp() >= s.config.maturity_ns.0 {
            "MATURED_PENDING"
        } else {
            "OPEN"
        }
        .into()
    }
}
fn page(limit: u32) {
    require!(limit > 0 && limit <= 16, "page limit must be 1..16");
}
impl Clearinghouse {
    fn account(&self, id: &AccountId) -> LedgerAccount {
        let a = self.accounts.get(id).expect("unregistered").clone();
        require!(!a.closing, "account closing");
        a
    }
    fn one_yocto(&mut self) {
        near_sdk::assert_one_yocto();
        self.fees = self.fees.checked_add(1).expect("fee overflow");
    }
    fn collateral_add(&mut self, amount: u128) {
        self.collateral = self.collateral.checked_add(amount).expect("overflow");
        require!(
            self.collateral <= MAX_COLLATERAL,
            "aggregate collateral cap"
        );
    }
    fn minimum_storage(&self) -> u128 {
        self.storage_byte_cost
            .checked_mul(STORAGE_BYTES)
            .expect("storage overflow")
    }
}

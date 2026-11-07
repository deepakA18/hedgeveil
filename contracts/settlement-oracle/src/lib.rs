mod lifecycle;
mod types;
mod withdrawals;
use near_sdk::{env, near, require, serde_json::json, AccountId, PanicOnDefault};
use protocol_types::{Amount, Num64, Resolution, SeriesConfig};
use std::collections::BTreeMap;
use types::*;
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SettlementOracle {
    network: String,
    registrar: AccountId,
    treasury: AccountId,
    byte_cost: u128,
    cases: BTreeMap<String, Case>,
    accounts: BTreeMap<AccountId, BondAccount>,
    tickets: BTreeMap<u64, Ticket>,
    next_ticket: u64,
    sequence: u64,
    received: u128,
    paid: u128,
    fees: u128,
}
#[near]
impl SettlementOracle {
    #[init]
    pub fn new(
        network: String,
        registrar: AccountId,
        treasury: AccountId,
        storage_byte_cost: Amount,
    ) -> Self {
        require!(
            network == "sandbox" || network == "testnet",
            "production disabled"
        );
        require!(
            storage_byte_cost.0 > 0 && storage_byte_cost.0 <= 1_000_000_000_000_000_000_000,
            "storage price"
        );
        require!(
            env::account_balance().as_yoctonear() >= OPERATING,
            "prefund operating allocation"
        );
        let mut this = Self {
            network,
            registrar,
            treasury,
            byte_cost: storage_byte_cost.0,
            cases: BTreeMap::new(),
            accounts: BTreeMap::new(),
            tickets: BTreeMap::new(),
            next_ticket: 0,
            sequence: 0,
            received: 0,
            paid: 0,
            fees: 0,
        };
        this.finish("INITIALIZED", None);
        this
    }
    #[payable]
    pub fn register_account(&mut self) {
        let owner = env::predecessor_account_id();
        require!(
            self.accounts.len() < 16 && !self.accounts.contains_key(&owner),
            "account cap or duplicate"
        );
        require!(
            env::attached_deposit().as_yoctonear() == ACCOUNT_BYTES * self.byte_cost,
            "exact account storage"
        );
        self.accounts
            .insert(owner, BondAccount { credit: Amount(0) });
        self.finish("ACCOUNT_REGISTERED", None);
    }
    #[payable]
    pub fn register_series(
        &mut self,
        config: SeriesConfig,
        observation: ObservationSpec,
        policy: Policy,
    ) {
        require!(
            env::predecessor_account_id() == self.registrar,
            "registrar only"
        );
        require!(
            self.accounts.contains_key(&self.treasury),
            "register treasury first"
        );
        require!(
            self.cases.len() < 8 && !self.cases.contains_key(&config.series_id),
            "series cap or duplicate"
        );
        require!(
            env::attached_deposit().as_yoctonear() == SERIES_BYTES * self.byte_cost,
            "exact series storage"
        );
        validate(&config, &observation, &policy);
        let id = config.series_id.clone();
        let case = Case {
            config,
            observation,
            policy,
            evidence: BTreeMap::new(),
            proposal: None,
            challenge: None,
            state: "OPEN".into(),
            price: None,
            final_evidence_hash: None,
            bonds_released: false,
        };
        case.deadlines();
        self.cases.insert(id.clone(), case);
        self.finish("SERIES_REGISTERED", Some(id));
    }
    #[payable]
    pub fn publish(&mut self, evidence: Evidence) {
        self.one();
        let mut c = self.case(&evidence.series_id);
        c.live();
        require!(
            env::block_timestamp() >= c.config.maturity_ns.0
                && env::block_timestamp() < c.deadlines().2,
            "publication window"
        );
        let source = c
            .observation
            .primary
            .iter()
            .chain(c.observation.fallback.iter())
            .find(|s| s.source_id == evidence.source_id)
            .expect("unknown source");
        require!(
            source.publisher == env::predecessor_account_id(),
            "publisher only"
        );
        require!(
            !c.evidence.contains_key(&evidence.source_id),
            "duplicate publication/equivocation"
        );
        require!(
            evidence.dataset_hash == c.observation.dataset_hash
                && evidence.asset == "NEAR"
                && evidence.quote == "USD"
                && evidence.price_scale == c.observation.price_scale,
            "evidence units/dataset"
        );
        let count = (c.observation.window.end_ns.0 - c.observation.window.start_ns.0)
            / c.observation.sample_step_ns.0;
        require!(evidence.samples.len() == count as usize, "missing coverage");
        for (i, s) in evidence.samples.iter().enumerate() {
            require!(
                s.timestamp_ns.0
                    == c.observation.window.start_ns.0 + i as u64 * c.observation.sample_step_ns.0
                    && s.timestamp_ns.0 <= env::block_timestamp(),
                "sample timestamp"
            );
            require!(
                s.price.0 >= c.observation.min_price.0 && s.price.0 <= c.observation.max_price.0,
                "sample price"
            );
        }
        require!(
            hash(&evidence) == source.evidence_hash,
            "evidence commitment mismatch"
        );
        let id = evidence.series_id.clone();
        c.evidence.insert(evidence.source_id.clone(), evidence);
        self.cases.insert(id.clone(), c);
        self.finish("OBSERVATION_PUBLISHED", Some(id));
    }
    pub fn get_resolution(&self, series_id: String) -> Resolution {
        let c = self.case(&series_id);
        Resolution {
            config: c.config,
            state: c.state,
            price: c.price,
        }
    }
    pub fn get_case(&self, series_id: String) -> Case {
        self.case(&series_id)
    }
    pub fn get_observation(&self, series_id: String, route: Route) -> Option<Observation> {
        self.case(&series_id).observation(route)
    }
    pub fn get_account(&self, account_id: AccountId) -> Option<BondAccount> {
        self.accounts.get(&account_id).cloned()
    }
    pub fn get_ticket(&self, ticket_id: Num64) -> Option<Ticket> {
        self.tickets.get(&ticket_id.0).cloned()
    }
    pub fn list_series(&self) -> Vec<String> {
        self.cases.keys().cloned().collect()
    }
    pub fn list_accounts(&self) -> Vec<AccountId> {
        self.accounts.keys().cloned().collect()
    }
    pub fn list_tickets(&self) -> Vec<Ticket> {
        self.tickets.values().cloned().collect()
    }
    pub fn storage_quote(&self) -> near_sdk::serde_json::Value {
        json!({"account":Amount(ACCOUNT_BYTES*self.byte_cost),"series":Amount(SERIES_BYTES*self.byte_cost),"storage_byte_cost":Amount(self.byte_cost)})
    }
    pub fn custody(&self) -> near_sdk::serde_json::Value {
        let locked = self.cases.values().map(Case::locked).sum::<u128>();
        let credits = self.accounts.values().map(|a| a.credit.0).sum::<u128>();
        let pending = self
            .tickets
            .values()
            .filter(|t| t.state == "PENDING")
            .map(|t| t.amount.0)
            .sum::<u128>();
        let unknown = self
            .tickets
            .values()
            .filter(|t| t.state == "UNKNOWN")
            .map(|t| t.amount.0)
            .sum::<u128>();
        let storage = (self.accounts.len() as u128 * ACCOUNT_BYTES
            + self.cases.len() as u128 * SERIES_BYTES)
            * self.byte_cost;
        json!({"received":Amount(self.received),"paid":Amount(self.paid),"locked":Amount(locked),"credits":Amount(credits),"pending":Amount(pending),"unknown":Amount(unknown),"storage":Amount(storage),"operating":Amount(OPERATING),"fees":Amount(self.fees),"native_balance":Amount(env::account_balance().as_yoctonear()),"retained_covered":env::account_balance().as_yoctonear()>=storage+OPERATING+self.fees+locked+credits,"next_ticket":Num64(self.next_ticket),"storage_bytes":Num64(env::storage_usage())})
    }
}
impl SettlementOracle {
    fn case(&self, id: &str) -> Case {
        let mut c = self.cases.get(id).expect("unknown series").clone();
        if c.state == "OPEN" && env::block_timestamp() >= c.config.maturity_ns.0 {
            c.state = "MATURED_PENDING".into();
        }
        c
    }
    fn one(&mut self) {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "one yocto required"
        );
        self.fees += 1;
    }
    fn credit(&mut self, owner: &AccountId, amount: u128) {
        let a = self
            .accounts
            .get_mut(owner)
            .expect("unregistered bond account");
        a.credit.0 = a.credit.0.checked_add(amount).expect("credit overflow");
    }
    fn finish(&mut self, kind: &str, series_id: Option<String>) {
        let locked = self.cases.values().map(Case::locked).sum::<u128>();
        let credits = self.accounts.values().map(|a| a.credit.0).sum::<u128>();
        let flight = self
            .tickets
            .values()
            .filter(|t| t.state == "PENDING" || t.state == "UNKNOWN")
            .map(|t| t.amount.0)
            .sum::<u128>();
        require!(
            self.received == self.paid + locked + credits + flight,
            "bond conservation"
        );
        for c in self.cases.values() {
            require!(
                (c.state == "FINALIZED") == c.price.is_some(),
                "finality invariant"
            );
        }
        self.sequence = self.sequence.checked_add(1).expect("sequence overflow");
        let bytes = near_sdk::borsh::to_vec(self).expect("state encoding");
        require!(
            bytes.len() as u128
                <= 8192
                    + self.accounts.len() as u128 * ACCOUNT_BYTES
                    + self.cases.len() as u128 * SERIES_BYTES,
            "funded state limit"
        );
        let digest: String = env::sha256(&bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({"standard":"hedgeveil_oracle","version":"1.0.0","event":kind,"data":[{"sequence":Num64(self.sequence),"series_id":series_id,"state_hash":digest,"received":Amount(self.received),"paid":Amount(self.paid),"locked":Amount(locked),"credits":Amount(credits),"in_flight":Amount(flight)}]})
        ));
    }
}

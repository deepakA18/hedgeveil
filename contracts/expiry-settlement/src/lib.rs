//! Isolated expiry profile. Existing sampled-series state is never migrated here.
use hedgeveil_expiry_worker::{calculate, Calculation, Evidence, POLICY, WINDOW};
use near_sdk::{
    env, near, require, serde::Serialize, serde_json::json, AccountId, Gas, NearToken,
    PanicOnDefault, Promise,
};
use protocol_types::{Amount, Num64, Resolution, SeriesConfig};
use std::collections::BTreeMap;
const Q: u128 = 1_000_000_000_000_000_000_000_000;
const SECOND: u64 = 1_000_000_000;
const VERSION: &str = "native-trade-twap-v1";
const WORKER: &str = "86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43";
const ARTIFACT_OWNER: &str = "20ddea9833434ebf11950ff12d97554cb32a78331c80b2c6f241b2108aed555b";
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Accepted {
    pub price: Amount,
    pub evidence_sha256: String,
    pub response_sha256: String,
    pub accepted_ns: Num64,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Case {
    pub config: SeriesConfig,
    pub pending: Option<Num64>,
    pub accepted: Option<Accepted>,
    pub price: Option<Amount>,
    pub last_result: String,
}
#[near(serializers=[json])]
#[serde(deny_unknown_fields)]
struct Output {
    calculation: Calculation,
    evidence: Evidence,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Resolver {
    network: String,
    registrar: AccountId,
    guardian: AccountId,
    source: AccountId,
    paused: bool,
    operation: u64,
    sequence: u64,
    cases: BTreeMap<String, Case>,
    archived: near_sdk::store::Vector<Case>,
    archived_ids: near_sdk::store::LookupMap<String, u32>,
    archive_commitment: [u8; 32],
}
fn digest(bytes: &[u8]) -> String {
    env::sha256(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn hash<T: Serialize>(value: &T) -> String {
    let mut v = near_sdk::serde_json::to_value(value).expect("json");
    v.sort_all_objects();
    digest(&near_sdk::serde_json::to_vec(&v).expect("json"))
}
#[near]
impl Resolver {
    #[init]
    pub fn new(
        network: String,
        registrar: AccountId,
        guardian: AccountId,
        source: AccountId,
    ) -> Self {
        require!(
            network == "sandbox" || network == "testnet",
            "production disabled"
        );
        require!(
            network == "sandbox" || source.as_str() == "outlayer.testnet",
            "testnet source"
        );
        require!(
            source != env::current_account_id(),
            "source must be external"
        );
        require!(
            env::account_balance().as_yoctonear() >= 5 * Q,
            "prefund operations"
        );
        let mut this = Self {
            network,
            registrar,
            guardian,
            source,
            paused: false,
            operation: 0,
            sequence: 0,
            cases: BTreeMap::new(),
            archived: near_sdk::store::Vector::new(b"a"),
            archived_ids: near_sdk::store::LookupMap::new(b"i"),
            archive_commitment: [0; 32],
        };
        this.finish("INITIALIZED");
        this
    }
    pub fn source_hash(&self) -> String {
        hash(
            &json!({"account":self.source,"worker_sha256":WORKER,"url":Self::worker_url(),"product":"NEAR-USD","endpoint":"https://api.exchange.coinbase.com/products/NEAR-USD/trades","trust":"OUTLAYER_OPERATOR_AND_COINBASE_HTTPS"}),
        )
    }
    pub fn policy_hash() -> String {
        hash(
            &json!({"version":VERSION,"policy":POLICY,"window_us":WINDOW.to_string(),"max_age_us":"60000000","rounding":"FLOOR_ONCE","integration":"LAST_TRADE_HOLD","ties":"HIGHEST_TRADE_ID","completeness":"CONSECUTIVE_IDS_AND_BOUNDARIES","missing":"DELAYED","max_response_bytes":500000,"max_pages":3}),
        )
    }
    #[payable]
    pub fn register_series(&mut self, config: SeriesConfig) {
        require!(
            env::predecessor_account_id() == self.registrar,
            "registrar only"
        );
        require!(
            env::attached_deposit().as_yoctonear() == Q / 10,
            "exact nonrefundable storage fee"
        );
        config.validate();
        require!(
            self.cases.len() < 32
                && !self.cases.contains_key(&config.series_id)
                && !self.archived_ids.contains_key(&config.series_id),
            "series cap/duplicate"
        );
        require!(
            config.oracle_account_id == env::current_account_id()
                && config.oracle_version == VERSION,
            "resolver binding"
        );
        require!(
            config.oracle_config_hash == self.source_hash()
                && config.finalization_policy_hash == Self::policy_hash()
                && config.index_definition_hash == Self::policy_hash(),
            "immutable source/policy binding"
        );
        let end = config.maturity_ns.0;
        require!(
            end.is_multiple_of(SECOND)
                && end.checked_sub(config.observation_window.start_ns.0) == Some(1800 * SECOND),
            "exact expiry window"
        );
        require!(
            env::block_timestamp() < config.mint_cutoff_ns.0
                && config.mint_cutoff_ns.0 <= config.observation_window.start_ns.0,
            "future terms"
        );
        self.cases.insert(
            config.series_id.clone(),
            Case {
                config,
                pending: None,
                accepted: None,
                price: None,
                last_result: "NOT_REQUESTED".into(),
            },
        );
        self.finish("SERIES_REGISTERED");
    }
    #[payable]
    pub fn request(&mut self, series_id: String) -> Promise {
        require!(!self.paused, "paused");
        require!(
            env::attached_deposit().as_yoctonear() == Q / 50,
            "exact caller-funded compute budget"
        );
        let mut c = self.case(&series_id);
        require!(
            env::block_timestamp() >= c.config.maturity_ns.0,
            "expiry not reached"
        );
        require!(
            c.pending.is_none() && c.accepted.is_none() && c.price.is_none(),
            "pending or immutable result"
        );
        self.operation = self.operation.checked_add(1).expect("request overflow");
        let id = Num64(self.operation);
        c.pending = Some(id);
        c.last_result = "PENDING".into();
        let source = json!({"WasmUrl":{"url":Self::worker_url(),"hash":WORKER,"build_target":"wasm32-wasip2"}});
        let args = json!({"source":source,"execution_source":source,"resource_limits":{"max_instructions":10000000000u64,"max_memory_mb":128,"max_execution_seconds":60},"input_data":json!({"expiry_seconds":(c.config.maturity_ns.0/SECOND).to_string()}).to_string(),"secrets_ref":null,"response_format":"Json","payer_account_id":env::predecessor_account_id(),"params":null,"callback_receiver_id":null});
        self.cases.insert(series_id.clone(), c);
        self.finish("EVIDENCE_REQUESTED");
        // The attached caller budget is the only outgoing value. Refunds are
        // provider-to-payer; no timeout creates a resolver refund or a resend.
        require!(
            env::account_balance().as_yoctonear() >= 2 * Q + Q / 50,
            "compute reserve separation"
        );
        Promise::new(self.source.clone())
            .function_call(
                "request_execution",
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(Q / 50),
                Gas::from_tgas(100),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_result",
                    json!({"series_id":series_id,"request_id":id})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(150),
                ),
            )
    }
    #[private]
    pub fn on_result(&mut self, series_id: String, request_id: Num64) -> bool {
        require!(env::promise_results_count() == 1, "callback result count");
        let mut c = self.case(&series_id);
        if c.pending != Some(request_id) {
            return false;
        }
        let accepted = env::promise_result_checked(0, 500_000)
            .ok()
            .and_then(|bytes| {
                let output: Output = near_sdk::serde_json::from_slice(&bytes).ok()?;
                if output.evidence.pages.len() > 3 {
                    return None;
                }
                if output.evidence.request.expiry_seconds
                    != (c.config.maturity_ns.0 / SECOND).to_string()
                {
                    return None;
                }
                // Recompute all arithmetic, sequence/boundary checks and archive
                // digest. HTTP provenance still relies on the pinned provider run.
                let calculated = calculate(&output.evidence).ok()?;
                if calculated != output.calculation {
                    return None;
                }
                Some(Accepted {
                    price: Amount(calculated.price.parse().ok()?),
                    evidence_sha256: calculated.evidence_sha256,
                    response_sha256: digest(&bytes),
                    accepted_ns: Num64(env::block_timestamp()),
                })
            });
        let valid = accepted.is_some();
        c.pending = None;
        c.accepted = accepted;
        c.last_result = if valid { "ACCEPTED" } else { "REJECTED" }.into();
        self.cases.insert(series_id, c);
        self.finish(if valid {
            "EVIDENCE_ACCEPTED"
        } else {
            "EVIDENCE_REJECTED"
        });
        valid
    }
    pub fn finalize(&mut self, series_id: String) -> bool {
        let mut c = self.case(&series_id);
        if c.price.is_some() {
            return true;
        }
        require!(
            !self.paused && env::block_timestamp() >= c.config.maturity_ns.0,
            "paused or before expiry"
        );
        let Some(a) = &c.accepted else {
            return false;
        };
        c.price = Some(a.price);
        self.cases.insert(series_id, c);
        self.finish("FINALIZED");
        true
    }
    pub fn set_pause(&mut self, paused: bool) {
        require!(
            env::predecessor_account_id() == self.guardian,
            "guardian only"
        );
        self.paused = paused;
        self.finish("PAUSE_CHANGED");
    }
    pub fn get_case(&self, series_id: String) -> Case {
        self.case(&series_id)
    }
    #[payable]
    pub fn archive_case(&mut self, series_id: String) {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "one yocto required"
        );
        let c = self.cases.get(&series_id).expect("not retained").clone();
        require!(
            c.price.is_some() && c.pending.is_none(),
            "finalized case required"
        );
        require!(
            !self.archived_ids.contains_key(&series_id),
            "already archived"
        );
        self.archive_commitment = env::sha256_array(
            near_sdk::borsh::to_vec(&(self.archive_commitment, &c)).expect("archive"),
        );
        self.archived_ids
            .insert(series_id.clone(), self.archived.len());
        self.archived.push(c);
        self.archived_ids.flush();
        self.archived.flush();
        self.cases.remove(&series_id);
        self.finish("CASE_ARCHIVED");
    }
    pub fn list_archived_cases(&self, from_index: u32, limit: u32) -> Vec<Case> {
        require!((1..=16).contains(&limit), "page limit");
        (from_index..from_index.saturating_add(limit).min(self.archived.len()))
            .map(|i| self.archived.get(i).expect("archive index").clone())
            .collect()
    }
    pub fn get_resolution(&self, series_id: String) -> Resolution {
        let c = self.case(&series_id);
        let state = if c.price.is_some() {
            "FINALIZED"
        } else if env::block_timestamp() >= c.config.maturity_ns.0 {
            "RESOLUTION_DELAYED"
        } else {
            "OPEN"
        };
        Resolution {
            config: c.config,
            state: state.into(),
            price: c.price,
        }
    }
    pub fn indexer_status(&self) -> near_sdk::serde_json::Value {
        json!({"network":self.network,"contract_id":env::current_account_id(),"sequence":Num64(self.sequence)})
    }
    pub fn get_snapshot(&self) -> near_sdk::serde_json::Value {
        json!({"network":self.network,"contract_id":env::current_account_id(),"sequence":Num64(self.sequence),"version":VERSION,"registrar":self.registrar,"guardian":self.guardian,"source":self.source,"worker_sha256":WORKER,"request_sequence":Num64(self.operation),"paused":self.paused,"cases":self.cases,"layout_version":2,"archived_count":Num64(u64::from(self.archived.len())),"archive_commitment":self.archive_commitment.iter().map(|b|format!("{b:02x}")).collect::<String>()})
    }
}
impl Resolver {
    fn worker_url() -> String {
        format!("https://test.fastfs.io/{ARTIFACT_OWNER}/outlayer.testnet/{WORKER}.wasm")
    }
    fn case(&self, id: &str) -> Case {
        self.cases
            .get(id)
            .or_else(|| {
                self.archived_ids
                    .get(id)
                    .and_then(|i| self.archived.get(*i))
            })
            .expect("unknown series")
            .clone()
    }
    fn finish(&mut self, event: &str) {
        let bytes = near_sdk::borsh::to_vec(self).expect("state").len() as u128;
        require!(
            env::account_balance().as_yoctonear()
                >= (u128::from(env::storage_usage()) + bytes + 32768)
                    * env::storage_byte_cost().as_yoctonear()
                    + Q,
            "storage and operating reserve"
        );
        self.sequence = self.sequence.checked_add(1).expect("event overflow");
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({"standard":"hedgeveil_expiry_oracle","version":"1.0.0","event":event,"data":[{"network":self.network,"contract_id":env::current_account_id(),"sequence":Num64(self.sequence),"state_hash":hash(&self.get_snapshot())}]})
        ));
    }
}

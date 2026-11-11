//! Candidate ingestion-time resolver. Not approved for public deployment.
use near_sdk::{
    env, near, require, serde::Serialize, serde_json::json, AccountId, Gas, NearToken,
    PanicOnDefault, Promise,
};
use protocol_types::{Amount, Num64, Resolution, SeriesConfig};
use std::collections::BTreeMap;
const Q: u128 = 1_000_000_000_000_000_000_000_000;
const SECOND: u64 = 1_000_000_000;
const VERSION: &str = "native-sampled-v1";
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct SourceSpec {
    pub account: AccountId,
    pub reporter: AccountId,
    pub asset: String,
    pub min_price: Amount,
    pub max_price: Amount,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Sample {
    pub report_ns: Num64,
    pub request_ns: Num64,
    pub accepted_ns: Num64,
    pub price: Amount,
    pub response_hash: String,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Pending {
    pub id: Num64,
    pub slot: u8,
    pub requested_ns: Num64,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Case {
    pub config: SeriesConfig,
    pub source: SourceSpec,
    pub samples: Vec<Option<Sample>>,
    pub pending: Option<Pending>,
    pub price: Option<Amount>,
}
#[near(serializers=[json])]
struct NativePrice {
    multiplier: Amount,
    decimals: u8,
}
#[near(serializers=[json])]
struct NativeReport {
    oracle_id: AccountId,
    timestamp: Num64,
    price: NativePrice,
}
#[near(serializers=[json])]
struct NativeAsset {
    reports: Vec<NativeReport>,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Resolver {
    network: String,
    registrar: AccountId,
    guardian: AccountId,
    paused: bool,
    operation: u64,
    sequence: u64,
    cases: BTreeMap<String, Case>,
}
fn hash<T: Serialize>(value: &T) -> String {
    let mut v = near_sdk::serde_json::to_value(value).expect("json");
    v.sort_all_objects();
    env::sha256(near_sdk::serde_json::to_vec(&v).expect("json"))
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn normalize(p: &NativePrice) -> Option<u128> {
    if p.multiplier.0 == 0 || p.decimals > 38 {
        return None;
    }
    if p.decimals <= 12 {
        p.multiplier
            .0
            .checked_mul(10u128.pow((12 - p.decimals).into()))
    } else {
        let d = 10u128.pow((p.decimals - 12).into());
        (p.multiplier.0.is_multiple_of(d)).then_some(p.multiplier.0 / d)
    }
}
#[near]
impl Resolver {
    #[init]
    pub fn new(network: String, registrar: AccountId, guardian: AccountId) -> Self {
        require!(
            network == "sandbox" || network == "testnet",
            "production disabled"
        );
        require!(
            env::account_balance().as_yoctonear() >= 5 * Q,
            "prefund storage and operations"
        );
        let mut this = Self {
            network,
            registrar,
            guardian,
            paused: false,
            operation: 0,
            sequence: 0,
            cases: BTreeMap::new(),
        };
        this.finish("INITIALIZED");
        this
    }
    pub fn source_hash(source: SourceSpec) -> String {
        hash(&source)
    }
    pub fn policy_hash() -> String {
        hash(
            &json!({"version":VERSION,"slots":3,"max_age_ns":"30000000000","callback_ns":"10000000000","review_ns":"60000000000","aggregation":"FLOOR_ARITHMETIC_MEAN","time_basis":"ORACLE_INGESTION","missing":"DELAYED"}),
        )
    }
    #[payable]
    pub fn register_series(&mut self, config: SeriesConfig, source: SourceSpec) {
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
            self.cases.len() < 16 && !self.cases.contains_key(&config.series_id),
            "series cap/duplicate"
        );
        require!(
            config.oracle_account_id == env::current_account_id()
                && config.oracle_version == VERSION,
            "resolver binding"
        );
        require!(
            config.oracle_config_hash == hash(&source)
                && config.finalization_policy_hash == Self::policy_hash(),
            "immutable source/policy binding"
        );
        require!(
            source.asset == "wrap.near" && source.account != env::current_account_id(),
            "source asset/account"
        );
        require!(
            self.network == "sandbox" || source.account.as_str() == "price-oracle.testnet",
            "testnet source"
        );
        require!(
            source.min_price.0 > 0
                && source.max_price.0 >= source.min_price.0
                && source.max_price.0 <= u128::MAX / 3,
            "price bounds"
        );
        let start = config.observation_window.start_ns.0;
        let width = config.maturity_ns.0 - start;
        require!(
            width.is_multiple_of(3) && width / 3 >= 30 * SECOND && width / 3 <= 3600 * SECOND,
            "three bounded slots"
        );
        require!(
            env::block_timestamp() < config.mint_cutoff_ns.0
                && config.mint_cutoff_ns.0 <= start
                && config.maturity_ns.0 <= u64::MAX - 60 * SECOND,
            "future terms"
        );
        self.cases.insert(
            config.series_id.clone(),
            Case {
                config,
                source,
                samples: vec![None, None, None],
                pending: None,
                price: None,
            },
        );
        self.finish("SERIES_REGISTERED");
    }
    pub fn sample(&mut self, series_id: String) -> Promise {
        require!(!self.paused, "paused");
        let mut c = self.case(&series_id);
        let now = env::block_timestamp();
        let start = c.config.observation_window.start_ns.0;
        let end = c.config.maturity_ns.0;
        require!(
            now >= start && now < end && c.price.is_none(),
            "outside live sampling window"
        );
        let slot = ((now - start) / ((end - start) / 3)) as u8;
        require!(c.samples[slot as usize].is_none(), "sample immutable");
        if let Some(p) = &c.pending {
            require!(now >= p.requested_ns.0 + 5 * SECOND, "request pending");
        }
        self.operation = self.operation.checked_add(1).expect("request overflow");
        let id = Num64(self.operation);
        c.pending = Some(Pending {
            id,
            slot,
            requested_ns: Num64(now),
        });
        let source = c.source.account.clone();
        let asset = c.source.asset.clone();
        self.cases.insert(series_id.clone(), c);
        self.finish("SAMPLE_REQUESTED");
        Promise::new(source)
            .function_call(
                "get_asset",
                json!({"asset_id":asset}).to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(15),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_sample",
                    json!({"series_id":series_id,"request_id":id})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(35),
                ),
            )
    }
    #[private]
    pub fn on_sample(&mut self, series_id: String, request_id: Num64) -> bool {
        require!(env::promise_results_count() == 1, "callback result count");
        let mut c = self.case(&series_id);
        let Some(p) = c.pending.clone().filter(|p| p.id == request_id) else {
            return false;
        };
        c.pending = None;
        let now = env::block_timestamp();
        let width = (c.config.maturity_ns.0 - c.config.observation_window.start_ns.0) / 3;
        let start = c.config.observation_window.start_ns.0 + u64::from(p.slot) * width;
        let end = start + width;
        let bytes = env::promise_result_checked(0, 8192).ok();
        let asset = bytes
            .as_ref()
            .and_then(|b| near_sdk::serde_json::from_slice::<NativeAsset>(b).ok());
        let sample = asset.and_then(|a| {
            if self.paused
                || now >= end
                || now < p.requested_ns.0
                || now - p.requested_ns.0 > 10 * SECOND
                || a.reports.len() > 16
            {
                return None;
            }
            let mut ids = std::collections::BTreeSet::new();
            if a.reports.iter().any(|r| !ids.insert(r.oracle_id.clone())) {
                return None;
            }
            let r = a
                .reports
                .iter()
                .find(|r| r.oracle_id == c.source.reporter)?;
            if r.timestamp.0 < start
                || r.timestamp.0 >= end
                || r.timestamp.0 > p.requested_ns.0
                || p.requested_ns.0 - r.timestamp.0 > 30 * SECOND
            {
                return None;
            }
            let price = normalize(&r.price)?;
            if price < c.source.min_price.0 || price > c.source.max_price.0 {
                return None;
            }
            Some(Sample {
                report_ns: r.timestamp,
                request_ns: p.requested_ns,
                accepted_ns: Num64(now),
                price: Amount(price),
                response_hash: env::sha256(bytes.as_ref()?)
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect(),
            })
        });
        let accepted = sample.is_some();
        if accepted {
            require!(c.samples[p.slot as usize].is_none(), "sample immutable");
            c.samples[p.slot as usize] = sample;
        }
        self.cases.insert(series_id, c);
        self.finish(if accepted {
            "SAMPLE_ACCEPTED"
        } else {
            "SAMPLE_REJECTED"
        });
        accepted
    }
    pub fn finalize(&mut self, series_id: String) -> bool {
        let mut c = self.case(&series_id);
        if c.price.is_some() {
            return true;
        }
        require!(
            !self.paused && env::block_timestamp() >= c.config.maturity_ns.0 + 60 * SECOND,
            "paused or review open"
        );
        let Some(sum) = c
            .samples
            .iter()
            .try_fold(0u128, |sum, s| sum.checked_add(s.as_ref()?.price.0))
        else {
            return false;
        };
        c.price = Some(Amount(sum / 3));
        c.pending = None;
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
    pub fn indexer_status(&self) -> near_sdk::serde_json::Value {
        json!({"network":self.network,"contract_id":env::current_account_id(),"sequence":Num64(self.sequence)})
    }
    pub fn get_snapshot(&self) -> near_sdk::serde_json::Value {
        json!({"network":self.network,"contract_id":env::current_account_id(),"sequence":Num64(self.sequence),"version":VERSION,"registrar":self.registrar,"guardian":self.guardian,"request_sequence":Num64(self.operation),"paused":self.paused,"cases":self.cases})
    }
    pub fn get_case(&self, series_id: String) -> Case {
        self.case(&series_id)
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
}
impl Resolver {
    fn case(&self, id: &str) -> Case {
        self.cases.get(id).expect("unknown series").clone()
    }
    fn finish(&mut self, event: &str) {
        self.coverage();
        self.sequence = self.sequence.checked_add(1).expect("event overflow");
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({"standard":"hedgeveil_external_oracle","version":"1.0.0","event":event,"data":[{"network":self.network,"contract_id":env::current_account_id(),"sequence":Num64(self.sequence),"state_hash":hash(&self.get_snapshot())}]})
        ));
    }
    fn coverage(&self) {
        let bytes = near_sdk::borsh::to_vec(self).expect("state").len() as u128;
        require!(
            env::account_balance().as_yoctonear()
                >= (u128::from(env::storage_usage()) + bytes + 32768)
                    * env::storage_byte_cost().as_yoctonear()
                    + Q,
            "storage and operating reserve"
        );
    }
}

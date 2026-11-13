use near_sdk::{near, AccountId};
use protocol_types::{Amount, Num64, SeriesConfig};
pub const MAX_ACCOUNTS: usize = 16;
// Layout 2: bounded hot slots, reusable only after zero-balance archival.
// Incompatible with layout 1 Borsh state: deploy to a NEW account.
pub const MAX_SERIES: usize = 32;
pub const MAX_TICKETS_PER_ACCOUNT: u8 = 4;
pub const STORAGE_BYTES: u128 = 4096;
pub const CREATION_FEE: u128 = 1_000_000_000_000_000_000_000;
pub const OPERATING: u128 = 20 * payoff_math::Q;
pub const MAX_COLLATERAL: u128 = 1000 * payoff_math::Q;
pub const MAX_SUPPLY: u128 = 100 * payoff_math::Q;
pub const CALLBACK_VERSION: u8 = 1;
pub const CALLBACK_TGAS: u64 = 120;
#[near(serializers=[borsh,json])]
#[derive(Clone, Copy, Default)]
pub struct Position {
    pub p: Amount,
    pub n: Amount,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct LedgerAccount {
    pub free: Amount,
    pub storage_paid: Amount,
    pub positions: [Position; MAX_SERIES],
    pub retained_tickets: u8,
    pub closing: bool,
}
impl LedgerAccount {
    pub fn empty(storage: u128) -> Self {
        Self {
            free: Amount(0),
            storage_paid: Amount(storage),
            positions: [Position::default(); MAX_SERIES],
            retained_tickets: 0,
            closing: false,
        }
    }
    pub fn no_claims(&self) -> bool {
        self.positions.iter().all(|p| p.p.0 == 0 && p.n.0 == 0)
    }
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Series {
    pub config: SeriesConfig,
    pub slot: u8,
    pub outstanding_p: Amount,
    pub outstanding_n: Amount,
    pub reserve: Amount,
    pub total_split: Amount,
    pub total_merged: Amount,
    pub total_paid: Amount,
    pub dust_released: Amount,
    pub final_price: Option<Amount>,
    pub p_coefficient: Amount,
    pub n_coefficient: Amount,
    pub closed: bool,
    pub request: Option<Num64>,
    pub requested_at: Num64,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TicketState {
    Pending,
    Succeeded,
    FailedConfirmed,
    Unknown,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TicketKind {
    Collateral,
    StorageRefund,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Ticket {
    pub id: Num64,
    pub owner: AccountId,
    pub receiver: AccountId,
    pub amount: Amount,
    pub state: TicketState,
    pub kind: TicketKind,
    pub created_ns: Num64,
    pub version: u8,
    pub balance_restored: bool,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, Default)]
pub struct Pauses {
    pub deposits: bool,
    pub series: bool,
    pub splits: bool,
}

use near_sdk::{near, AccountId};
use protocol_types::{Amount, Asset, Num64};
use std::collections::BTreeMap;
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Domain {
    pub protocol_version: String,
    pub network: String,
    pub contract_id: AccountId,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Leg {
    pub asset: Asset,
    pub amount: Amount,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Fee {
    pub asset: String,
    pub amount: Amount,
    pub receiver: AccountId,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Quote {
    pub kind: String,
    pub schema_version: String,
    pub domain: Domain,
    pub maker: AccountId,
    pub taker: Option<AccountId>,
    pub maker_gives: Vec<Leg>,
    pub taker_gives: Vec<Leg>,
    pub fee: Fee,
    pub fill_rule: String,
    pub rounding: String,
    pub nonce: Num64,
    pub cancellation_epoch: Num64,
    pub expiry_ns: Num64,
    pub signing_key_id: String,
    pub signature_scheme: String,
    #[borsh(skip)]
    pub signature: String,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct PairQuote {
    pub kind: String,
    pub schema_version: String,
    pub domain: Domain,
    pub maker: AccountId,
    pub taker: Option<AccountId>,
    pub series_id: String,
    pub pair_amount: Amount,
    pub maker_leg: String,
    pub maker_collateral: Amount,
    pub fee: Fee,
    pub fill_rule: String,
    pub rounding: String,
    pub nonce: Num64,
    pub cancellation_epoch: Num64,
    pub expiry_ns: Num64,
    pub signing_key_id: String,
    pub signature_scheme: String,
    #[borsh(skip)]
    pub signature: String,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct SigningKey {
    pub public_key: String,
    pub revoked: bool,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, Default)]
pub struct MakerState {
    pub keys: BTreeMap<String, SigningKey>,
    pub epoch: Num64,
    pub consumed: [u8; 32],
    pub cancelled: [u8; 32],
}
impl MakerState {
    pub fn unavailable(&self, n: u64) -> bool {
        n >= 256
            || (self.consumed[n as usize / 8] | self.cancelled[n as usize / 8]) & (1 << (n % 8))
                != 0
    }
    pub fn invalidate(&mut self, next: u64) {
        self.epoch = Num64(next);
        self.consumed = [0; 32];
        self.cancelled = [0; 32];
    }
}
pub fn bytes<T: near_sdk::borsh::BorshSerialize>(prefix: &[u8], value: &T) -> Vec<u8> {
    let mut out = prefix.to_vec();
    out.extend(near_sdk::borsh::to_vec(value).expect("signing encoding"));
    out
}
pub fn hex(value: &[u8]) -> String {
    value.iter().map(|b| format!("{b:02x}")).collect()
}
pub fn decode<const N: usize>(s: &str) -> [u8; N] {
    near_sdk::require!(
        s.len() == N * 2
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
        "canonical hex required"
    );
    let mut out = [0u8; N];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).expect("hex");
    }
    out
}

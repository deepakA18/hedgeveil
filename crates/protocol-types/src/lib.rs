//! Immutable, versioned clearinghouse/oracle wire types. No custody authority.
use near_sdk::{
    near, require,
    serde::{self, Deserialize, Deserializer, Serialize, Serializer},
    AccountId,
};

macro_rules! decimal {
    ($name:ident,$inner:ty) => {
        #[near(serializers = [borsh])]
        #[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
        pub struct $name(pub $inner);
        impl Serialize for $name {
            fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
                s.serialize_str(&self.0.to_string())
            }
        }
        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
                let s = String::deserialize(d)?;
                if s.is_empty()
                    || (s.len() > 1 && s.starts_with('0'))
                    || !s.bytes().all(|b| b.is_ascii_digit())
                {
                    return Err(serde::de::Error::custom(
                        "canonical unsigned decimal string required",
                    ));
                }
                s.parse::<$inner>()
                    .map(Self)
                    .map_err(serde::de::Error::custom)
            }
        }
    };
}
decimal!(Amount, u128);
decimal!(Num64, u64);

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Window {
    pub start_ns: Num64,
    pub end_ns: Num64,
}
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SeriesConfig {
    pub series_id: String,
    pub version: String,
    pub collateral_kind: String,
    pub index_definition_hash: String,
    pub payoff_kind: String,
    pub strike: Amount,
    pub price_scale: Amount,
    pub maturity_ns: Num64,
    pub mint_cutoff_ns: Num64,
    pub observation_window: Window,
    pub oracle_account_id: AccountId,
    pub oracle_version: String,
    pub oracle_config_hash: String,
    pub finalization_policy_hash: String,
    pub max_supply: Amount,
}
impl SeriesConfig {
    pub fn validate(&self) {
        require!(
            valid_id(&self.series_id) && valid_id(&self.oracle_version),
            "invalid ID"
        );
        require!(
            self.version == "1"
                && self.collateral_kind == "NATIVE_NEAR"
                && self.payoff_kind == "CAPPED_USD_COMPLEMENT",
            "unsupported terms"
        );
        require!(
            self.strike.0 > 0 && self.max_supply.0 > 0 && self.price_scale.0 == 1_000_000_000_000,
            "invalid monetary terms"
        );
        require!(
            self.observation_window.start_ns.0 < self.observation_window.end_ns.0
                && self.observation_window.end_ns == self.maturity_ns
                && self.mint_cutoff_ns.0 <= self.maturity_ns.0,
            "invalid window/cutoff"
        );
        for h in [
            &self.index_definition_hash,
            &self.oracle_config_hash,
            &self.finalization_policy_hash,
        ] {
            require!(
                h.len() == 64
                    && h.bytes()
                        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()),
                "invalid hash"
            );
        }
    }
}
pub fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 32
        && s.as_bytes()[0].is_ascii_lowercase()
        && s.as_bytes()[s.len() - 1].is_ascii_alphanumeric()
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
        && !s
            .as_bytes()
            .windows(2)
            .any(|w| (w[0] == b'-' || w[0] == b'_') && (w[1] == b'-' || w[1] == b'_'))
}
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum Asset {
    #[serde(rename = "COLLATERAL")]
    Collateral,
    P {
        series_id: String,
    },
    N {
        series_id: String,
    },
}
impl Asset {
    pub fn id(&self) -> String {
        match self {
            Self::Collateral => "COLLATERAL".into(),
            Self::P { series_id } => format!("P:{series_id}"),
            Self::N { series_id } => format!("N:{series_id}"),
        }
    }
}
#[near(serializers = [borsh, json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Resolution {
    pub config: SeriesConfig,
    pub state: String,
    pub price: Option<Amount>,
}

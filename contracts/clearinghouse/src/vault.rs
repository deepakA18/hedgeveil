use super::*;
use crate::rfq_types::Leg;
use near_sdk::serde_json::{json, Value};
use protocol_types::Asset;
use std::collections::BTreeSet;

#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Vault {
    pub vault_id: String,
    pub seed: Vec<Leg>,
    pub holdings: Vec<Leg>,
    pub initial_shares: Amount,
    pub supply: Amount,
    pub holders: BTreeMap<AccountId, Amount>,
    pub mint_paused: bool,
    pub closed: bool,
}

#[near]
impl Clearinghouse {
    #[payable]
    pub fn create_vault(&mut self, vault_id: String, seed: Vec<Leg>, initial_shares: Amount) {
        let before = self.ledgers();
        require!(
            self.network == "sandbox",
            "experimental vault is Sandbox only"
        );
        require!(
            env::predecessor_account_id() == self.guardian,
            "guardian only"
        );
        require!(self.vault.is_none(), "one immutable vault only");
        require!(protocol_types::valid_id(&vault_id), "invalid vault ID");
        require!(
            initial_shares.0 > 0 && initial_shares.0 <= MAX_SUPPLY,
            "share scale/cap"
        );
        require!((1..=9).contains(&seed.len()), "seed asset count");
        let mut assets = BTreeSet::new();
        let mut series = BTreeSet::new();
        for leg in &seed {
            require!(
                leg.amount.0 > 0 && leg.amount.0 <= MAX_SUPPLY && assets.insert(leg.asset.id()),
                "seed amount/duplicate"
            );
            if let Asset::P { series_id } | Asset::N { series_id } = &leg.asset {
                series.insert(series_id.clone());
            }
        }
        require!(
            !series.is_empty() && series.len() <= 4,
            "seed needs one to four series"
        );
        self.vault_inflows_open(&seed);
        require!(
            env::attached_deposit().as_yoctonear() == self.minimum_storage() + 1,
            "exact vault storage plus one yocto"
        );
        self.fees += 1;
        let holdings = seed
            .iter()
            .map(|l| Leg {
                asset: l.asset.clone(),
                amount: Amount(0),
            })
            .collect();
        self.vault = Some(Vault {
            vault_id,
            seed,
            holdings,
            initial_shares,
            supply: Amount(0),
            holders: BTreeMap::new(),
            mint_paused: false,
            closed: false,
        });
        self.finish("VAULT_CREATED", before, 1);
    }

    pub fn get_vault(&self) -> Option<Vault> {
        self.vault.clone()
    }

    pub fn vault_risk(&self) -> Value {
        json!({"profile":"basket-demo-v1","state":"ROLL_DEFERRED","reason":"POLICY_UNSELECTED","keeper_enabled":false,"nav":null,"storage_payment":Amount(self.minimum_storage()),"max_shares":Amount(MAX_SUPPLY)})
    }

    #[payable]
    pub fn set_vault_mint_pause(&mut self, paused: bool) {
        let before = self.ledgers();
        self.one_yocto();
        require!(
            env::predecessor_account_id() == self.guardian,
            "guardian only"
        );
        self.vault.as_mut().expect("no vault").mint_paused = paused;
        self.finish("VAULT_PAUSE_CHANGED", before, 1);
    }

    #[payable]
    pub fn vault_mint_basket(&mut self, vault_id: String, shares: Amount, max_inputs: Vec<Leg>) {
        let before = self.ledgers();
        self.one_yocto();
        let mut v = self.require_vault(&vault_id);
        require!(!v.closed && !v.mint_paused, "vault closed or mint paused");
        require!(shares.0 > 0, "positive shares required");
        let total = v.supply.0.checked_add(shares.0).expect("share overflow");
        require!(total <= MAX_SUPPLY, "share supply cap");
        self.vault_inflows_open(&v.seed);
        let inputs = if v.supply.0 == 0 {
            require!(
                shares == v.initial_shares,
                "exact bootstrap shares required"
            );
            v.seed.clone()
        } else {
            require!(
                v.holdings.iter().any(|l| payoff_math::mul_div_floor(
                    shares.0, l.amount.0, v.supply.0
                )
                .expect("math")
                    > 0),
                "useless dust mint"
            );
            v.holdings
                .iter()
                .map(|l| Leg {
                    asset: l.asset.clone(),
                    amount: Amount(
                        payoff_math::mul_div_ceil(shares.0, l.amount.0, v.supply.0).expect("math"),
                    ),
                })
                .collect()
        };
        check_limits(&inputs, &max_inputs, true);
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        for (holding, input) in v.holdings.iter_mut().zip(&inputs) {
            self.debit(&mut a, &input.asset, input.amount.0);
            holding.amount.0 = holding
                .amount
                .0
                .checked_add(input.amount.0)
                .expect("holding overflow");
        }
        v.holders.entry(who.clone()).or_insert(Amount(0)).0 += shares.0;
        v.supply = Amount(total);
        self.accounts.insert(who, a);
        self.vault = Some(v);
        self.finish("VAULT_MINTED", before, 1);
    }

    #[payable]
    pub fn vault_redeem_in_kind(
        &mut self,
        vault_id: String,
        shares: Amount,
        min_outputs: Vec<Leg>,
    ) {
        let before = self.ledgers();
        self.one_yocto();
        let mut v = self.require_vault(&vault_id);
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        let owned = v.holders.get(&who).copied().unwrap_or(Amount(0)).0;
        require!(shares.0 > 0 && shares.0 <= owned, "insufficient shares");
        let outputs: Vec<Leg> = v
            .holdings
            .iter()
            .map(|l| Leg {
                asset: l.asset.clone(),
                amount: Amount(if shares == v.supply {
                    l.amount.0
                } else {
                    payoff_math::mul_div_floor(shares.0, l.amount.0, v.supply.0).expect("math")
                }),
            })
            .collect();
        require!(outputs.iter().any(|l| l.amount.0 > 0), "useless dust exit");
        check_limits(&outputs, &min_outputs, false);
        for (holding, output) in v.holdings.iter_mut().zip(&outputs) {
            holding.amount.0 -= output.amount.0;
            self.credit_asset(&mut a, &output.asset, output.amount.0);
        }
        set_shares(&mut v, who.clone(), owned - shares.0);
        v.supply.0 -= shares.0;
        v.closed = v.supply.0 == 0;
        self.accounts.insert(who, a);
        self.vault = Some(v);
        self.finish("VAULT_EXITED", before, 1);
    }

    #[payable]
    pub fn transfer_vault_shares(&mut self, vault_id: String, shares: Amount, receiver: AccountId) {
        let before = self.ledgers();
        self.one_yocto();
        let who = env::predecessor_account_id();
        require!(who != receiver && shares.0 > 0, "self or zero transfer");
        self.account(&who);
        self.account(&receiver);
        let mut v = self.require_vault(&vault_id);
        let owned = v.holders.get(&who).copied().unwrap_or(Amount(0)).0;
        let left = owned.checked_sub(shares.0).expect("insufficient shares");
        set_shares(&mut v, who, left);
        v.holders.entry(receiver).or_insert(Amount(0)).0 += shares.0;
        self.vault = Some(v);
        self.finish("VAULT_SHARES_TRANSFERRED", before, 1);
    }
}

fn set_shares(v: &mut Vault, owner: AccountId, value: u128) {
    if value == 0 {
        v.holders.remove(&owner);
    } else {
        v.holders.insert(owner, Amount(value));
    }
}
fn check_limits(quantities: &[Leg], limits: &[Leg], input: bool) {
    require!(
        quantities.len() == limits.len(),
        "complete asset limits required"
    );
    let mut seen = BTreeSet::new();
    for limit in limits {
        require!(seen.insert(limit.asset.id()), "duplicate limit");
        let quantity = quantities
            .iter()
            .find(|l| l.asset == limit.asset)
            .expect("unexpected limit asset")
            .amount
            .0;
        require!(
            if input {
                quantity <= limit.amount.0
            } else {
                quantity >= limit.amount.0
            },
            "basket limit exceeded"
        );
    }
}
impl Clearinghouse {
    fn require_vault(&self, id: &str) -> Vault {
        let v = self.vault.as_ref().expect("no vault");
        require!(v.vault_id == id, "wrong vault ID");
        v.clone()
    }
    fn vault_inflows_open(&self, legs: &[Leg]) {
        for l in legs {
            if let Asset::P { series_id } | Asset::N { series_id } = &l.asset {
                let s = self.series.get(series_id).expect("unknown series");
                require!(
                    !s.closed
                        && s.final_price.is_none()
                        && env::block_timestamp() < s.config.maturity_ns.0,
                    "matured vault inflows disabled"
                );
            }
        }
    }
    pub(crate) fn vault_amount(&self, asset: &Asset) -> u128 {
        self.vault
            .as_ref()
            .and_then(|v| v.holdings.iter().find(|l| &l.asset == asset))
            .map_or(0, |l| l.amount.0)
    }
    pub(crate) fn vault_storage(&self) -> u128 {
        if self.vault.is_some() {
            self.minimum_storage()
        } else {
            0
        }
    }
}

use super::*;
use near_sdk::serde_json::{json, Value};
use protocol_types::Asset;
pub type Snapshot = BTreeMap<(String, String, String, String), u128>;
impl Clearinghouse {
    pub(crate) fn ledgers(&self) -> Snapshot {
        let mut out = BTreeMap::new();
        let mut put = |owner: &AccountId, bucket: &str, id: &str, asset: &str, amount: u128| {
            if amount > 0 {
                out.insert(
                    (owner.to_string(), bucket.into(), id.into(), asset.into()),
                    amount,
                );
            }
        };
        let core = env::current_account_id();
        for (id, a) in &self.accounts {
            put(id, "FREE", "account", "COLLATERAL", a.free.0);
            put(id, "STORAGE", "account", "COLLATERAL", a.storage_paid.0);
            for s in self.series.values() {
                let pos = a.positions[s.slot as usize];
                put(
                    id,
                    "FREE",
                    &s.config.series_id,
                    &format!("P:{}", s.config.series_id),
                    pos.p.0,
                );
                put(
                    id,
                    "FREE",
                    &s.config.series_id,
                    &format!("N:{}", s.config.series_id),
                    pos.n.0,
                );
            }
        }
        put(&core, "STORAGE", "roll", "COLLATERAL", self.roll_storage());
        if let Some(v) = &self.vault {
            put(
                &core,
                "STORAGE",
                "vault",
                "COLLATERAL",
                self.vault_storage(),
            );
            for leg in &v.holdings {
                put(&core, "VAULT", &v.vault_id, &leg.asset.id(), leg.amount.0);
            }
            for (owner, shares) in &v.holders {
                put(
                    owner,
                    "FREE",
                    &v.vault_id,
                    &format!("VAULT_SHARE:{}", v.vault_id),
                    shares.0,
                );
            }
            put(
                &core,
                "SUPPLY",
                &v.vault_id,
                &format!("VAULT_SHARE:{}", v.vault_id),
                v.supply.0,
            );
        }
        for (id, s) in &self.series {
            put(&core, "SERIES_RESERVE", id, "COLLATERAL", s.reserve.0);
            put(&core, "SUPPLY", id, &format!("P:{id}"), s.outstanding_p.0);
            put(&core, "SUPPLY", id, &format!("N:{id}"), s.outstanding_n.0);
        }
        put(
            &core,
            "STORAGE",
            "series",
            "COLLATERAL",
            self.series_storage,
        );
        put(&core, "FEE", "protocol", "COLLATERAL", self.fees);
        put(
            &core,
            "STORAGE",
            "market",
            "COLLATERAL",
            self.market_storage,
        );
        put(&core, "OPERATING", "bootstrap", "COLLATERAL", OPERATING);
        for t in self
            .tickets
            .values()
            .filter(|t| matches!(t.state, TicketState::Pending | TicketState::Unknown))
        {
            put(
                &t.owner,
                "WITHDRAWAL",
                &format!("w-{}", t.id.0),
                "COLLATERAL",
                t.amount.0,
            );
        }
        out
    }
    pub(crate) fn finish(&mut self, event: &str, before: Snapshot, fee: u128) {
        self.assert_invariants();
        self.operation = self.operation.checked_add(1).expect("operation overflow");
        let after = self.ledgers();
        // Both snapshots are ordered. Merge once without cloning every key into
        // a third tree; callback work remains linear in the bounded ledger.
        let mut before = before.into_iter().peekable();
        let mut after = after.into_iter().peekable();
        let mut deltas: Vec<Value> = Vec::new();
        while before.peek().is_some() || after.peek().is_some() {
            let order = match (before.peek(), after.peek()) {
                (Some((a, _)), Some((b, _))) => a.cmp(b),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => unreachable!(),
            };
            let (k, old, new) = match order {
                std::cmp::Ordering::Less => {
                    let (k, old) = before.next().expect("before");
                    (k, old, 0)
                }
                std::cmp::Ordering::Greater => {
                    let (k, new) = after.next().expect("after");
                    (k, 0, new)
                }
                std::cmp::Ordering::Equal => {
                    let (k, old) = before.next().expect("before");
                    let (_, new) = after.next().expect("after");
                    (k, old, new)
                }
            };
            if old == new {
                continue;
            }
            let asset = if let Some(id) = k.3.strip_prefix("VAULT_SHARE:") {
                json!({"kind":"VAULT_SHARE","vault_id":id})
            } else {
                let a = if k.3 == "COLLATERAL" {
                    Asset::Collateral
                } else {
                    let (leg, id) = k.3.split_once(':').expect("asset ID");
                    if leg == "P" {
                        Asset::P {
                            series_id: id.into(),
                        }
                    } else {
                        Asset::N {
                            series_id: id.into(),
                        }
                    }
                };
                json!(a)
            };
            deltas.push(json!({"account_id":k.0,"bucket":k.1,"ledger_id":k.2,"asset":asset,"direction":if new>old {"CREDIT"} else {"DEBIT"},"amount":Amount(new.abs_diff(old))}));
        }
        require!(deltas.len() <= 32, "event delta bound");
        let op =
            near_sdk::borsh::to_vec(&(&self.network, env::current_account_id(), self.operation))
                .expect("operation encoding");
        let state = near_sdk::borsh::to_vec(self).expect("state encoding");
        let record = json!({"kind":"event","schema_version":"0.2.0","domain":{"protocol_version":"1","network":self.network,"contract_id":env::current_account_id()},
            "operation_id":hex(&env::sha256(&op)),"actor":env::predecessor_account_id(),"event":event,"deltas":deltas,"fee_amount":Amount(fee),"state_references":[hex(&env::sha256(&state))]});
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({"standard":"hedgeveil","version":"0.2.0","event":"ledger","data":[record]})
        ));
    }
    fn assert_invariants(&self) {
        if let Some(r) = &self.vault_roll {
            require!(
                self.vault.is_some()
                    && self.network == "sandbox"
                    && r.fees_spent.0 <= r.policy.total_fee_budget.0
                    && r.marked_loss_spent.0 <= r.policy.total_loss_budget.0,
                "roll budget invariant"
            );
        }
        if let Some(v) = &self.vault {
            require!(
                v.holders.values().map(|s| s.0).sum::<u128>() == v.supply.0
                    && v.supply.0 <= MAX_SUPPLY,
                "share conservation"
            );
            require!(
                v.holders
                    .keys()
                    .all(|id| self.accounts.get(id).is_some_and(|a| !a.closing)),
                "share holder registration"
            );
            require!(
                v.supply.0 != 0 || v.holdings.iter().all(|l| l.amount.0 == 0),
                "unowned vault assets"
            );
            require!(!v.closed || v.supply.0 == 0, "closed vault supply");
        }
        require!(
            self.markets.len() <= MAX_ACCOUNTS
                && self.market_storage == self.markets.len() as u128 * self.minimum_storage(),
            "market storage invariant"
        );
        for maker in self.markets.values() {
            require!(
                maker.keys.len() <= 4
                    && maker
                        .consumed
                        .iter()
                        .zip(maker.cancelled.iter())
                        .all(|(a, b)| a & b == 0),
                "market replay invariant"
            );
        }
        require!(
            self.accounts.len() <= MAX_ACCOUNTS && self.series.len() <= MAX_SERIES,
            "state bound"
        );
        require!(
            self.series_storage
                == (self.series.len() as u128 + self.archived_series.len() as u128)
                    * self.minimum_storage(),
            "series storage invariant"
        );
        let slots: std::collections::BTreeSet<_> = self.series.values().map(|s| s.slot).collect();
        require!(
            slots.len() == self.series.len() && slots.iter().all(|s| (*s as usize) < MAX_SERIES),
            "series slot invariant"
        );
        require!(
            self.accounts.values().all(|a| a
                .positions
                .iter()
                .enumerate()
                .all(|(i, p)| slots.contains(&(i as u8)) || (p.p.0 == 0 && p.n.0 == 0))),
            "orphan account claims"
        );
        let free: u128 = self.accounts.values().map(|a| a.free.0).sum();
        let reserve: u128 = self.series.values().map(|s| s.reserve.0).sum();
        let pending: u128 = self
            .tickets
            .values()
            .filter(|t| {
                t.kind == TicketKind::Collateral
                    && matches!(t.state, TicketState::Pending | TicketState::Unknown)
            })
            .map(|t| t.amount.0)
            .sum();
        require!(
            free + self.vault_amount(&Asset::Collateral) + reserve + pending == self.collateral
                && self.collateral <= MAX_COLLATERAL,
            "collateral conservation"
        );
        for s in self.series.values() {
            let slot = s.slot as usize;
            require!(
                self.accounts
                    .values()
                    .map(|a| a.positions[slot].p.0)
                    .sum::<u128>()
                    + self.vault_amount(&Asset::P {
                        series_id: s.config.series_id.clone()
                    })
                    == s.outstanding_p.0,
                "P supply mismatch"
            );
            require!(
                self.accounts
                    .values()
                    .map(|a| a.positions[slot].n.0)
                    .sum::<u128>()
                    + self.vault_amount(&Asset::N {
                        series_id: s.config.series_id.clone()
                    })
                    == s.outstanding_n.0,
                "N supply mismatch"
            );
            require!(
                s.total_split.0 - s.total_merged.0
                    == s.reserve.0 + s.total_paid.0 + s.dust_released.0,
                "series conservation"
            );
            if s.final_price.is_some() {
                require!(
                    s.p_coefficient.0 + s.n_coefficient.0 == payoff_math::Q,
                    "complementarity"
                );
                let remaining = payoff_math::redeem(s.outstanding_p.0, s.p_coefficient.0)
                    .expect("math")
                    .payout
                    + payoff_math::redeem(s.outstanding_n.0, s.n_coefficient.0)
                        .expect("math")
                        .payout;
                require!(remaining <= s.reserve.0, "underbacked series");
            } else {
                require!(
                    s.outstanding_p == s.outstanding_n && s.reserve == s.outstanding_p,
                    "unfinalized backing"
                );
            }
        }
        for (id, a) in &self.accounts {
            require!(
                a.retained_tickets as usize
                    == self.tickets.values().filter(|t| &t.owner == id).count()
                    && a.retained_tickets <= MAX_TICKETS_PER_ACCOUNT,
                "ticket accounting"
            );
            require!(
                a.closing || a.storage_paid.0 >= self.minimum_storage(),
                "unfunded account storage"
            );
        }
        let bytes = near_sdk::borsh::to_vec(self).expect("encode").len() as u128;
        require!(
            bytes
                <= STORAGE_BYTES
                    * (1 + self.accounts.len() as u128
                        + self.series.len() as u128
                        + self.markets.len() as u128
                        + u128::from(self.vault.is_some())
                        + u128::from(self.vault_roll.is_some())),
            "storage allowance exceeded"
        );
        require!(
            (env::storage_usage() as u128 + bytes) * self.storage_byte_cost
                <= OPERATING
                    + self.series_storage
                    + self.market_storage
                    + self.vault_storage()
                    + self.roll_storage()
                    + self.accounts.len() as u128 * self.minimum_storage(),
            "storage not separately funded"
        );
    }
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

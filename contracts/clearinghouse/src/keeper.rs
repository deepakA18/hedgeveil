use super::*;
use crate::rfq_types::{bytes, Leg, Quote};
use near_sdk::serde_json::{json, Value};
use protocol_types::Asset;
use std::collections::BTreeSet;

#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct RollPolicy {
    pub version: String,
    pub keeper: AccountId,
    pub reference_publisher: AccountId,
    pub fee_receiver: AccountId,
    pub old_series_id: String,
    pub new_series_id: String,
    pub not_before_ns: Num64,
    pub deadline_ns: Num64,
    pub min_remaining_ns: Num64,
    pub max_remaining_ns: Num64,
    pub max_reference_age_ns: Num64,
    pub quote_horizon_ns: Num64,
    pub max_notional: Amount,
    pub max_cash_input: Amount,
    pub max_fee: Amount,
    pub total_fee_budget: Amount,
    pub max_loss_bps: u16,
    pub total_loss_budget: Amount,
    pub min_receive: Amount,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct CurrentReference {
    pub sequence: Num64,
    pub observed_ns: Num64,
    pub old_price: Amount,
    pub new_price: Amount,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct RollState {
    pub policy: RollPolicy,
    pub reference: Option<CurrentReference>,
    pub deferred_reason: Option<String>,
    pub executed: bool,
    pub fees_spent: Amount,
    pub marked_loss_spent: Amount,
}
#[near]
impl Clearinghouse {
    #[payable]
    pub fn configure_vault_roll(&mut self, policy: RollPolicy) {
        let before = self.ledgers();
        require!(
            self.network == "sandbox" && env::predecessor_account_id() == self.guardian,
            "Sandbox guardian only"
        );
        let v = self.vault.as_ref().expect("no vault");
        require!(
            v.supply.0 == 0 && !v.closed && self.vault_roll.is_none(),
            "configure once before bootstrap"
        );
        require!(
            policy.version == "roll-demo-v1" && policy.keeper != policy.reference_publisher,
            "profile/role separation"
        );
        require!(
            policy.old_series_id != policy.new_series_id,
            "distinct series required"
        );
        let old = self.series.get(&policy.old_series_id).expect("old series");
        let new = self.series.get(&policy.new_series_id).expect("new series");
        require!(
            old.final_price.is_none()
                && new.final_price.is_none()
                && old.config.index_definition_hash == new.config.index_definition_hash
                && new.config.maturity_ns.0 > old.config.maturity_ns.0,
            "series identity/maturity"
        );
        require!(
            v.seed.iter().any(|l| l.asset
                == Asset::P {
                    series_id: policy.old_series_id.clone()
                }),
            "seed must hold old P"
        );
        require!(
            policy.not_before_ns.0 < policy.deadline_ns.0
                && policy.deadline_ns.0 <= old.config.maturity_ns.0
                && policy.deadline_ns.0 > env::block_timestamp(),
            "schedule bounds"
        );
        require!(
            policy.min_remaining_ns.0 > 0
                && policy.min_remaining_ns.0 <= policy.max_remaining_ns.0
                && policy.max_remaining_ns.0 <= 31_536_000_000_000_000,
            "new maturity bounds"
        );
        require!(
            (1..=60_000_000_000).contains(&policy.max_reference_age_ns.0)
                && (1..=30_000_000_000).contains(&policy.quote_horizon_ns.0),
            "freshness bounds"
        );
        require!(
            policy.max_notional.0 > 0
                && policy.max_notional.0 <= 10 * payoff_math::Q
                && policy.max_cash_input.0 <= payoff_math::Q
                && policy.max_fee.0 <= payoff_math::Q / 100
                && policy.total_fee_budget.0 <= payoff_math::Q / 10
                && policy.max_loss_bps <= 1000
                && policy.total_loss_budget.0 <= payoff_math::Q
                && policy.min_receive.0 > 0
                && policy.min_receive.0 <= MAX_SUPPLY,
            "budget bounds"
        );
        self.account(&policy.fee_receiver);
        require!(
            env::attached_deposit().as_yoctonear() == self.minimum_storage() + 1,
            "exact roll storage plus one yocto"
        );
        self.fees += 1;
        self.vault_roll = Some(RollState {
            policy,
            reference: None,
            deferred_reason: Some("REFERENCE_UNAVAILABLE".into()),
            executed: false,
            fees_spent: Amount(0),
            marked_loss_spent: Amount(0),
        });
        self.finish("VAULT_POLICY_CONFIGURED", before, 1);
    }
    pub fn get_vault_roll(&self) -> Option<RollState> {
        self.vault_roll.clone()
    }
    #[payable]
    pub fn publish_vault_reference(&mut self, reference: CurrentReference) {
        let before = self.ledgers();
        self.one_yocto();
        let r = self.vault_roll.as_mut().expect("no roll policy");
        require!(
            env::predecessor_account_id() == r.policy.reference_publisher,
            "reference publisher only"
        );
        let now = env::block_timestamp();
        require!(
            reference.sequence.0 > 0
                && reference.observed_ns.0 <= now
                && now - reference.observed_ns.0 <= r.policy.max_reference_age_ns.0,
            "reference age"
        );
        require!(
            reference.old_price.0 > 0
                && reference.old_price.0 <= payoff_math::Q
                && reference.new_price.0 > 0
                && reference.new_price.0 <= payoff_math::Q,
            "reference prices"
        );
        if let Some(previous) = &r.reference {
            require!(
                reference.sequence.0 > previous.sequence.0
                    && reference.observed_ns.0 > previous.observed_ns.0,
                "reference replay/equivocation"
            );
        }
        if r.reference.is_none() && r.deferred_reason.as_deref() == Some("REFERENCE_UNAVAILABLE") {
            r.deferred_reason = None;
        }
        r.reference = Some(reference);
        self.finish("VAULT_REFERENCE_PUBLISHED", before, 1);
    }
    #[payable]
    pub fn execute_vault_roll(&mut self, quote: Option<Quote>, reference_sequence: Num64) -> Value {
        let before = self.ledgers();
        self.one_yocto();
        let mut r = self.vault_roll.clone().expect("no roll policy");
        require!(
            env::predecessor_account_id() == r.policy.keeper,
            "keeper only"
        );
        let mut v = self.vault.clone().expect("no vault");
        let fail = |this: &mut Self, reason: &str| {
            this.vault_roll.as_mut().expect("policy").deferred_reason = Some(reason.into());
            this.finish("ROLL_DEFERRED", before.clone(), 1);
            json!({"state":"ROLL_DEFERRED","reason":reason})
        };
        require!(!v.closed && v.supply.0 > 0, "empty vault");
        if r.executed {
            return fail(self, "POLICY_EXHAUSTED");
        }
        if self.market_paused {
            return fail(self, "MARKET_PAUSED");
        }
        let now = env::block_timestamp();
        if now < r.policy.not_before_ns.0 || now >= r.policy.deadline_ns.0 {
            return fail(self, "ROLL_WINDOW");
        }
        let Some(reference) = &r.reference else {
            return fail(self, "REFERENCE_UNAVAILABLE");
        };
        if reference_sequence != reference.sequence {
            return fail(self, "REFERENCE_SEQUENCE");
        }
        if now < reference.observed_ns.0
            || now - reference.observed_ns.0 > r.policy.max_reference_age_ns.0
        {
            return fail(self, "STALE_REFERENCE");
        }
        let Some(q) = quote else {
            return fail(self, "NO_QUOTE");
        };
        let old_asset = Asset::P {
            series_id: r.policy.old_series_id.clone(),
        };
        let new_asset = Asset::P {
            series_id: r.policy.new_series_id.clone(),
        };
        let old_amount = self.vault_amount(&old_asset);
        if q.kind != "quote"
            || q.schema_version != "0.2.0"
            || q.fill_rule != "ALL_OR_NOTHING"
            || q.rounding != "EXACT_AMOUNTS"
            || q.signature_scheme != "ed25519"
            || q.taker.as_ref() != Some(&env::current_account_id())
            || q.maker_gives.len() != 1
            || !(1..=2).contains(&q.taker_gives.len())
            || q.maker_gives[0].asset != new_asset
            || q.maker_gives[0].amount.0 == 0
            || q.taker_gives[0].asset != old_asset
            || old_amount == 0
            || q.taker_gives[0].amount.0 != old_amount
        {
            return fail(self, "QUOTE_SHAPE");
        }
        let cash = if q.taker_gives.len() == 2 {
            if q.taker_gives[1].asset != Asset::Collateral || q.taker_gives[1].amount.0 == 0 {
                return fail(self, "QUOTE_SHAPE");
            }
            q.taker_gives[1].amount.0
        } else {
            0
        };
        if q.expiry_ns.0 <= now
            || q.expiry_ns.0
                > reference
                    .observed_ns
                    .0
                    .saturating_add(r.policy.quote_horizon_ns.0)
        {
            return fail(self, "QUOTE_HORIZON");
        }
        let old = self
            .series
            .get(&r.policy.old_series_id)
            .expect("old series");
        let new = self
            .series
            .get(&r.policy.new_series_id)
            .expect("new series");
        if old.closed
            || new.closed
            || old.final_price.is_some()
            || new.final_price.is_some()
            || now >= old.config.maturity_ns.0
            || now >= new.config.maturity_ns.0
            || new.config.maturity_ns.0 - now < r.policy.min_remaining_ns.0
            || new.config.maturity_ns.0 - now > r.policy.max_remaining_ns.0
        {
            return fail(self, "SERIES_MATURITY");
        }
        let received = q.maker_gives[0].amount.0;
        if received < r.policy.min_receive.0 || cash > r.policy.max_cash_input.0 {
            return fail(self, "ALLOCATION_LIMIT");
        }
        if q.fee.asset != "NATIVE_NEAR"
            || q.fee.receiver != r.policy.fee_receiver
            || q.fee.amount.0 > r.policy.max_fee.0
            || r.fees_spent
                .0
                .checked_add(q.fee.amount.0)
                .is_none_or(|n| n > r.policy.total_fee_budget.0)
        {
            return fail(self, "FEE_BUDGET");
        }
        let input = payoff_math::mul_div_ceil(old_amount, reference.old_price.0, payoff_math::Q)
            .expect("math")
            .checked_add(cash)
            .and_then(|n| n.checked_add(q.fee.amount.0))
            .expect("value overflow");
        let output = payoff_math::mul_div_floor(received, reference.new_price.0, payoff_math::Q)
            .expect("math");
        if input > r.policy.max_notional.0 || output > r.policy.max_notional.0 {
            return fail(self, "NOTIONAL_LIMIT");
        }
        let loss = input.saturating_sub(output);
        if loss
            > payoff_math::mul_div_floor(input, u128::from(r.policy.max_loss_bps), 10000)
                .expect("math")
            || r.marked_loss_spent
                .0
                .checked_add(loss)
                .is_none_or(|n| n > r.policy.total_loss_budget.0)
        {
            return fail(self, "LOSS_BUDGET");
        }
        let Some(maker) = self.accounts.get(&q.maker) else {
            return fail(self, "MAKER_UNAVAILABLE");
        };
        if maker.closing || maker.positions[new.slot as usize].p.0 < received {
            return fail(self, "MAKER_INVENTORY");
        }
        if self.accounts.get(&q.fee.receiver).is_none_or(|a| a.closing) {
            return fail(self, "FEE_RECEIVER_UNAVAILABLE");
        }
        let cash_debit = cash.checked_add(q.fee.amount.0).expect("cash overflow");
        if self.vault_amount(&Asset::Collateral) < cash_debit {
            return fail(self, "VAULT_CASH");
        }
        let payload = bytes(b"HEDGEVEIL:RFQ:1\0", &q);
        self.authorize_quote(
            &env::current_account_id(),
            &q.domain,
            &q.maker,
            &q.taker,
            q.nonce,
            q.cancellation_epoch,
            q.expiry_ns,
            &q.signing_key_id,
            &q.signature,
            &payload,
        );
        let mut maker = self.account(&q.maker);
        self.debit(&mut maker, &new_asset, received);
        // Clone mutations remain private until every holding/cap check has passed.
        for l in &mut v.holdings {
            if l.asset == old_asset {
                l.amount = Amount(0);
            }
            if l.asset == Asset::Collateral {
                l.amount.0 -= cash_debit;
            }
        }
        v.holdings.retain(|l| l.amount.0 > 0);
        if let Some(l) = v.holdings.iter_mut().find(|l| l.asset == new_asset) {
            l.amount.0 = l.amount.0.checked_add(received).expect("holding overflow");
        } else {
            v.holdings.push(Leg {
                asset: new_asset,
                amount: Amount(received),
            });
        }
        let held_series: BTreeSet<_> = v
            .holdings
            .iter()
            .filter_map(|l| match &l.asset {
                Asset::P { series_id } | Asset::N { series_id } => Some(series_id),
                _ => None,
            })
            .collect();
        if held_series.len() > 4 {
            return fail(self, "SERIES_LIMIT");
        }
        self.credit_asset(&mut maker, &old_asset, old_amount);
        self.credit_asset(&mut maker, &Asset::Collateral, cash);
        self.accounts.insert(q.maker.clone(), maker);
        self.pay_fee(&q.fee);
        self.consume(&q.maker, q.nonce);
        r.executed = true;
        r.deferred_reason = None;
        r.fees_spent.0 += q.fee.amount.0;
        r.marked_loss_spent.0 += loss;
        self.vault = Some(v);
        self.vault_roll = Some(r);
        self.finish("ROLL_EXECUTED", before, q.fee.amount.0 + 1);
        self.fill_event(
            "VAULT_ROLL",
            &q.maker,
            &env::current_account_id(),
            q.nonce,
            q.cancellation_epoch,
            &payload,
        );
        let result = json!({"state":"EXECUTED","reference_sequence":reference_sequence,"old_amount":Amount(old_amount),"new_amount":Amount(received),"cash_input":Amount(cash),"fee":q.fee.amount,"reference_input_value":Amount(input),"reference_output_value":Amount(output),"marked_native_loss":Amount(loss)});
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({"standard":"hedgeveil_vault_roll","version":"1.0.0","event":"executed","data":[result.clone()]})
        ));
        result
    }
}
impl Clearinghouse {
    pub(crate) fn roll_storage(&self) -> u128 {
        if self.vault_roll.is_some() {
            self.minimum_storage()
        } else {
            0
        }
    }
    pub(crate) fn roll_inflow_reason(&self) -> Option<&str> {
        let r = self.vault_roll.as_ref()?;
        if self.vault.as_ref().is_some_and(|v| v.closed) {
            return Some("VAULT_CLOSED");
        }
        if let Some(reason) = r.deferred_reason.as_deref() {
            return Some(reason);
        }
        let Some(reference) = &r.reference else {
            return Some("REFERENCE_UNAVAILABLE");
        };
        let now = env::block_timestamp();
        if now < reference.observed_ns.0
            || now - reference.observed_ns.0 > r.policy.max_reference_age_ns.0
        {
            return Some("STALE_REFERENCE");
        }
        if !r.executed && now >= r.policy.deadline_ns.0 {
            return Some("ROLL_WINDOW");
        }
        None
    }
}

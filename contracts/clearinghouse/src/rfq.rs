use super::*;
use crate::rfq_types::*;
use near_sdk::serde_json::{json, Value};
use protocol_types::Asset;
#[near]
impl Clearinghouse {
    #[payable]
    pub fn register_signing_key(&mut self, key_id: String, public_key: String) {
        let before = self.ledgers();
        let who = env::predecessor_account_id();
        self.account(&who);
        require!(protocol_types::valid_id(&key_id), "invalid key ID");
        decode::<32>(&public_key);
        let first = !self.markets.contains_key(&who);
        require!(
            !first || self.markets.len() < MAX_ACCOUNTS,
            "lifetime maker cap"
        );
        let cost = if first { self.minimum_storage() } else { 0 };
        require!(
            env::attached_deposit().as_yoctonear() == cost + 1,
            "exact market storage plus one yocto"
        );
        self.fees += 1;
        self.market_storage += cost;
        let m = self.markets.entry(who).or_default();
        require!(
            m.keys.len() < 4 && !m.keys.contains_key(&key_id),
            "lifetime key cap or reused ID"
        );
        m.keys.insert(
            key_id,
            SigningKey {
                public_key,
                revoked: false,
            },
        );
        self.finish("SIGNING_KEY_REGISTERED", before, 1);
    }
    #[payable]
    pub fn revoke_signing_key(&mut self, key_id: String) {
        let before = self.ledgers();
        self.one_yocto();
        let who = env::predecessor_account_id();
        self.account(&who);
        self.markets
            .get_mut(&who)
            .expect("maker not registered")
            .keys
            .get_mut(&key_id)
            .expect("unknown key")
            .revoked = true;
        self.finish("SIGNING_KEY_REVOKED", before, 1);
    }
    #[payable]
    pub fn cancel_quote(&mut self, nonce: Num64) {
        let before = self.ledgers();
        self.one_yocto();
        let who = env::predecessor_account_id();
        self.account(&who);
        let m = self.markets.get_mut(&who).expect("maker not registered");
        require!(!m.unavailable(nonce.0), "nonce unavailable");
        m.cancelled[nonce.0 as usize / 8] |= 1 << (nonce.0 % 8);
        self.finish("QUOTE_CANCELLED", before, 1);
    }
    #[payable]
    pub fn advance_quote_epoch(&mut self, epoch: Num64) {
        let before = self.ledgers();
        self.one_yocto();
        let who = env::predecessor_account_id();
        self.account(&who);
        let m = self.markets.get_mut(&who).expect("maker not registered");
        require!(epoch.0 > m.epoch.0, "epoch must increase");
        m.invalidate(epoch.0);
        self.finish("QUOTE_EPOCH_ADVANCED", before, 1);
    }
    #[payable]
    pub fn set_market_pause(&mut self, paused: bool) {
        let before = self.ledgers();
        self.one_yocto();
        require!(
            env::predecessor_account_id() == self.guardian,
            "guardian only"
        );
        self.market_paused = paused;
        self.finish("MARKET_PAUSE_CHANGED", before, 1);
    }
    pub fn get_market(&self, maker: AccountId) -> Option<MakerState> {
        self.markets.get(&maker).cloned()
    }
    pub fn market_config(&self) -> Value {
        json!({"paused":self.market_paused,"registration_storage":Amount(self.minimum_storage()),"max_keys":4,"nonces_per_epoch":256,"max_legs_per_side":4,"max_fee":Amount(payoff_math::Q/100),"max_expiry_ahead_ns":Num64(300_000_000_000),"market_storage":Amount(self.market_storage)})
    }
    pub fn quote_digest(&self, quote: Quote) -> String {
        hex(&env::sha256(bytes(b"HEDGEVEIL:RFQ:1\0", &quote)))
    }
    pub fn pair_quote_digest(&self, quote: PairQuote) -> String {
        hex(&env::sha256(bytes(b"HEDGEVEIL:PAIR:1\0", &quote)))
    }
    #[payable]
    pub fn fill_quote(&mut self, quote: Quote) {
        let before = self.ledgers();
        self.one_yocto();
        require!(!self.market_paused, "market paused");
        require!(
            quote.kind == "quote"
                && quote.schema_version == "0.2.0"
                && quote.fill_rule == "ALL_OR_NOTHING"
                && quote.rounding == "EXACT_AMOUNTS"
                && quote.signature_scheme == "ed25519",
            "unsupported quote"
        );
        let payload = bytes(b"HEDGEVEIL:RFQ:1\0", &quote);
        self.authorize_quote(
            &env::predecessor_account_id(),
            &quote.domain,
            &quote.maker,
            &quote.taker,
            quote.nonce,
            quote.cancellation_epoch,
            quote.expiry_ns,
            &quote.signing_key_id,
            &quote.signature,
            &payload,
        );
        let taker = env::predecessor_account_id();
        let mut m = self.account(&quote.maker);
        let mut t = self.account(&taker);
        self.check_fee(&quote.fee);
        require!(
            (1..=4).contains(&quote.maker_gives.len())
                && (1..=4).contains(&quote.taker_gives.len()),
            "leg count"
        );
        let mut ids = std::collections::BTreeSet::new();
        for leg in quote.maker_gives.iter().chain(quote.taker_gives.iter()) {
            require!(
                leg.amount.0 > 0 && ids.insert(leg.asset.id()),
                "zero or duplicate asset"
            );
            self.trade_asset(&leg.asset);
        }
        // Debit every outgoing balance before granting either party its incoming leg.
        for leg in &quote.maker_gives {
            self.debit(&mut m, &leg.asset, leg.amount.0);
        }
        for leg in &quote.taker_gives {
            self.debit(&mut t, &leg.asset, leg.amount.0);
        }
        t.free.0 = t
            .free
            .0
            .checked_sub(quote.fee.amount.0)
            .expect("insufficient fee funding");
        for leg in &quote.maker_gives {
            self.credit_asset(&mut t, &leg.asset, leg.amount.0);
        }
        for leg in &quote.taker_gives {
            self.credit_asset(&mut m, &leg.asset, leg.amount.0);
        }
        self.accounts.insert(quote.maker.clone(), m);
        self.accounts.insert(taker.clone(), t);
        self.pay_fee(&quote.fee);
        self.consume(&quote.maker, quote.nonce);
        self.finish("QUOTE_FILLED", before, quote.fee.amount.0 + 1);
        self.fill_event(
            "EXCHANGE",
            &quote.maker,
            &taker,
            quote.nonce,
            quote.cancellation_epoch,
            &payload,
        );
    }
    #[payable]
    pub fn match_pair(&mut self, quote: PairQuote) {
        let before = self.ledgers();
        self.one_yocto();
        require!(
            !self.market_paused && !self.pauses.splits,
            "market or split paused"
        );
        require!(
            quote.kind == "pair_quote"
                && quote.schema_version == "0.2.0"
                && quote.fill_rule == "ALL_OR_NOTHING"
                && quote.rounding == "EXACT_AMOUNTS"
                && quote.signature_scheme == "ed25519",
            "unsupported pair quote"
        );
        let payload = bytes(b"HEDGEVEIL:PAIR:1\0", &quote);
        self.authorize_quote(
            &env::predecessor_account_id(),
            &quote.domain,
            &quote.maker,
            &quote.taker,
            quote.nonce,
            quote.cancellation_epoch,
            quote.expiry_ns,
            &quote.signing_key_id,
            &quote.signature,
            &payload,
        );
        self.check_fee(&quote.fee);
        require!(
            quote.pair_amount.0 > quote.maker_collateral.0
                && quote.maker_collateral.0 > 0
                && (quote.maker_leg == "P" || quote.maker_leg == "N"),
            "invalid pair contributions"
        );
        let mut s = self
            .series
            .get(&quote.series_id)
            .expect("unknown series")
            .clone();
        require!(
            s.final_price.is_none() && env::block_timestamp() < s.config.mint_cutoff_ns.0,
            "mint cutoff"
        );
        let amount = quote.pair_amount.0;
        require!(
            s.outstanding_p.0.checked_add(amount).expect("overflow") <= s.config.max_supply.0,
            "supply cap"
        );
        let taker = env::predecessor_account_id();
        let mut m = self.account(&quote.maker);
        let mut t = self.account(&taker);
        m.free.0 = m
            .free
            .0
            .checked_sub(quote.maker_collateral.0)
            .expect("maker contribution unfunded");
        t.free.0 = t
            .free
            .0
            .checked_sub(amount - quote.maker_collateral.0)
            .and_then(|x| x.checked_sub(quote.fee.amount.0))
            .expect("taker contribution/fee unfunded");
        let slot = s.slot as usize;
        if quote.maker_leg == "P" {
            m.positions[slot].p.0 += amount;
            t.positions[slot].n.0 += amount;
        } else {
            m.positions[slot].n.0 += amount;
            t.positions[slot].p.0 += amount;
        }
        s.outstanding_p.0 += amount;
        s.outstanding_n.0 += amount;
        s.reserve.0 += amount;
        s.total_split.0 += amount;
        self.accounts.insert(quote.maker.clone(), m);
        self.accounts.insert(taker.clone(), t);
        self.series.insert(quote.series_id.clone(), s);
        self.pay_fee(&quote.fee);
        self.consume(&quote.maker, quote.nonce);
        self.finish("PAIR_MATCHED", before, quote.fee.amount.0 + 1);
        self.fill_event(
            "MINT_PAIR",
            &quote.maker,
            &taker,
            quote.nonce,
            quote.cancellation_epoch,
            &payload,
        );
    }
}
impl Clearinghouse {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn authorize_quote(
        &self,
        caller: &AccountId,
        domain: &Domain,
        maker: &AccountId,
        taker: &Option<AccountId>,
        nonce: Num64,
        epoch: Num64,
        expiry: Num64,
        key: &str,
        signature: &str,
        payload: &[u8],
    ) {
        require!(
            domain.protocol_version == "1"
                && domain.network == self.network
                && domain.contract_id == env::current_account_id(),
            "wrong domain"
        );
        require!(
            caller != maker && taker.as_ref().is_none_or(|a| a == caller),
            "wrong taker"
        );
        let now = env::block_timestamp();
        require!(
            expiry.0 > now && expiry.0 - now <= 300_000_000_000,
            "expiry out of bounds"
        );
        let m = self.markets.get(maker).expect("maker registry missing");
        require!(
            epoch == m.epoch && !m.unavailable(nonce.0),
            "epoch or nonce unavailable"
        );
        let k = m.keys.get(key).expect("unknown signing key");
        require!(!k.revoked, "signing key revoked");
        require!(
            env::ed25519_verify(
                &decode::<64>(signature),
                payload,
                &decode::<32>(&k.public_key)
            ),
            "invalid RFQ signature"
        );
    }
    pub(crate) fn consume(&mut self, maker: &AccountId, nonce: Num64) {
        let m = self.markets.get_mut(maker).expect("registry");
        m.consumed[nonce.0 as usize / 8] |= 1 << (nonce.0 % 8);
    }
    fn check_fee(&self, fee: &Fee) {
        require!(
            fee.asset == "NATIVE_NEAR" && fee.amount.0 <= payoff_math::Q / 100,
            "fee asset/cap"
        );
        self.account(&fee.receiver);
    }
    pub(crate) fn pay_fee(&mut self, fee: &Fee) {
        let a = self.accounts.get_mut(&fee.receiver).expect("fee receiver");
        a.free.0 = a.free.0.checked_add(fee.amount.0).expect("fee overflow");
    }
    fn trade_asset(&self, asset: &Asset) {
        if let Asset::P { series_id } | Asset::N { series_id } = asset {
            let s = self.series.get(series_id).expect("unknown series");
            require!(
                !s.closed
                    && s.final_price.is_none()
                    && env::block_timestamp() < s.config.maturity_ns.0,
                "series no longer tradable"
            );
        }
    }
    pub(crate) fn debit(&self, a: &mut LedgerAccount, asset: &Asset, amount: u128) {
        let balance = self.balance_mut(a, asset);
        balance.0 = balance.0.checked_sub(amount).expect("unfunded quote leg");
    }
    pub(crate) fn credit_asset(&self, a: &mut LedgerAccount, asset: &Asset, amount: u128) {
        let balance = self.balance_mut(a, asset);
        balance.0 = balance.0.checked_add(amount).expect("balance overflow");
    }
    fn balance_mut<'a>(&self, a: &'a mut LedgerAccount, asset: &Asset) -> &'a mut Amount {
        match asset {
            Asset::Collateral => &mut a.free,
            Asset::P { series_id } => {
                &mut a.positions[self.series.get(series_id).expect("series").slot as usize].p
            }
            Asset::N { series_id } => {
                &mut a.positions[self.series.get(series_id).expect("series").slot as usize].n
            }
        }
    }
    pub(crate) fn fill_event(
        &self,
        mode: &str,
        maker: &AccountId,
        taker: &AccountId,
        nonce: Num64,
        epoch: Num64,
        payload: &[u8],
    ) {
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({"standard":"hedgeveil_rfq","version":"1.0.0","event":"filled","data":[{"mode":mode,"maker":maker,"taker":taker,"nonce":nonce,"cancellation_epoch":epoch,"quote_digest":hex(&env::sha256(payload))}]})
        ));
    }
}

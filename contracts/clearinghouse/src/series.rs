use super::*;
use near_sdk::{serde_json::json, Gas, NearToken, Promise};
use protocol_types::{Resolution, SeriesConfig};
#[near]
impl Clearinghouse {
    #[payable]
    pub fn create_series(&mut self, config: SeriesConfig) {
        let before = self.ledgers();
        require!(!self.pauses.series, "series creation paused");
        self.account(&env::predecessor_account_id());
        config.validate();
        require!(
            config.oracle_account_id == self.oracle && config.oracle_version == self.oracle_version,
            "oracle not allowlisted"
        );
        require!(
            config.mint_cutoff_ns.0 > env::block_timestamp()
                && config.maturity_ns.0 > env::block_timestamp(),
            "terms must be future"
        );
        require!(config.max_supply.0 <= MAX_SUPPLY, "supply cap too high");
        require!(
            self.series.len() < MAX_SERIES
                && !self.series.contains_key(&config.series_id)
                && !self.archived_ids.contains_key(&config.series_id),
            "series cap or duplicate"
        );
        require!(
            env::attached_deposit().as_yoctonear() == self.minimum_storage() + CREATION_FEE,
            "exact series storage and fee required"
        );
        self.series_storage += self.minimum_storage();
        self.fees += CREATION_FEE;
        let id = config.series_id.clone();
        let slot = (0..MAX_SERIES as u8)
            .find(|slot| self.series.values().all(|s| s.slot != *slot))
            .expect("no free series slot");
        require!(
            self.accounts.values().all(|a| {
                let p = a.positions[slot as usize];
                p.p.0 == 0 && p.n.0 == 0
            }),
            "nonempty reusable slot"
        );
        self.series.insert(
            id,
            Series {
                config,
                slot,
                outstanding_p: Amount(0),
                outstanding_n: Amount(0),
                reserve: Amount(0),
                total_split: Amount(0),
                total_merged: Amount(0),
                total_paid: Amount(0),
                dust_released: Amount(0),
                final_price: None,
                p_coefficient: Amount(0),
                n_coefficient: Amount(0),
                closed: false,
                request: None,
                requested_at: Num64(0),
            },
        );
        self.finish("SERIES_CREATED", before, CREATION_FEE);
    }
    pub fn request_resolution(&mut self, series_id: String) -> Promise {
        let before = self.ledgers();
        let mut s = self.series.get(&series_id).expect("unknown series").clone();
        require!(
            env::block_timestamp() >= s.config.maturity_ns.0,
            "observation not ended"
        );
        require!(
            s.request.is_none()
                || env::block_timestamp()
                    >= s.requested_at
                        .0
                        .checked_add(5_000_000_000)
                        .expect("time overflow"),
            "request already pending"
        );
        let request = Num64(self.operation.checked_add(1).expect("sequence overflow"));
        s.request = Some(request);
        s.requested_at = Num64(env::block_timestamp());
        let oracle = s.config.oracle_account_id.clone();
        self.series.insert(series_id.clone(), s);
        self.finish("RESOLUTION_REQUESTED", before, 0);
        Promise::new(oracle)
            .function_call(
                "get_resolution",
                json!({"series_id":series_id}).to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(15),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_resolution",
                    json!({"series_id":series_id,"request_id":request,"version":1})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(CALLBACK_TGAS),
                ),
            )
    }
    #[private]
    pub fn on_resolution(&mut self, series_id: String, request_id: Num64, version: u8) -> bool {
        require!(
            version == 1 && env::promise_results_count() == 1,
            "bad callback"
        );
        let mut s = self.series.get(&series_id).expect("unknown series").clone();
        if s.request != Some(request_id) {
            return false;
        }
        let before = self.ledgers();
        s.request = None;
        let report = env::promise_result_checked(0, 4096)
            .ok()
            .and_then(|b| near_sdk::serde_json::from_slice::<Resolution>(&b).ok());
        let price = report
            .filter(|r| r.config == s.config && r.state == "FINALIZED")
            .and_then(|r| r.price)
            .filter(|p| p.0 > 0);
        let accepted = if let Some(price) = price {
            if let Some(existing) = s.final_price {
                existing == price
            } else {
                let coeff = payoff_math::coefficients(
                    s.config.strike.0,
                    price.0,
                    payoff_math::ZeroPricePolicy::Reject,
                )
                .expect("validated payoff");
                s.final_price = Some(price);
                s.p_coefficient = Amount(coeff.p());
                s.n_coefficient = Amount(coeff.n());
                true
            }
        } else {
            false
        };
        self.series.insert(series_id, s);
        self.finish(
            if accepted {
                "FINALIZED"
            } else {
                "RESOLUTION_REJECTED"
            },
            before,
            0,
        );
        accepted
    }
    #[payable]
    pub fn release_dust(&mut self, series_id: String) {
        let before = self.ledgers();
        self.one_yocto();
        let mut s = self.series.get(&series_id).expect("unknown series").clone();
        require!(
            s.final_price.is_some()
                && !s.closed
                && s.outstanding_p.0 == 0
                && s.outstanding_n.0 == 0,
            "outstanding claims or not final"
        );
        let dust = s.reserve.0;
        s.reserve = Amount(0);
        s.dust_released.0 += dust;
        s.closed = true;
        self.fees += dust;
        self.collateral -= dust;
        self.series.insert(series_id, s);
        self.finish("DUST_RELEASED", before, 1);
    }
    /// Retain immutable history; reclaim only a fully exited physical slot.
    #[payable]
    pub fn archive_series(&mut self, series_id: String) {
        let before = self.ledgers();
        self.one_yocto();
        require!(
            self.vault.is_none() && self.vault_roll.is_none(),
            "vault prevents archival"
        );
        let s = self
            .series
            .get(&series_id)
            .expect("unknown retained series")
            .clone();
        require!(
            s.closed
                && s.final_price.is_some()
                && env::block_timestamp() >= s.config.maturity_ns.0
                && s.outstanding_p.0 == 0
                && s.outstanding_n.0 == 0
                && s.reserve.0 == 0
                && s.request.is_none(),
            "series not fully exited"
        );
        require!(
            self.accounts.values().all(|a| {
                let p = a.positions[s.slot as usize];
                p.p.0 == 0 && p.n.0 == 0
            }),
            "outstanding account claims"
        );
        require!(
            !self.archived_ids.contains_key(&series_id),
            "archived ID exists"
        );
        let index = self.archived_series.len();
        require!(index < u32::MAX, "archive capacity");
        let commitment =
            near_sdk::borsh::to_vec(&(self.archive_commitment, &s)).expect("archive encoding");
        self.archive_commitment = env::sha256(&commitment).try_into().expect("hash length");
        self.archived_series.push(s);
        self.archived_ids.insert(series_id.clone(), index);
        self.archived_series.flush();
        self.archived_ids.flush();
        self.series.remove(&series_id);
        self.finish("SERIES_ARCHIVED", before, 1);
    }
}

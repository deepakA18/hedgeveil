use super::*;
use protocol_types::Asset;
#[near]
impl Clearinghouse {
    #[payable]
    pub fn split(&mut self, series_id: String, amount: Amount) {
        let before = self.ledgers();
        self.one_yocto();
        require!(
            !self.pauses.splits && amount.0 > 0,
            "splits paused or zero amount"
        );
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        let mut s = self.series.get(&series_id).expect("unknown series").clone();
        require!(
            s.final_price.is_none() && env::block_timestamp() < s.config.mint_cutoff_ns.0,
            "mint cutoff passed"
        );
        require!(
            s.outstanding_p.0.checked_add(amount.0).expect("overflow") <= s.config.max_supply.0,
            "series supply cap"
        );
        a.free.0 = a
            .free
            .0
            .checked_sub(amount.0)
            .expect("insufficient collateral");
        let pos = &mut a.positions[s.slot as usize];
        pos.p.0 += amount.0;
        pos.n.0 += amount.0;
        s.outstanding_p.0 += amount.0;
        s.outstanding_n.0 += amount.0;
        s.reserve.0 += amount.0;
        s.total_split.0 += amount.0;
        self.accounts.insert(who, a);
        self.series.insert(series_id, s);
        self.finish("SPLIT", before, 1);
    }
    #[payable]
    pub fn merge(&mut self, series_id: String, amount: Amount) {
        let before = self.ledgers();
        self.one_yocto();
        require!(amount.0 > 0, "positive amount required");
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        let mut s = self.series.get(&series_id).expect("unknown series").clone();
        require!(s.final_price.is_none(), "merge disabled after finalization");
        let pos = &mut a.positions[s.slot as usize];
        pos.p.0 = pos.p.0.checked_sub(amount.0).expect("insufficient P");
        pos.n.0 = pos.n.0.checked_sub(amount.0).expect("insufficient N");
        s.outstanding_p.0 -= amount.0;
        s.outstanding_n.0 -= amount.0;
        s.reserve.0 -= amount.0;
        s.total_merged.0 += amount.0;
        a.free.0 += amount.0;
        self.accounts.insert(who, a);
        self.series.insert(series_id, s);
        self.finish("MERGE", before, 1);
    }
    #[payable]
    pub fn transfer(&mut self, asset: Asset, amount: Amount, receiver: AccountId) {
        let before = self.ledgers();
        self.one_yocto();
        let who = env::predecessor_account_id();
        require!(amount.0 > 0 && who != receiver, "invalid transfer");
        let mut sender = self.account(&who);
        let mut to = self.account(&receiver);
        let is_p = matches!(&asset, Asset::P { .. });
        match asset {
            Asset::Collateral => {
                sender.free.0 = sender
                    .free
                    .0
                    .checked_sub(amount.0)
                    .expect("insufficient collateral");
                to.free.0 += amount.0;
            }
            Asset::P { series_id } | Asset::N { series_id } => {
                let s = self.series.get(&series_id).expect("unknown series");
                let slot = s.slot as usize;
                if is_p {
                    sender.positions[slot].p.0 = sender.positions[slot]
                        .p
                        .0
                        .checked_sub(amount.0)
                        .expect("insufficient P");
                    to.positions[slot].p.0 += amount.0;
                } else {
                    sender.positions[slot].n.0 = sender.positions[slot]
                        .n
                        .0
                        .checked_sub(amount.0)
                        .expect("insufficient N");
                    to.positions[slot].n.0 += amount.0;
                }
            }
        }
        self.accounts.insert(who, sender);
        self.accounts.insert(receiver, to);
        self.finish("TRANSFER", before, 1);
    }
    #[payable]
    pub fn redeem(&mut self, series_id: String, leg: String, amount: Amount) {
        let before = self.ledgers();
        self.one_yocto();
        require!(
            amount.0 > 0 && (leg == "P" || leg == "N"),
            "invalid redemption"
        );
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        let mut s = self.series.get(&series_id).expect("unknown series").clone();
        require!(s.final_price.is_some() && !s.closed, "not redeemable");
        let pos = &mut a.positions[s.slot as usize];
        let coefficient = if leg == "P" {
            pos.p.0 = pos.p.0.checked_sub(amount.0).expect("insufficient P");
            s.outstanding_p.0 -= amount.0;
            s.p_coefficient.0
        } else {
            pos.n.0 = pos.n.0.checked_sub(amount.0).expect("insufficient N");
            s.outstanding_n.0 -= amount.0;
            s.n_coefficient.0
        };
        let paid = payoff_math::redeem(amount.0, coefficient)
            .expect("payoff bounds")
            .payout;
        s.reserve.0 -= paid;
        s.total_paid.0 += paid;
        a.free.0 += paid;
        self.accounts.insert(who, a);
        self.series.insert(series_id, s);
        self.finish("REDEEMED", before, 1);
    }
}

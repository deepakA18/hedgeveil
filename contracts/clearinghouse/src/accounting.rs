use super::*;
use near_sdk::{
    serde_json::{json, Value},
    Promise,
};

#[near]
impl Clearinghouse {
    pub fn storage_quote(&self) -> Value {
        json!({"account_minimum":Amount(self.minimum_storage()),"series_storage":Amount(self.minimum_storage()),"creation_fee":Amount(CREATION_FEE),"storage_byte_cost":Amount(self.storage_byte_cost),"account_bytes":4096,"max_accounts":MAX_ACCOUNTS,"max_series":MAX_SERIES,"tickets_per_account":MAX_TICKETS_PER_ACCOUNT})
    }
    #[payable]
    pub fn storage_deposit(&mut self) {
        let before = self.ledgers();
        let who = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit > 0, "positive storage payment required");
        if let Some(existing) = self.accounts.get(&who) {
            require!(!existing.closing, "account closing");
            let mut a = existing.clone();
            a.storage_paid.0 = a.storage_paid.0.checked_add(deposit).expect("overflow");
            self.accounts.insert(who, a);
        } else {
            require!(self.accounts.len() < MAX_ACCOUNTS, "account cap");
            require!(
                deposit >= self.minimum_storage(),
                "insufficient storage prepayment"
            );
            self.accounts.insert(who, LedgerAccount::empty(deposit));
        }
        self.finish("STORAGE_DEPOSIT", before, 0);
    }
    #[payable]
    pub fn release_storage_excess(&mut self, amount: Amount) {
        let before = self.ledgers();
        self.one_yocto();
        require!(amount.0 > 0, "positive amount required");
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        a.storage_paid.0 = a
            .storage_paid
            .0
            .checked_sub(amount.0)
            .expect("insufficient storage");
        require!(
            a.storage_paid.0 >= self.minimum_storage(),
            "storage is reserved"
        );
        self.collateral_add(amount.0);
        a.free.0 = a.free.0.checked_add(amount.0).expect("overflow");
        self.accounts.insert(who, a);
        self.finish("STORAGE_RELEASED", before, 1);
    }
    #[payable]
    pub fn unregister(&mut self) -> Promise {
        let before = self.ledgers();
        self.one_yocto();
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        require!(
            a.free.0 == 0 && a.no_claims() && a.retained_tickets == 0,
            "account has obligations"
        );
        require!(
            self.vault
                .as_ref()
                .is_none_or(|v| !v.holders.contains_key(&who)),
            "account owns vault shares"
        );
        let amount = a.storage_paid;
        if let Some(market) = self.markets.get_mut(&who) {
            market.invalidate(market.epoch.0.checked_add(1).expect("epoch overflow"));
            for key in market.keys.values_mut() {
                key.revoked = true;
            }
        }
        a.storage_paid = Amount(0);
        a.closing = true;
        self.accounts.insert(who.clone(), a);
        let promise = self.schedule_payout(who.clone(), who, amount, TicketKind::StorageRefund, 0);
        self.finish("STORAGE_REFUND_REQUESTED", before, 1);
        promise
    }
    #[payable]
    pub fn deposit_collateral(&mut self) {
        let before = self.ledgers();
        require!(!self.pauses.deposits, "deposits paused");
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "positive deposit required");
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        self.collateral_add(amount);
        a.free.0 = a.free.0.checked_add(amount).expect("overflow");
        self.accounts.insert(who, a);
        self.finish("DEPOSIT", before, 0);
    }
    pub fn custody_snapshot(&self) -> Value {
        let free: u128 = self.accounts.values().map(|a| a.free.0).sum();
        let vault_cash = self.vault_amount(&protocol_types::Asset::Collateral);
        let reserves: u128 = self.series.values().map(|s| s.reserve.0).sum();
        let storage: u128 = self.accounts.values().map(|a| a.storage_paid.0).sum();
        let pending: u128 = self
            .tickets
            .values()
            .filter(|t| t.state == TicketState::Pending)
            .map(|t| t.amount.0)
            .sum();
        let unknown: u128 = self
            .tickets
            .values()
            .filter(|t| t.state == TicketState::Unknown)
            .map(|t| t.amount.0)
            .sum();
        let retained = free
            + vault_cash
            + self.vault_storage()
            + self.roll_storage()
            + reserves
            + storage
            + self.fees
            + self.series_storage
            + self.market_storage
            + OPERATING;
        let native = env::account_balance().as_yoctonear();
        json!({"native_balance":Amount(native),"free_collateral":Amount(free),"vault_collateral":Amount(vault_cash),"vault_storage_fund":Amount(self.vault_storage()),"roll_storage_fund":Amount(self.roll_storage()),"series_reserves":Amount(reserves),"refundable_storage":Amount(storage),"fees":Amount(self.fees),"series_storage_fund":Amount(self.series_storage),"market_storage_fund":Amount(self.market_storage),"operating_allocation":Amount(OPERATING),"pending_in_flight":Amount(pending),"unknown_in_flight":Amount(unknown),"tracked_user_collateral":Amount(self.collateral),"retained_categories":Amount(retained),"retained_categories_covered":native>=retained,"unallocated_or_in_flight_return":Amount(native.saturating_sub(retained)),"storage_bytes":Num64(env::storage_usage()),"storage_byte_cost":Amount(self.storage_byte_cost),"next_ticket_id":Num64(self.next_ticket),"operation_sequence":Num64(self.operation)})
    }
}

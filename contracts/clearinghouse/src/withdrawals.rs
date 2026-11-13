use super::*;
use near_sdk::{serde_json::json, Gas, NearToken, Promise, PromiseError};
#[near]
impl Clearinghouse {
    #[payable]
    pub fn request_withdrawal(&mut self, amount: Amount, receiver: AccountId) -> Promise {
        let before = self.ledgers();
        self.one_yocto();
        let who = env::predecessor_account_id();
        let mut a = self.account(&who);
        require!(amount.0 > 0, "positive amount required");
        a.free.0 = a
            .free
            .0
            .checked_sub(amount.0)
            .expect("insufficient free collateral");
        self.accounts.insert(who.clone(), a);
        let promise = self.schedule_payout(who, receiver, amount, TicketKind::Collateral, 0);
        self.finish("WITHDRAWAL_REQUESTED", before, 1);
        promise
    }
    pub fn mark_unknown(&mut self, ticket_id: Num64) {
        let before = self.ledgers();
        let mut t = self
            .tickets
            .get(&ticket_id.0)
            .expect("unknown ticket")
            .clone();
        require!(
            t.state == TicketState::Pending
                && env::block_timestamp()
                    >= t.created_ns
                        .0
                        .checked_add(5_000_000_000)
                        .expect("time overflow"),
            "not overdue pending"
        );
        t.state = TicketState::Unknown;
        self.tickets.insert(ticket_id.0, t);
        self.finish("WITHDRAWAL_UNKNOWN", before, 0);
    }
    #[private]
    pub fn on_withdrawal_result(&mut self, ticket_id: Num64, version: u8, fault: u8) -> String {
        #[cfg(feature = "fault-injection")]
        if fault == 1 {
            env::panic_str("injected callback panic");
        }
        require!(fault == 0 || fault == 2, "invalid callback mode");
        require!(
            version == CALLBACK_VERSION && env::promise_results_count() == 1,
            "invalid callback"
        );
        let Some(mut t) = self.tickets.get(&ticket_id.0).cloned() else {
            return "CLOSED".into();
        };
        require!(t.version == version, "version mismatch");
        if !matches!(t.state, TicketState::Pending | TicketState::Unknown) {
            return if t.state == TicketState::Succeeded {
                "SUCCEEDED"
            } else {
                "FAILED_CONFIRMED"
            }
            .into();
        }
        let before = self.ledgers();
        let mut a = self.accounts.get(&t.owner).expect("owner missing").clone();
        let (event, result) = match env::promise_result_checked(0, 0) {
            Ok(_) => {
                t.state = TicketState::Succeeded;
                if t.kind == TicketKind::Collateral {
                    self.collateral -= t.amount.0;
                    self.tickets.insert(t.id.0, t);
                } else {
                    self.accounts.remove(&t.owner);
                    self.tickets.remove(&t.id.0);
                }
                ("WITHDRAWAL_SUCCEEDED", "SUCCEEDED")
            }
            Err(PromiseError::Failed) => {
                t.state = TicketState::FailedConfirmed;
                t.balance_restored = true;
                if t.kind == TicketKind::Collateral {
                    a.free.0 = a.free.0.checked_add(t.amount.0).expect("overflow");
                } else {
                    a.storage_paid = t.amount;
                    a.closing = false;
                }
                self.accounts.insert(t.owner.clone(), a);
                self.tickets.insert(t.id.0, t);
                ("WITHDRAWAL_FAILED_CONFIRMED", "FAILED_CONFIRMED")
            }
            Err(_) => {
                t.state = TicketState::Unknown;
                self.tickets.insert(t.id.0, t);
                ("WITHDRAWAL_UNKNOWN", "UNKNOWN")
            }
        };
        self.finish(event, before, 0);
        result.into()
    }
    #[payable]
    pub fn close_ticket(&mut self, ticket_id: Num64) {
        let before = self.ledgers();
        self.one_yocto();
        let t = self
            .tickets
            .get(&ticket_id.0)
            .expect("unknown ticket")
            .clone();
        require!(
            t.owner == env::predecessor_account_id(),
            "ticket owner only"
        );
        require!(
            matches!(
                t.state,
                TicketState::Succeeded | TicketState::FailedConfirmed
            ),
            "unsettled ticket"
        );
        self.tickets.remove(&ticket_id.0);
        self.accounts
            .get_mut(&t.owner)
            .expect("owner missing")
            .retained_tickets -= 1;
        self.finish("TICKET_CLOSED", before, 1);
    }
    #[cfg(feature = "fault-injection")]
    #[payable]
    pub fn fault_withdrawal(&mut self, amount: Amount, receiver: AccountId, fault: u8) -> Promise {
        let before = self.ledgers();
        self.one_yocto();
        let who = env::predecessor_account_id();
        require!(
            who == self.guardian && (1..=2).contains(&fault),
            "fixture guardian only"
        );
        let mut a = self.account(&who);
        require!(amount.0 > 0, "positive amount required");
        a.free.0 = a
            .free
            .0
            .checked_sub(amount.0)
            .expect("insufficient free collateral");
        self.accounts.insert(who.clone(), a);
        let p = self.schedule_payout(who, receiver, amount, TicketKind::Collateral, fault);
        self.finish("WITHDRAWAL_REQUESTED", before, 1);
        p
    }
    #[cfg(feature = "fault-injection")]
    pub fn fault_replay(&self, ticket_id: Num64, malformed: bool) -> Promise {
        require!(
            env::predecessor_account_id() == self.guardian,
            "fixture guardian only"
        );
        Promise::new(env::current_account_id())
            .function_call(
                if malformed {
                    "fault_data"
                } else {
                    "fault_empty"
                },
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(5),
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_withdrawal_result",
                    json!({"ticket_id":ticket_id,"version":1,"fault":0})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(CALLBACK_TGAS),
                ),
            )
    }
    #[cfg(feature = "fault-injection")]
    #[private]
    pub fn fault_data(&self) -> String {
        "malformed native result".into()
    }
    #[cfg(feature = "fault-injection")]
    #[private]
    pub fn fault_empty(&self) {}
}
impl Clearinghouse {
    pub(crate) fn schedule_payout(
        &mut self,
        owner: AccountId,
        receiver: AccountId,
        amount: Amount,
        kind: TicketKind,
        fault: u8,
    ) -> Promise {
        let a = self.accounts.get_mut(&owner).expect("owner missing");
        require!(a.retained_tickets < MAX_TICKETS_PER_ACCOUNT, "ticket cap");
        a.retained_tickets += 1;
        let id = self.next_ticket;
        self.next_ticket = self.next_ticket.checked_add(1).expect("ticket overflow");
        self.tickets.insert(
            id,
            Ticket {
                id: Num64(id),
                owner,
                receiver: receiver.clone(),
                amount,
                kind,
                state: TicketState::Pending,
                created_ns: Num64(env::block_timestamp()),
                version: CALLBACK_VERSION,
                balance_restored: false,
            },
        );
        Promise::new(receiver)
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_withdrawal_result",
                    json!({"ticket_id":Num64(id),"version":1,"fault":fault})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    if fault == 2 {
                        Gas::from_gas(1)
                    } else {
                        Gas::from_tgas(CALLBACK_TGAS)
                    },
                ),
            )
    }
}

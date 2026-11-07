use super::*;
use near_sdk::{Gas, NearToken, Promise, PromiseError};
#[near]
impl SettlementOracle {
    #[payable]
    pub fn withdraw_credit(&mut self, amount: Amount, receiver: AccountId) -> Promise {
        self.one();
        self.dispatch(amount, receiver, 0)
    }
    #[private]
    pub fn on_credit_result(&mut self, ticket_id: Num64, version: u8, fault: u8) -> String {
        #[cfg(feature = "fault-injection")]
        if fault == 1 {
            env::panic_str("injected oracle callback panic");
        }
        require!(
            version == 1 && (fault == 0 || fault == 2) && env::promise_results_count() == 1,
            "invalid callback"
        );
        let Some(mut t) = self.tickets.get(&ticket_id.0).cloned() else {
            return "CLOSED".into();
        };
        if t.state != "PENDING" && t.state != "UNKNOWN" {
            return t.state;
        }
        match env::promise_result_checked(0, 0) {
            Ok(_) => {
                t.state = "SUCCEEDED".into();
                self.paid += t.amount.0;
            }
            Err(PromiseError::Failed) => {
                t.state = "FAILED_CONFIRMED".into();
                self.credit(&t.owner, t.amount.0);
            }
            Err(_) => {
                t.state = "UNKNOWN".into();
            }
        }
        let state = t.state.clone();
        self.tickets.insert(ticket_id.0, t);
        self.finish("CREDIT_RESULT", None);
        state
    }
    pub fn mark_unknown(&mut self, ticket_id: Num64) {
        let t = self.tickets.get_mut(&ticket_id.0).expect("unknown ticket");
        require!(
            t.state == "PENDING"
                && env::block_timestamp()
                    >= t.created_ns
                        .0
                        .checked_add(5_000_000_000)
                        .expect("time overflow"),
            "not overdue pending"
        );
        t.state = "UNKNOWN".into();
        self.finish("CREDIT_UNKNOWN", None);
    }
    #[payable]
    pub fn close_ticket(&mut self, ticket_id: Num64) {
        self.one();
        let t = self.tickets.get(&ticket_id.0).expect("unknown ticket");
        require!(
            t.owner == env::predecessor_account_id()
                && (t.state == "SUCCEEDED" || t.state == "FAILED_CONFIRMED"),
            "owner/terminal required"
        );
        self.tickets.remove(&ticket_id.0);
        self.finish("TICKET_CLOSED", None);
    }
    #[cfg(feature = "fault-injection")]
    #[payable]
    pub fn fault_withdraw(&mut self, amount: Amount, receiver: AccountId, fault: u8) -> Promise {
        self.one();
        require!(
            env::predecessor_account_id() == self.registrar && (1..=2).contains(&fault),
            "fixture registrar only"
        );
        self.dispatch(amount, receiver, fault)
    }
    #[cfg(feature = "fault-injection")]
    pub fn fault_replay(&self, ticket_id: Num64, malformed: bool) -> Promise {
        require!(
            env::predecessor_account_id() == self.registrar,
            "fixture registrar only"
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
                    "on_credit_result",
                    json!({"ticket_id":ticket_id,"version":1,"fault":0})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(60),
                ),
            )
    }
    #[cfg(feature = "fault-injection")]
    #[private]
    pub fn fault_data(&self) -> String {
        "not native transfer output".into()
    }
    #[cfg(feature = "fault-injection")]
    #[private]
    pub fn fault_empty(&self) {}
}
impl SettlementOracle {
    fn dispatch(&mut self, amount: Amount, receiver: AccountId, fault: u8) -> Promise {
        require!(
            amount.0 > 0 && self.tickets.len() < 32,
            "positive amount / ticket cap"
        );
        let owner = env::predecessor_account_id();
        let a = self.accounts.get_mut(&owner).expect("unregistered owner");
        a.credit.0 = a
            .credit
            .0
            .checked_sub(amount.0)
            .expect("insufficient credits");
        let id = self.next_ticket;
        self.next_ticket = self.next_ticket.checked_add(1).expect("ticket overflow");
        self.tickets.insert(
            id,
            Ticket {
                id: Num64(id),
                owner,
                receiver: receiver.clone(),
                amount,
                state: "PENDING".into(),
                created_ns: Num64(env::block_timestamp()),
            },
        );
        self.finish("CREDIT_REQUESTED", None);
        Promise::new(receiver)
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_credit_result",
                    json!({"ticket_id":Num64(id),"version":1,"fault":fault})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    if fault == 2 {
                        Gas::from_gas(1)
                    } else {
                        Gas::from_tgas(60)
                    },
                ),
            )
    }
}
